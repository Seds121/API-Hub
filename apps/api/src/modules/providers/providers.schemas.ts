import { z } from 'zod';
import { CONNECTOR_KINDS, connectorDef, HTTP_METHODS, moneyStringSchema } from '@zeze/shared';

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]{1,253}$/, 'Invalid hostname');
/** Exact headers that must never be static, plus any secret-looking name (e.g. X-Subscription-Token, X-Api-Key). */
const FORBIDDEN_STATIC_HEADERS =
  /^(authorization|cookie|host|x-rapidapi-key|proxy-authorization|content-length)$|token|secret|api-?key|password|passwd|auth/i;
const headerRecord = z
  .record(
    z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
    z
      .string()
      .max(500)
      .refine((v) => !/[\r\n]/.test(v), 'Invalid header value'),
  )
  .refine(
    (r) => Object.keys(r).every((k) => !FORBIDDEN_STATIC_HEADERS.test(k)),
    'Secret headers must be stored as credentials, not static headers',
  );

const providerBase = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/),
  kind: z.enum(CONNECTOR_KINDS),
  description: z.string().max(2000).optional().nullable(),
  website: z.string().url().optional().nullable(),
  /** Optional for connectors with a registry default (e.g. Brave). */
  baseUrl: z.string().url().max(500).optional(),
  additionalAllowedHosts: z.array(hostname).max(10).default([]),
  authType: z
    .enum(['NONE', 'API_KEY', 'BEARER', 'BASIC', 'OAUTH2', 'CUSTOM_HEADERS'])
    .default('API_KEY'),
  authConfig: z
    .object({
      rapidApiHost: hostname.optional(),
      in: z.enum(['header', 'query']).optional(),
      name: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,64}$/)
        .optional(),
      tokenUrl: z.string().url().optional(),
      scope: z.string().max(500).optional(),
      audience: z.string().max(500).optional(),
    })
    .default({}),
  defaultHeaders: headerRecord.default({}),
  timeoutMs: z.coerce.number().int().min(500).max(60000).default(10000),
  retryMaxAttempts: z.coerce.number().int().min(0).max(5).default(1),
  retryBackoffMs: z.coerce.number().int().min(0).max(10000).default(300),
  retryOnStatuses: z.array(z.number().int().min(400).max(599)).default([502, 503, 504]),
  maxConcurrency: z.coerce.number().int().min(1).max(1000).default(20),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
  healthCheckPath: z
    .string()
    .regex(/^\/[^\s]*$/)
    .max(300)
    .optional()
    .nullable(),
  status: z.enum(['ACTIVE', 'DEGRADED', 'DOWN', 'DISABLED']).default('ACTIVE'),
  isMock: z.boolean().default(false),
});
export const providerSchema = providerBase.superRefine((v, ctx) => {
  if (!v.baseUrl && !connectorDef(v.kind).defaultBaseUrl)
    ctx.addIssue({
      code: 'custom',
      path: ['baseUrl'],
      message: 'Base URL is required for this connector',
    });
});
export const providerUpdateSchema = providerBase.partial();

export const credentialSchema = z.object({
  label: z.string().trim().min(1).max(120),
  kind: z.enum(['API_KEY', 'BEARER_TOKEN', 'BASIC', 'OAUTH2_CLIENT', 'HEADERS']),
  secret: z
    .object({
      apiKey: z.string().min(1).max(4000).optional(),
      token: z.string().min(1).max(8000).optional(),
      username: z.string().max(500).optional(),
      password: z.string().max(500).optional(),
      clientId: z.string().max(500).optional(),
      clientSecret: z.string().max(2000).optional(),
      headers: z.record(z.string().regex(/^[A-Za-z0-9-]{1,64}$/), z.string().max(4000)).optional(),
    })
    .strict(),
  expiresAt: z.coerce.date().optional().nullable(),
  /** Keep older credentials active (default: rotate = deactivate previous). */
  keepPrevious: z.boolean().default(false),
});

export const providerSubscriptionSchema = z.object({
  planName: z.string().trim().min(1).max(120),
  externalRef: z.string().max(200).optional().nullable(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).default('ACTIVE'),
  startsAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional().nullable(),
  monthlyFee: moneyStringSchema.optional().nullable(),
  currency: z.string().length(3).default('USD'),
  includedCalls: z.coerce.number().int().min(0).optional().nullable(),
  usageLimitPerMonth: z.coerce.number().int().min(1).optional().nullable(),
  usageLimitPerDay: z.coerce.number().int().min(1).optional().nullable(),
  overagePricePerCall: moneyStringSchema.optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const licenseSchema = z.object({
  apiProductId: z.string().uuid().optional().nullable(),
  redistributionAllowed: z.boolean(),
  subResaleAllowed: z.boolean().default(false),
  cachingAllowed: z.boolean().default(false),
  cacheTtlSeconds: z.coerce.number().int().min(1).max(86400).optional().nullable(),
  territory: z.string().max(200).optional().nullable(),
  restrictions: z.string().max(4000).optional().nullable(),
  documentRef: z.string().max(500).optional().nullable(),
  evidenceNotes: z.string().max(4000).optional().nullable(),
  effectiveFrom: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
});
export const licenseDecisionSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED', 'REVOKED']),
  notes: z.string().max(2000).optional(),
});

const upstreamPath = z
  .string()
  .max(500)
  .regex(
    /^\/[A-Za-z0-9_\-./{}~%:@]*$/,
    'Path must start with / and contain only URL path characters',
  )
  .refine((p) => !p.includes('..') && !p.includes('//'), 'Path traversal not allowed');

export const integrationSchema = z.object({
  endpointId: z.string().uuid(),
  providerId: z.string().uuid(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  upstreamMethod: z.enum(HTTP_METHODS),
  upstreamPath,
  queryMapping: z
    .object({
      map: z.record(z.string(), z.string().regex(/^[A-Za-z0-9_\-.[\]]{1,64}$/)).optional(),
      static: z.record(z.string(), z.string().max(500)).optional(),
    })
    .default({}),
  headerMapping: z.object({ static: headerRecord.optional() }).default({}),
  bodyMode: z.enum(['NONE', 'PASSTHROUGH_VALIDATED', 'TEMPLATE']).default('NONE'),
  bodyTemplate: z.unknown().optional().nullable(),
  responseTransform: z
    .object({
      root: z.string().max(200).optional(),
      pick: z.array(z.string().max(200)).max(100).optional(),
      rename: z.record(z.string(), z.string()).optional(),
    })
    .optional()
    .nullable(),
  timeoutMsOverride: z.coerce.number().int().min(500).max(60000).optional().nullable(),
  costPerCall: moneyStringSchema.optional().nullable(),
  costIsEstimated: z.boolean().default(true),
  costCurrency: z.string().length(3).default('USD'),
  isActive: z.boolean().default(true),
});
export const integrationUpdateSchema = integrationSchema.partial().omit({ endpointId: true });

export const integrationTestSchema = z.object({
  pathParams: z.record(z.string(), z.string()).default({}),
  query: z.record(z.string(), z.string()).default({}),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
});
