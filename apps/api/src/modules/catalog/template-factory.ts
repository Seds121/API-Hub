import { Prisma } from '@prisma/client';
import { connectorTemplate, paramDefSchema } from '@zeze/shared';
import type { Tx } from '../../common/prisma.service';
import { AppError, badRequest, notFound } from '../../common/http/app-error';

export async function nextInternalCode(tx: Tx) {
  const n = await tx.apiProduct.count();
  for (let i = n + 1; ; i++) {
    const code = `ZZ-API-${String(i).padStart(4, '0')}`;
    if (!(await tx.apiProduct.findUnique({ where: { internalCode: code } }))) return code;
  }
}

/**
 * Creates a connector template's product (DRAFT), endpoint and integration bound to a provider,
 * inside the caller's transaction. Never creates a price or license and never publishes: the
 * normal publish gate (verified redistribution license + price) still applies.
 */
export async function createProductFromTemplate(
  tx: Tx,
  args: { providerId: string; templateId: string; isDemo?: boolean },
) {
  const provider = await tx.apiProvider.findFirst({
    where: { id: args.providerId, deletedAt: null },
  });
  if (!provider) throw notFound('Provider');
  const t = connectorTemplate(provider.kind, args.templateId);
  if (!t)
    throw badRequest(
      `Template "${args.templateId}" is not available for ${provider.kind} providers.`,
    );
  const params = t.endpoint.params.map((p) => paramDefSchema.parse(p));
  if (await tx.apiProduct.findFirst({ where: { slug: t.product.slug } })) {
    throw new AppError(
      'CONFLICT',
      `An API with slug "${t.product.slug}" already exists. Edit it instead, or delete it first.`,
    );
  }
  const category = await tx.apiCategory.upsert({
    where: { slug: t.product.categorySlug },
    create: { slug: t.product.categorySlug, name: t.product.categoryName },
    update: {},
  });
  const product = await tx.apiProduct.create({
    data: {
      internalCode: await nextInternalCode(tx),
      slug: t.product.slug,
      name: t.product.name,
      summary: t.product.summary,
      description: t.product.docsMarkdown,
      docsMarkdown: t.product.docsMarkdown,
      categoryId: category.id,
      publisherName: t.product.publisherName,
      tags: t.product.tags,
      usageRestrictions: t.product.usageRestrictions,
      defaultRateLimitPerMinute: t.product.defaultRateLimitPerMinute,
      status: 'DRAFT',
      isDemo: args.isDemo ?? false,
    },
  });
  const endpoint = await tx.apiEndpoint.create({
    data: {
      productId: product.id,
      name: t.endpoint.name,
      method: t.endpoint.method,
      path: t.endpoint.path,
      description: t.endpoint.description,
      params: params as Prisma.InputJsonValue,
      responseExample: t.endpoint.responseExample as Prisma.InputJsonValue,
    },
  });
  const integration = await tx.apiIntegration.create({
    data: {
      endpointId: endpoint.id,
      providerId: provider.id,
      upstreamMethod: t.integration.upstreamMethod,
      upstreamPath: t.integration.upstreamPath,
      queryMapping: { map: t.integration.queryMap ?? {} },
      // Supplier cost unknown until the admin records it — never guessed.
      costPerCall: null,
      costIsEstimated: true,
    },
  });
  return { product, endpoint, integration, template: t };
}
