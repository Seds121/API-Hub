import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ParamDef } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { AppError, badRequest, notFound } from '../../common/http/app-error';
import type { AuthContext } from '../../common/auth-context';
import type { RequestMeta } from '../../common/decorators';
import { demoAllowed } from '../../config/env';
import { CredentialStore } from '../integrations/engine/credential-store';
import { EngineError, IntegrationEngine } from '../integrations/engine/integration-engine.service';
import {
  credentialSchema,
  integrationSchema,
  integrationTestSchema,
  integrationUpdateSchema,
  licenseDecisionSchema,
  licenseSchema,
  providerSchema,
  providerSubscriptionSchema,
  providerUpdateSchema,
} from './providers.schemas';

type ProviderInput = z.infer<typeof providerSchema>;
const dec = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Prisma.Decimal(v);

/** Safe projection: credentials are never selected with secret material. */
const CREDENTIAL_PUBLIC = {
  id: true,
  label: true,
  kind: true,
  hint: true,
  isActive: true,
  keyVersion: true,
  expiresAt: true,
  rotatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly enc: EncryptionService,
    private readonly creds: CredentialStore,
    private readonly engine: IntegrationEngine,
  ) {}

  private computeHosts(
    input: Partial<ProviderInput>,
    current?: { baseUrl: string; authConfig: unknown },
  ) {
    const baseUrl = input.baseUrl ?? current?.baseUrl;
    if (!baseUrl) return undefined;
    const u = new URL(baseUrl);
    const isMock = input.isMock ?? false;
    if (u.protocol !== 'https:' && !(isMock && demoAllowed()))
      throw badRequest('Provider base URL must use HTTPS.');
    if (u.username || u.password)
      throw badRequest('Do not put credentials in the base URL; add them as a credential.');
    const hosts = new Set<string>([
      u.hostname.toLowerCase(),
      ...(input.additionalAllowedHosts ?? []),
    ]);
    const tokenUrl = (input.authConfig ?? (current?.authConfig as ProviderInput['authConfig']))
      ?.tokenUrl;
    if (tokenUrl) hosts.add(new URL(tokenUrl).hostname.toLowerCase());
    return [...hosts];
  }

  list(q?: string) {
    return this.prisma.apiProvider.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q } }] }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { integrations: true } },
        credentials: { where: { isActive: true }, select: CREDENTIAL_PUBLIC },
        subscriptions: { where: { status: 'ACTIVE' }, orderBy: { startsAt: 'desc' }, take: 1 },
        licenses: { orderBy: { createdAt: 'desc' }, take: 3 },
        healthChecks: { orderBy: { checkedAt: 'desc' }, take: 1 },
      },
    });
  }

  listCredentials() {
    return this.prisma.providerCredential.findMany({
      select: {
        ...CREDENTIAL_PUBLIC,
        provider: { select: { id: true, name: true, kind: true, authType: true } },
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  listLicenses() {
    return this.prisma.providerLicense.findMany({
      include: {
        provider: { select: { id: true, name: true } },
        apiProduct: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listIntegrations() {
    return this.prisma.apiIntegration.findMany({
      include: {
        provider: { select: { id: true, name: true, kind: true, status: true } },
        endpoint: {
          select: {
            id: true,
            name: true,
            method: true,
            path: true,
            params: true,
            product: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  listEndpoints() {
    return this.prisma.apiEndpoint.findMany({
      include: {
        product: { select: { id: true, name: true, slug: true, status: true } },
        _count: { select: { integrations: { where: { isActive: true } } } },
      },
      orderBy: [{ productId: 'asc' }, { path: 'asc' }],
    });
  }

  async get(id: string) {
    const p = await this.prisma.apiProvider.findFirst({
      where: { id, deletedAt: null },
      include: {
        credentials: { select: CREDENTIAL_PUBLIC, orderBy: { createdAt: 'desc' } },
        subscriptions: { orderBy: { startsAt: 'desc' } },
        licenses: {
          orderBy: { createdAt: 'desc' },
          include: { apiProduct: { select: { id: true, name: true, slug: true } } },
        },
        integrations: {
          include: {
            endpoint: {
              select: {
                id: true,
                name: true,
                method: true,
                path: true,
                params: true,
                product: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
        healthChecks: { orderBy: { checkedAt: 'desc' }, take: 50 },
      },
    });
    if (!p) throw notFound('Provider');
    return { ...p, circuit: this.engine.breaker(p.id).snapshot };
  }

  async create(input: ProviderInput, auth: AuthContext, meta: RequestMeta) {
    if (input.isMock && !demoAllowed())
      throw badRequest('Mock providers cannot be created in production.');
    const allowedHosts = this.computeHosts(input)!;
    const { additionalAllowedHosts: _a, ...data } = input;
    const p = await this.prisma.apiProvider.create({
      data: {
        ...data,
        allowedHosts,
        authConfig: data.authConfig as Prisma.InputJsonValue,
        defaultHeaders: data.defaultHeaders,
      },
    });
    await this.audit.record({
      action: 'provider.create',
      actor: auth,
      targetType: 'ApiProvider',
      targetId: p.id,
      metadata: { name: p.name, kind: p.kind, baseUrl: p.baseUrl },
      meta,
    });
    return p;
  }

  async update(
    id: string,
    input: z.infer<typeof providerUpdateSchema>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    const cur = await this.prisma.apiProvider.findFirst({ where: { id, deletedAt: null } });
    if (!cur) throw notFound('Provider');
    if (input.isMock && !demoAllowed())
      throw badRequest('Mock providers cannot be enabled in production.');
    const allowedHosts = this.computeHosts(
      {
        ...input,
        isMock: input.isMock ?? cur.isMock,
        additionalAllowedHosts:
          input.additionalAllowedHosts ??
          cur.allowedHosts.filter((h) => h !== new URL(cur.baseUrl).hostname),
      },
      cur,
    );
    const { additionalAllowedHosts: _a, ...data } = input;
    const p = await this.prisma.apiProvider.update({
      where: { id },
      data: {
        ...data,
        allowedHosts,
        authConfig: data.authConfig as Prisma.InputJsonValue | undefined,
        rateLimitPerMinute: data.rateLimitPerMinute,
      },
    });
    this.creds.invalidate(id);
    await this.audit.record({
      action: 'provider.update',
      actor: auth,
      targetType: 'ApiProvider',
      targetId: id,
      metadata: { changes: Object.keys(input) },
      meta,
    });
    return p;
  }

  async remove(id: string, auth: AuthContext, meta: RequestMeta) {
    const active = await this.prisma.apiIntegration.count({
      where: { providerId: id, isActive: true, endpoint: { product: { status: 'PUBLISHED' } } },
    });
    if (active)
      throw new AppError(
        'CONFLICT',
        'Provider is used by published APIs. Disable or reassign those integrations first.',
      );
    await this.prisma.apiProvider.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DISABLED' },
    });
    await this.audit.record({
      action: 'provider.delete',
      actor: auth,
      targetType: 'ApiProvider',
      targetId: id,
      meta,
    });
  }

  // ── Credentials (write-only secrets) ──
  async addCredential(
    providerId: string,
    input: z.infer<typeof credentialSchema>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    await this.get(providerId);
    const s = input.secret;
    const required: Record<string, boolean> = {
      API_KEY: !!s.apiKey,
      BEARER_TOKEN: !!s.token,
      BASIC: !!s.username && s.password !== undefined,
      OAUTH2_CLIENT: !!s.clientId && !!s.clientSecret,
      HEADERS: !!s.headers && Object.keys(s.headers).length > 0,
    };
    if (!required[input.kind])
      throw badRequest(`Secret fields required for ${input.kind} are missing.`);
    const main =
      s.apiKey ??
      s.token ??
      s.clientSecret ??
      s.password ??
      Object.values(s.headers ?? {})[0] ??
      '';
    const hint = main.length >= 8 ? `••••${main.slice(-4)}` : '••••';
    const encd = this.enc.encryptJson(s, `provider:${providerId}`);
    const cred = await this.prisma.$transaction(async (tx) => {
      if (!input.keepPrevious)
        await tx.providerCredential.updateMany({
          where: { providerId, isActive: true },
          data: { isActive: false, rotatedAt: new Date() },
        });
      return tx.providerCredential.create({
        data: {
          providerId,
          label: input.label,
          kind: input.kind,
          ...encd,
          hint,
          expiresAt: input.expiresAt ?? null,
          createdById: auth.userId,
        },
        select: CREDENTIAL_PUBLIC,
      });
    });
    this.creds.invalidate(providerId);
    await this.audit.record({
      action: 'provider.credential.create',
      actor: auth,
      targetType: 'ProviderCredential',
      targetId: cred.id,
      metadata: { providerId, kind: input.kind, rotated: !input.keepPrevious },
      meta,
    });
    return cred;
  }

  async setCredentialActive(
    providerId: string,
    credId: string,
    isActive: boolean,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    const r = await this.prisma.providerCredential.updateMany({
      where: { id: credId, providerId },
      data: { isActive },
    });
    if (!r.count) throw notFound('Credential');
    this.creds.invalidate(providerId);
    await this.audit.record({
      action: isActive ? 'provider.credential.activate' : 'provider.credential.deactivate',
      actor: auth,
      targetType: 'ProviderCredential',
      targetId: credId,
      meta,
    });
  }

  // ── Supplier subscriptions ──
  async addSubscription(
    providerId: string,
    input: z.infer<typeof providerSubscriptionSchema>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    await this.get(providerId);
    const s = await this.prisma.providerSubscription.create({
      data: {
        ...input,
        providerId,
        monthlyFee: dec(input.monthlyFee),
        overagePricePerCall: dec(input.overagePricePerCall),
      },
    });
    await this.audit.record({
      action: 'provider.subscription.create',
      actor: auth,
      targetType: 'ProviderSubscription',
      targetId: s.id,
      metadata: { providerId, planName: s.planName },
      meta,
    });
    return s;
  }
  async updateSubscription(
    providerId: string,
    id: string,
    input: Partial<z.infer<typeof providerSubscriptionSchema>>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    const exists = await this.prisma.providerSubscription.findFirst({ where: { id, providerId } });
    if (!exists) throw notFound('Subscription');
    const s = await this.prisma.providerSubscription.update({
      where: { id },
      data: {
        ...input,
        monthlyFee: dec(input.monthlyFee),
        overagePricePerCall: dec(input.overagePricePerCall),
      },
    });
    await this.audit.record({
      action: 'provider.subscription.update',
      actor: auth,
      targetType: 'ProviderSubscription',
      targetId: id,
      meta,
    });
    return s;
  }

  // ── Licenses ──
  async addLicense(
    providerId: string,
    input: z.infer<typeof licenseSchema>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    await this.get(providerId);
    if (input.subResaleAllowed && !input.redistributionAllowed)
      throw badRequest('Sub-resale requires redistribution rights.');
    const l = await this.prisma.providerLicense.create({
      data: {
        ...input,
        providerId,
        status: 'PENDING',
        effectiveFrom: input.effectiveFrom ?? new Date(),
      },
    });
    await this.audit.record({
      action: 'license.create',
      actor: auth,
      targetType: 'ProviderLicense',
      targetId: l.id,
      metadata: {
        providerId,
        redistributionAllowed: l.redistributionAllowed,
        subResaleAllowed: l.subResaleAllowed,
      },
      meta,
    });
    return l;
  }

  /** Verifying a license is a separate, audited decision recorded with the verifying admin. */
  async decideLicense(
    providerId: string,
    id: string,
    input: z.infer<typeof licenseDecisionSchema>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    const l = await this.prisma.providerLicense.findFirst({ where: { id, providerId } });
    if (!l) throw notFound('License');
    if (input.decision === 'VERIFIED' && !l.documentRef && !l.evidenceNotes)
      throw badRequest('Record a document reference or evidence notes before verifying a license.');
    const updated = await this.prisma.providerLicense.update({
      where: { id },
      data: {
        status: input.decision,
        verifiedById: input.decision === 'VERIFIED' ? auth.userId : l.verifiedById,
        verifiedAt: input.decision === 'VERIFIED' ? new Date() : l.verifiedAt,
        evidenceNotes: input.notes
          ? `${l.evidenceNotes ?? ''}\n[${new Date().toISOString()}] ${input.notes}`.trim()
          : l.evidenceNotes,
      },
    });
    if (input.decision !== 'VERIFIED') await this.unpublishUnlicensed(providerId, auth, meta);
    await this.audit.record({
      action: `license.${input.decision.toLowerCase()}`,
      actor: auth,
      targetType: 'ProviderLicense',
      targetId: id,
      metadata: { providerId, notes: input.notes },
      meta,
    });
    return updated;
  }

  /** When a license is revoked/rejected, published products that lose coverage are disabled immediately. */
  private async unpublishUnlicensed(providerId: string, auth: AuthContext, meta: RequestMeta) {
    const products = await this.prisma.apiProduct.findMany({
      where: {
        status: 'PUBLISHED',
        endpoints: { some: { integrations: { some: { providerId, isActive: true } } } },
      },
      select: { id: true },
    });
    const now = new Date();
    for (const p of products) {
      const still = await this.prisma.providerLicense.count({
        where: {
          providerId,
          status: 'VERIFIED',
          redistributionAllowed: true,
          OR: [{ apiProductId: null }, { apiProductId: p.id }],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
      });
      if (!still) {
        await this.prisma.apiProduct.update({ where: { id: p.id }, data: { status: 'DISABLED' } });
        await this.audit.record({
          action: 'product.auto_disabled_license',
          actor: auth,
          targetType: 'ApiProduct',
          targetId: p.id,
          metadata: { providerId },
          meta,
        });
      }
    }
  }

  // ── Integrations ──
  async createIntegration(
    input: z.infer<typeof integrationSchema>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    const [endpoint, provider] = await Promise.all([
      this.prisma.apiEndpoint.findUnique({ where: { id: input.endpointId } }),
      this.prisma.apiProvider.findFirst({ where: { id: input.providerId, deletedAt: null } }),
    ]);
    if (!endpoint) throw notFound('Endpoint');
    if (!provider) throw notFound('Provider');
    this.assertPathParamsBound(input.upstreamPath, endpoint.params as ParamDef[]);
    const i = await this.prisma.apiIntegration.create({
      data: {
        ...input,
        queryMapping: input.queryMapping,
        headerMapping: input.headerMapping,
        bodyTemplate: (input.bodyTemplate ?? undefined) as Prisma.InputJsonValue,
        responseTransform: (input.responseTransform ?? undefined) as Prisma.InputJsonValue,
        costPerCall: dec(input.costPerCall),
      },
    });
    await this.audit.record({
      action: 'integration.create',
      actor: auth,
      targetType: 'ApiIntegration',
      targetId: i.id,
      metadata: { endpointId: i.endpointId, providerId: i.providerId },
      meta,
    });
    return i;
  }

  async updateIntegration(
    id: string,
    input: z.infer<typeof integrationUpdateSchema>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    const cur = await this.prisma.apiIntegration.findUnique({
      where: { id },
      include: { endpoint: true },
    });
    if (!cur) throw notFound('Integration');
    if (input.upstreamPath)
      this.assertPathParamsBound(input.upstreamPath, cur.endpoint.params as ParamDef[]);
    const i = await this.prisma.apiIntegration.update({
      where: { id },
      data: {
        ...input,
        bodyTemplate:
          input.bodyTemplate === undefined
            ? undefined
            : input.bodyTemplate === null
              ? Prisma.JsonNull
              : (input.bodyTemplate as Prisma.InputJsonValue),
        responseTransform:
          input.responseTransform === undefined
            ? undefined
            : input.responseTransform === null
              ? Prisma.JsonNull
              : (input.responseTransform as Prisma.InputJsonValue),
        costPerCall: dec(input.costPerCall),
      },
    });
    await this.audit.record({
      action: 'integration.update',
      actor: auth,
      targetType: 'ApiIntegration',
      targetId: id,
      metadata: { changes: Object.keys(input) },
      meta,
    });
    return i;
  }

  async deleteIntegration(id: string, auth: AuthContext, meta: RequestMeta) {
    await this.prisma.apiIntegration.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      action: 'integration.deactivate',
      actor: auth,
      targetType: 'ApiIntegration',
      targetId: id,
      meta,
    });
  }

  private assertPathParamsBound(path: string, params: ParamDef[]) {
    const names = new Set(params.filter((p) => p.in === 'path').map((p) => p.name));
    for (const m of path.matchAll(/\{([A-Za-z0-9_\-.]+)\}/g))
      if (!names.has(m[1]!))
        throw badRequest(
          `Upstream path placeholder {${m[1]}} has no matching path parameter on the endpoint.`,
        );
  }

  /** Admin "Test integration": real call through the engine, with full guards; result stored on the integration. */
  async testIntegration(
    id: string,
    input: z.infer<typeof integrationTestSchema>,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    const i = await this.prisma.apiIntegration.findUnique({
      where: { id },
      include: { provider: true, endpoint: true },
    });
    if (!i) throw notFound('Integration');
    const correlationId = `test_${meta.requestId}`;
    const started = Date.now();
    let result: {
      ok: boolean;
      status: number | null;
      latencyMs: number;
      error: string | null;
      bodyPreview: unknown;
      contentType: string | null;
    };
    try {
      const r = await this.engine.execute({
        provider: i.provider,
        integration: i,
        params: i.endpoint.params as ParamDef[],
        input: {
          pathParams: input.pathParams,
          query: input.query,
          headers: Object.fromEntries(
            Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v]),
          ),
          body: input.body,
        },
        correlationId,
        isTest: true,
      });
      const preview = r.json !== undefined ? r.json : r.raw.toString('utf8').slice(0, 2000);
      result = {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        latencyMs: r.upstreamLatencyMs,
        error: r.status >= 400 ? `Upstream HTTP ${r.status}` : null,
        bodyPreview: truncateJson(preview),
        contentType: r.contentType,
      };
    } catch (e) {
      const msg = e instanceof EngineError ? `${e.kind}: ${e.message}` : 'Unexpected error';
      result = {
        ok: false,
        status: null,
        latencyMs: Date.now() - started,
        error: msg,
        bodyPreview: e instanceof EngineError ? (e.details ?? null) : null,
        contentType: null,
      };
    }
    await this.prisma.apiIntegration.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: result.ok,
        lastTestStatus: result.status,
        lastTestError: result.error,
      },
    });
    await this.audit.record({
      action: 'integration.test',
      actor: auth,
      targetType: 'ApiIntegration',
      targetId: id,
      metadata: { ok: result.ok, status: result.status },
      meta,
    });
    return result;
  }

  async runHealthCheck(providerId: string) {
    const p = await this.prisma.apiProvider.findFirst({
      where: { id: providerId, deletedAt: null },
    });
    if (!p) throw notFound('Provider');
    const r = await this.engine.probe(p);
    const check = await this.prisma.providerHealthCheck.create({
      data: {
        providerId,
        ok: r.ok,
        statusCode: r.statusCode,
        latencyMs: r.latencyMs,
        error: r.error,
      },
    });
    if (p.status !== 'DISABLED') {
      const recent = await this.prisma.providerHealthCheck.findMany({
        where: { providerId },
        orderBy: { checkedAt: 'desc' },
        take: 3,
      });
      const fails = recent.filter((c) => !c.ok).length;
      const status = fails === 0 ? 'ACTIVE' : fails >= 3 ? 'DOWN' : 'DEGRADED';
      if (status !== p.status)
        await this.prisma.apiProvider.update({ where: { id: providerId }, data: { status } });
    }
    return check;
  }
}

function truncateJson(v: unknown): unknown {
  const s = JSON.stringify(v ?? null);
  return s.length > 8000 ? { truncated: true, preview: s.slice(0, 8000) } : v;
}
