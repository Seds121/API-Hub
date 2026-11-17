import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { money } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, badRequest, notFound } from '../../common/http/app-error';
import type { AuthContext } from '../../common/auth-context';
import type { RequestMeta } from '../../common/decorators';
import { env } from '../../config/env';
import { LicenseService } from '../licenses/license.service';
import { PricingService } from '../pricing/pricing.service';
import { buildProductOpenApi } from './openapi';
import { createProductFromTemplate, nextInternalCode } from './template-factory';
import * as S from './catalog.schemas';

const json = (v: unknown) =>
  v === undefined ? undefined : v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
const dec = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Prisma.Decimal(v);

/** Fields safe for public display (no integrations/providers/costs). */
const PUBLIC_ENDPOINT = {
  id: true,
  name: true,
  method: true,
  path: true,
  description: true,
  params: true,
  requestBodyExample: true,
  responseExample: true,
  errorCodes: true,
  rateLimitPerMinute: true,
  maxBodyBytes: true,
} as const;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly licenses: LicenseService,
    private readonly pricing: PricingService,
  ) {}

  // ───────── Public ─────────
  async categories() {
    const cats = await this.prisma.apiCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: { where: { status: 'PUBLISHED', deletedAt: null } } } },
      },
    });
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: c.icon,
      productCount: c._count.products,
    }));
  }

  async publishers() {
    const rows = await this.prisma.apiProduct.findMany({
      where: { status: 'PUBLISHED', deletedAt: null, publisherName: { not: null } },
      distinct: ['publisherName'],
      select: { publisherName: true },
      orderBy: { publisherName: 'asc' },
    });
    return rows.map((r) => r.publisherName!);
  }

  async search(q: z.infer<typeof S.catalogQuery>) {
    const where: Prisma.ApiProductWhereInput = {
      status: 'PUBLISHED',
      deletedAt: null,
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.publisher ? { publisherName: q.publisher } : {}),
      ...(q.pricing === 'subscription'
        ? { requiresSubscription: true }
        : q.pricing === 'pay-per-request'
          ? { requiresSubscription: false }
          : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { summary: { contains: q.q, mode: 'insensitive' } },
              { tags: { has: q.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.apiProduct.findMany({
      where,
      include: {
        category: { select: { name: true, slug: true } },
        pricingRules: {
          where: { scope: 'PRODUCT_DEFAULT', isActive: true },
          take: 1,
          orderBy: { validFrom: 'desc' },
        },
        _count: { select: { endpoints: { where: { isActive: true } } } },
      },
    });
    let items = rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      summary: p.summary,
      category: p.category,
      tags: p.tags,
      publisherName: p.publisherName,
      logoUrl: p.logoUrl,
      isFeatured: p.isFeatured,
      requiresSubscription: p.requiresSubscription,
      popularity: p.popularity,
      endpointCount: p._count.endpoints,
      pricePerRequest: p.pricingRules[0]
        ? money(p.pricingRules[0].pricePerRequest).toFixed(6)
        : null,
      currency: p.pricingRules[0]?.currency ?? 'USD',
      publishedAt: p.publishedAt,
      isDemo: p.isDemo,
    }));
    if (q.maxPrice !== undefined)
      items = items.filter(
        (i) => i.pricePerRequest !== null && Number(i.pricePerRequest) <= q.maxPrice!,
      );
    const sorters: Record<
      string,
      (a: (typeof items)[number], b: (typeof items)[number]) => number
    > = {
      popular: (a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name),
      newest: (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      name: (a, b) => a.name.localeCompare(b.name),
      price: (a, b) =>
        Number(a.pricePerRequest ?? Infinity) - Number(b.pricePerRequest ?? Infinity),
    };
    items.sort(sorters[q.sort]);
    const total = items.length;
    const start = (q.page - 1) * q.pageSize;
    return {
      items: items.slice(start, start + q.pageSize),
      total,
      page: q.page,
      pageSize: q.pageSize,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  async productBySlug(slug: string, opts: { includeUnpublished?: boolean } = {}) {
    const p = await this.prisma.apiProduct.findFirst({
      where: { slug, deletedAt: null, ...(opts.includeUnpublished ? {} : { status: 'PUBLISHED' }) },
      include: {
        category: { select: { name: true, slug: true } },
        endpoints: {
          where: { isActive: true },
          select: PUBLIC_ENDPOINT,
          orderBy: [{ path: 'asc' }, { method: 'asc' }],
        },
      },
    });
    if (!p) throw notFound('API');
    const prices = await this.pricing.listPrices(p.id);
    const { docsMarkdown, ...rest } = p;
    return {
      ...rest,
      docsMarkdown,
      baseUrl: `${env().API_PUBLIC_URL}/v1/${p.slug}`,
      pricing: {
        currency: prices.currency,
        defaultPricePerRequest: prices.defaultPricePerRequest,
        endpoints: p.endpoints.map((e) => ({
          endpointId: e.id,
          pricePerRequest: prices.endpoints[e.id] ?? prices.defaultPricePerRequest,
        })),
      },
    };
  }

  async openapi(slug: string) {
    const p = await this.prisma.apiProduct.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
      include: { endpoints: true },
    });
    if (!p) throw notFound('API');
    const prices = await this.pricing.listPrices(p.id);
    const perEndpoint = Object.fromEntries(
      p.endpoints.map((e) => [e.id, prices.endpoints[e.id] ?? prices.defaultPricePerRequest]),
    );
    return buildProductOpenApi(p, {
      baseUrl: env().API_PUBLIC_URL,
      companyName: env().COMPANY_NAME,
      prices: perEndpoint,
      currency: prices.currency,
    });
  }

  publicPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
  }

  // ───────── Admin: categories ─────────
  async createCategory(b: z.infer<typeof S.categorySchema>, a: AuthContext, m: RequestMeta) {
    const c = await this.prisma.apiCategory.create({ data: b });
    await this.audit.record({
      action: 'category.create',
      actor: a,
      targetType: 'ApiCategory',
      targetId: c.id,
      metadata: { slug: c.slug },
      meta: m,
    });
    return c;
  }
  async updateCategory(
    id: string,
    b: Partial<z.infer<typeof S.categorySchema>>,
    a: AuthContext,
    m: RequestMeta,
  ) {
    const c = await this.prisma.apiCategory.update({ where: { id }, data: b });
    await this.audit.record({
      action: 'category.update',
      actor: a,
      targetType: 'ApiCategory',
      targetId: id,
      meta: m,
    });
    return c;
  }
  async deleteCategory(id: string, a: AuthContext, m: RequestMeta) {
    const n = await this.prisma.apiProduct.count({ where: { categoryId: id, deletedAt: null } });
    if (n) throw new AppError('CONFLICT', 'Category still has APIs. Move them first.');
    await this.prisma.apiCategory.delete({ where: { id } });
    await this.audit.record({
      action: 'category.delete',
      actor: a,
      targetType: 'ApiCategory',
      targetId: id,
      meta: m,
    });
  }

  // ───────── Admin: products ─────────
  adminProducts(q?: string, status?: string) {
    return this.prisma.apiProduct.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { slug: { contains: q } },
                { internalCode: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { name: true } },
        _count: { select: { endpoints: true, usageRecords: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async adminProduct(id: string) {
    const p = await this.prisma.apiProduct.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        endpoints: {
          orderBy: [{ path: 'asc' }],
          include: {
            integrations: {
              include: { provider: { select: { id: true, name: true, kind: true, status: true } } },
              orderBy: { priority: 'asc' },
            },
          },
        },
        pricingRules: {
          orderBy: { createdAt: 'desc' },
          include: { org: { select: { id: true, name: true } } },
        },
        licenses: true,
      },
    });
    if (!p) throw notFound('API');
    return { ...p, licensing: await this.licenses.productLicensed(p.id) };
  }

  /** One-click DRAFT product from a connector template (see packages/shared/src/connectors.ts). */
  async createFromTemplate(providerId: string, templateId: string, a: AuthContext, m: RequestMeta) {
    const r = await this.prisma.$transaction((tx) =>
      createProductFromTemplate(tx, { providerId, templateId }),
    );
    await this.audit.record({
      action: 'product.create_from_template',
      actor: a,
      targetType: 'ApiProduct',
      targetId: r.product.id,
      metadata: { providerId, templateId, slug: r.product.slug },
      meta: m,
    });
    return {
      productId: r.product.id,
      slug: r.product.slug,
      internalCode: r.product.internalCode,
      suggestedPricePerRequest: r.template.suggestedPricePerRequest,
    };
  }

  async createProduct(b: z.infer<typeof S.productSchema>, a: AuthContext, m: RequestMeta) {
    const p = await this.prisma.$transaction(async (tx) =>
      tx.apiProduct.create({
        data: { ...b, internalCode: await nextInternalCode(tx), status: 'DRAFT' },
      }),
    );
    await this.audit.record({
      action: 'product.create',
      actor: a,
      targetType: 'ApiProduct',
      targetId: p.id,
      metadata: { slug: p.slug, internalCode: p.internalCode },
      meta: m,
    });
    return p;
  }

  async updateProduct(
    id: string,
    b: z.infer<typeof S.productUpdateSchema>,
    a: AuthContext,
    m: RequestMeta,
  ) {
    const p = await this.prisma.apiProduct.update({ where: { id }, data: b });
    await this.audit.record({
      action: 'product.update',
      actor: a,
      targetType: 'ApiProduct',
      targetId: id,
      metadata: { changes: Object.keys(b) },
      meta: m,
    });
    return p;
  }

  /** Publishing requires: active endpoint(s), active integration per endpoint, a price, and verified redistribution rights. */
  async publish(id: string, a: AuthContext, m: RequestMeta) {
    const p = await this.prisma.apiProduct.findFirst({
      where: { id, deletedAt: null },
      include: {
        endpoints: {
          where: { isActive: true },
          include: { integrations: { where: { isActive: true } } },
        },
      },
    });
    if (!p) throw notFound('API');
    const problems: string[] = [];
    if (!p.endpoints.length) problems.push('Add at least one active endpoint.');
    for (const e of p.endpoints)
      if (!e.integrations.length)
        problems.push(`Endpoint ${e.method} ${e.path} has no active upstream integration.`);
    const prices = await this.pricing.listPrices(p.id);
    for (const e of p.endpoints)
      if (!prices.endpoints[e.id] && !prices.defaultPricePerRequest)
        problems.push(`Endpoint ${e.method} ${e.path} has no price.`);
    const lic = await this.licenses.productLicensed(p.id);
    for (const miss of lic.missing)
      problems.push(`No verified redistribution license for provider "${miss.providerName}".`);
    if (lic.missing.length)
      throw new AppError('LICENSE_REQUIRED', 'This API cannot be published yet.', problems);
    if (problems.length) throw badRequest('This API cannot be published yet.', problems);
    const up = await this.prisma.apiProduct.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: p.publishedAt ?? new Date() },
    });
    await this.audit.record({
      action: 'product.publish',
      actor: a,
      targetType: 'ApiProduct',
      targetId: id,
      meta: m,
    });
    return up;
  }

  async setStatus(id: string, status: 'DISABLED' | 'DRAFT', a: AuthContext, m: RequestMeta) {
    const up = await this.prisma.apiProduct.update({ where: { id }, data: { status } });
    await this.audit.record({
      action: `product.${status.toLowerCase()}`,
      actor: a,
      targetType: 'ApiProduct',
      targetId: id,
      meta: m,
    });
    return up;
  }

  async deleteProduct(id: string, a: AuthContext, m: RequestMeta) {
    await this.prisma.apiProduct.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'DISABLED',
        slug: `deleted-${id.slice(0, 8)}-${Date.now()}`,
      },
    });
    await this.audit.record({
      action: 'product.delete',
      actor: a,
      targetType: 'ApiProduct',
      targetId: id,
      meta: m,
    });
  }

  // ───────── Admin: endpoints ─────────
  async createEndpoint(
    productId: string,
    b: z.infer<typeof S.endpointSchema>,
    a: AuthContext,
    m: RequestMeta,
  ) {
    this.assertPathParams(b.path, b.params);
    const e = await this.prisma.apiEndpoint.create({
      data: {
        ...b,
        productId,
        params: b.params,
        requestBodyExample: json(b.requestBodyExample),
        responseExample: json(b.responseExample),
        errorCodes: json(b.errorCodes),
      },
    });
    await this.audit.record({
      action: 'endpoint.create',
      actor: a,
      targetType: 'ApiEndpoint',
      targetId: e.id,
      metadata: { productId, method: e.method, path: e.path },
      meta: m,
    });
    return e;
  }
  async updateEndpoint(
    id: string,
    b: z.infer<typeof S.endpointUpdateSchema>,
    a: AuthContext,
    m: RequestMeta,
  ) {
    const cur = await this.prisma.apiEndpoint.findUnique({ where: { id } });
    if (!cur) throw notFound('Endpoint');
    this.assertPathParams(b.path ?? cur.path, (b.params ?? cur.params) as S.EndpointParam[]);
    const e = await this.prisma.apiEndpoint.update({
      where: { id },
      data: {
        ...b,
        params: b.params,
        requestBodyExample: json(b.requestBodyExample),
        responseExample: json(b.responseExample),
        errorCodes: json(b.errorCodes),
      },
    });
    await this.audit.record({
      action: 'endpoint.update',
      actor: a,
      targetType: 'ApiEndpoint',
      targetId: id,
      meta: m,
    });
    return e;
  }
  async deleteEndpoint(id: string, a: AuthContext, m: RequestMeta) {
    await this.prisma.apiEndpoint.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      action: 'endpoint.deactivate',
      actor: a,
      targetType: 'ApiEndpoint',
      targetId: id,
      meta: m,
    });
  }
  private assertPathParams(path: string, params: S.EndpointParam[]) {
    const declared = new Set(params.filter((p) => p.in === 'path').map((p) => p.name));
    const used = [...path.matchAll(/\{([A-Za-z0-9_\-.]+)\}/g)].map((x) => x[1]!);
    for (const u of used)
      if (!declared.has(u))
        throw badRequest(`Path placeholder {${u}} must be declared as a path parameter.`);
    for (const d of declared)
      if (!used.includes(d)) throw badRequest(`Path parameter "${d}" is not used in the path.`);
  }

  // ───────── Admin: pricing ─────────
  async listPricing(filter: { productId?: string; orgId?: string }) {
    return this.prisma.pricingRule.findMany({
      where: {
        ...(filter.productId
          ? { OR: [{ productId: filter.productId }, { endpoint: { productId: filter.productId } }] }
          : {}),
        ...(filter.orgId ? { orgId: filter.orgId } : {}),
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        endpoint: { select: { id: true, name: true, method: true, path: true } },
        org: { select: { id: true, name: true } },
      },
      orderBy: [{ scope: 'asc' }, { createdAt: 'desc' }],
    });
  }
  async createPricing(b: z.infer<typeof S.pricingRuleSchema>, a: AuthContext, m: RequestMeta) {
    let productId = b.productId ?? null;
    if (b.endpointId) {
      const e = await this.prisma.apiEndpoint.findUnique({ where: { id: b.endpointId } });
      if (!e) throw notFound('Endpoint');
      productId = e.productId;
    }
    const r = await this.prisma.$transaction(async (tx) => {
      // One active rule per exact target: deactivate the previous one (history retained).
      await tx.pricingRule.updateMany({
        where: {
          scope: b.scope,
          productId: b.scope === 'ENDPOINT' ? undefined : productId,
          endpointId: b.endpointId ?? null,
          orgId: b.orgId ?? null,
          isActive: true,
        },
        data: { isActive: false, validTo: new Date() },
      });
      return tx.pricingRule.create({
        data: {
          ...b,
          productId,
          pricePerRequest: new Prisma.Decimal(b.pricePerRequest),
          discountPercent: dec(b.discountPercent),
          minWalletBalance: dec(b.minWalletBalance),
          validFrom: b.validFrom ?? new Date(),
        },
      });
    });
    await this.audit.record({
      action: 'pricing.create',
      actor: a,
      targetType: 'PricingRule',
      targetId: r.id,
      metadata: {
        scope: r.scope,
        productId,
        endpointId: r.endpointId,
        orgId: r.orgId,
        price: b.pricePerRequest,
      },
      meta: m,
    });
    return r;
  }
  async deactivatePricing(id: string, a: AuthContext, m: RequestMeta) {
    await this.prisma.pricingRule.update({
      where: { id },
      data: { isActive: false, validTo: new Date() },
    });
    await this.audit.record({
      action: 'pricing.deactivate',
      actor: a,
      targetType: 'PricingRule',
      targetId: id,
      meta: m,
    });
  }

  // ───────── Admin: plans ─────────
  adminPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }],
      include: { _count: { select: { subscriptions: { where: { status: 'ACTIVE' } } } } },
    });
  }
  async createPlan(b: z.infer<typeof S.planSchema>, a: AuthContext, m: RequestMeta) {
    if (b.type === 'SUBSCRIPTION' && !b.interval)
      throw badRequest('Subscription plans need an interval.');
    const p = await this.prisma.subscriptionPlan.create({
      data: {
        ...b,
        price: new Prisma.Decimal(b.price),
        overagePricePerRequest: dec(b.overagePricePerRequest),
        creditGrant: new Prisma.Decimal(b.creditGrant),
        discountPercent: new Prisma.Decimal(b.discountPercent),
      },
    });
    await this.audit.record({
      action: 'plan.create',
      actor: a,
      targetType: 'SubscriptionPlan',
      targetId: p.id,
      metadata: { code: p.code },
      meta: m,
    });
    return p;
  }
  async updatePlan(
    id: string,
    b: Partial<z.infer<typeof S.planSchema>>,
    a: AuthContext,
    m: RequestMeta,
  ) {
    const p = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...b,
        price: dec(b.price) ?? undefined,
        overagePricePerRequest: dec(b.overagePricePerRequest),
        creditGrant: dec(b.creditGrant) ?? undefined,
        discountPercent: dec(b.discountPercent) ?? undefined,
      },
    });
    await this.audit.record({
      action: 'plan.update',
      actor: a,
      targetType: 'SubscriptionPlan',
      targetId: id,
      metadata: { changes: Object.keys(b) },
      meta: m,
    });
    return p;
  }
}
