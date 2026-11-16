import { z } from 'zod';
import { HTTP_METHODS, moneyStringSchema, paramDefSchema } from '@zeze/shared';

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/, 'lowercase letters, digits and dashes');

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug,
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  summary: z.string().trim().min(10).max(300),
  description: z.string().max(20000).optional().nullable(),
  docsMarkdown: z.string().max(100000).optional().nullable(),
  categoryId: z.string().uuid(),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  publisherName: z.string().max(80).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  usageRestrictions: z.string().max(5000).optional().nullable(),
  isFeatured: z.boolean().default(false),
  requiresSubscription: z.boolean().default(false),
  defaultRateLimitPerMinute: z.coerce.number().int().min(1).max(100000).default(60),
});
export const productUpdateSchema = productSchema.partial();

const ROUTE_PATH = /^\/[A-Za-z0-9_\-./{}]*$/;
export const endpointSchema = z.object({
  name: z.string().trim().min(2).max(120),
  method: z.enum(HTTP_METHODS),
  path: z
    .string()
    .max(200)
    .regex(ROUTE_PATH, 'Path must start with / and contain only letters, digits, -, _, ., {param}')
    .refine((p) => !p.includes('..') && !p.includes('//'), 'Invalid path'),
  description: z.string().max(5000).optional().nullable(),
  params: z.array(paramDefSchema).max(50).default([]),
  requestBodyExample: z.unknown().optional().nullable(),
  responseExample: z.unknown().optional().nullable(),
  errorCodes: z
    .array(
      z.object({
        status: z.number().int(),
        code: z.string().max(60),
        description: z.string().max(300),
      }),
    )
    .optional()
    .nullable(),
  maxBodyBytes: z.coerce.number().int().min(0).max(1_048_576).default(65536),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  isActive: z.boolean().default(true),
});
export const endpointUpdateSchema = endpointSchema.partial();
export type EndpointParam = z.infer<typeof paramDefSchema>;

export const pricingRuleSchema = z
  .object({
    scope: z.enum(['PRODUCT_DEFAULT', 'ENDPOINT', 'ORGANIZATION', 'AGENCY_WHOLESALE']),
    productId: z.string().uuid().optional().nullable(),
    endpointId: z.string().uuid().optional().nullable(),
    orgId: z.string().uuid().optional().nullable(),
    pricePerRequest: moneyStringSchema.refine((v) => Number(v) >= 0, 'Price cannot be negative'),
    currency: z.string().length(3).default('USD'),
    discountPercent: moneyStringSchema
      .refine((v) => Number(v) >= 0 && Number(v) <= 100, '0-100')
      .optional()
      .nullable(),
    minWalletBalance: moneyStringSchema.optional().nullable(),
    chargeOnClientError: z.boolean().default(false),
    isActive: z.boolean().default(true),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional().nullable(),
  })
  .superRefine((r, ctx) => {
    const need = (cond: unknown, msg: string) =>
      !cond && ctx.addIssue({ code: 'custom', message: msg });
    if (r.scope === 'PRODUCT_DEFAULT')
      need(r.productId && !r.endpointId && !r.orgId, 'PRODUCT_DEFAULT needs productId only');
    if (r.scope === 'ENDPOINT') need(r.endpointId && !r.orgId, 'ENDPOINT needs endpointId');
    if (r.scope === 'ORGANIZATION')
      need(
        r.orgId && (r.productId || r.endpointId),
        'ORGANIZATION needs orgId and productId or endpointId',
      );
    if (r.scope === 'AGENCY_WHOLESALE')
      need(r.orgId && r.productId, 'AGENCY_WHOLESALE needs orgId and productId');
  });

export const planSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,40}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().max(1000).optional().nullable(),
  type: z.enum(['SUBSCRIPTION', 'PREPAID', 'PAYG', 'ENTERPRISE']),
  interval: z.enum(['MONTHLY', 'ANNUAL']).optional().nullable(),
  price: moneyStringSchema.refine((v) => Number(v) >= 0, 'Price cannot be negative'),
  currency: z.string().length(3).default('USD'),
  includedRequests: z.coerce.number().int().min(0).default(0),
  overagePricePerRequest: moneyStringSchema.optional().nullable(),
  creditGrant: moneyStringSchema.default('0'),
  discountPercent: moneyStringSchema.default('0'),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(100000).default(60),
  features: z.array(z.string().max(120)).max(20).default([]),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const catalogQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(60).optional(),
  publisher: z.string().max(80).optional(),
  pricing: z.enum(['all', 'pay-per-request', 'subscription']).default('all'),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['popular', 'newest', 'name', 'price']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
});
