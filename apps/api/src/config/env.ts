import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  COMPANY_NAME: z.string().default('Ze-Ze Technologies'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('1'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be ≥32 chars'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be ≥32 chars'),
  API_KEY_HMAC_SECRET: z.string().min(32, 'API_KEY_HMAC_SECRET must be ≥32 chars'),
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'CREDENTIAL_ENCRYPTION_KEY must be 32 bytes base64',
    ),
  CREDENTIAL_ENCRYPTION_KEY_VERSION: z.coerce.number().int().default(1),
  /** Optional previous keys for rotation: "1:<base64>,2:<base64>" */
  CREDENTIAL_ENCRYPTION_OLD_KEYS: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  COOKIE_DOMAIN: z.string().optional(),
  GATEWAY_MAX_BODY_BYTES: z.coerce.number().int().default(1_048_576),
  GATEWAY_RESERVATION_TTL_SECONDS: z.coerce.number().int().default(120),
  GATEWAY_ALLOW_PRIVATE_UPSTREAMS: bool.default(false),
  /** Live demo/staging: allows mock providers, the mock payment gateway and demo seed data while keeping production hardening. */
  DEMO_MODE: bool.default(false),
  DATA_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  PAYMENT_PROVIDERS: z.string().default('mock,manual_bank'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  BANK_TRANSFER_INSTRUCTIONS: z.string().default('Contact billing for bank transfer details.'),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default('Ze-Ze Technologies <no-reply@example.com>'),
  DISABLE_BACKGROUND_JOBS: bool.default(false),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production') {
    if (e.GATEWAY_ALLOW_PRIVATE_UPSTREAMS && !e.DEMO_MODE)
      throw new Error(
        'GATEWAY_ALLOW_PRIVATE_UPSTREAMS must be false in production unless DEMO_MODE=true',
      );
    for (const k of ['SESSION_SECRET', 'JWT_SECRET', 'API_KEY_HMAC_SECRET'] as const) {
      if (/CHANGE_ME/i.test(e[k])) throw new Error(`${k} still has a placeholder value`);
    }
  }
  cached = e;
  return e;
}

export const isProd = () => env().NODE_ENV === 'production';
/** Mock providers, demo payments and demo licenses: development, test, or an explicit DEMO_MODE deployment. */
export const demoAllowed = () => !isProd() || env().DEMO_MODE;
/** Resets cached env (tests only). */
export const resetEnvCache = () => {
  cached = null;
};
