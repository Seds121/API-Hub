import { Injectable } from '@nestjs/common';
import type { CustomerApiKey } from '@prisma/client';
import { z } from 'zod';
import { isIP } from 'net';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { AuditService } from '../../common/audit.service';
import { generateApiKey, hmacApiKey, parseApiKey, safeEqualHex } from '../../common/crypto/tokens';
import { badRequest, notFound } from '../../common/http/app-error';
import type { RequestMeta } from '../../common/decorators';

const ipOrCidr = z.string().refine((v) => {
  const [ip, bits] = v.split('/');
  return (
    !!ip &&
    isIP(ip) !== 0 &&
    (bits === undefined || (/^\d+$/.test(bits) && Number(bits) <= (isIP(ip) === 4 ? 32 : 128)))
  );
}, 'Invalid IP or CIDR');

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  environment: z.enum(['LIVE', 'TEST']).default('LIVE'),
  scopes: z
    .array(z.string().regex(/^(\*|[a-z0-9-]{1,80})$/))
    .min(1)
    .max(100)
    .default(['*']),
  allowedIps: z.array(ipOrCidr).max(50).default([]),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  expiresAt: z.coerce
    .date()
    .refine((d) => d > new Date(), 'Expiry must be in the future')
    .optional()
    .nullable(),
});
export const apiKeyUpdateSchema = apiKeyCreateSchema.omit({ environment: true }).partial();

/** Fields safe to return (never the hash). */
const PUBLIC = {
  id: true,
  name: true,
  environment: true,
  prefix: true,
  last4: true,
  scopes: true,
  allowedIps: true,
  rateLimitPerMinute: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

export type ValidatedKey = Pick<
  CustomerApiKey,
  | 'id'
  | 'orgId'
  | 'prefix'
  | 'scopes'
  | 'allowedIps'
  | 'rateLimitPerMinute'
  | 'expiresAt'
  | 'environment'
>;

function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bitsStr] = cidr.split('/') as [string, string];
  if (isIP(ip) !== 4 || isIP(range) !== 4) return ip === range; // IPv6 CIDR: exact match fallback
  const bits = Number(bitsStr);
  const toInt = (s: string) => s.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(range) & mask);
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  list(orgId: string) {
    return this.prisma.customerApiKey.findMany({
      where: { orgId, deletedAt: null },
      select: PUBLIC,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertScopes(scopes: string[]) {
    const named = scopes.filter((s) => s !== '*');
    if (!named.length) return;
    const found = await this.prisma.apiProduct.findMany({
      where: { slug: { in: named }, deletedAt: null },
      select: { slug: true },
    });
    const missing = named.filter((s) => !found.some((f) => f.slug === s));
    if (missing.length) throw badRequest(`Unknown API(s) in scopes: ${missing.join(', ')}`);
  }

  /** Returns the full secret exactly once. Only the HMAC is stored. */
  async create(
    orgId: string,
    userId: string | null,
    input: z.infer<typeof apiKeyCreateSchema>,
    meta?: RequestMeta,
  ) {
    await this.assertScopes(input.scopes);
    const active = await this.prisma.customerApiKey.count({
      where: { orgId, revokedAt: null, deletedAt: null },
    });
    if (active >= 100) throw badRequest('Maximum of 100 active keys per organization.');
    const k = generateApiKey(input.environment === 'TEST' ? 'test' : 'live');
    const row = await this.prisma.customerApiKey.create({
      data: {
        orgId,
        createdById: userId,
        name: input.name,
        environment: input.environment,
        prefix: k.prefix,
        keyHash: k.hash,
        last4: k.last4,
        scopes: input.scopes,
        allowedIps: input.allowedIps,
        rateLimitPerMinute: input.rateLimitPerMinute ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      select: PUBLIC,
    });
    await this.audit.record({
      action: 'apikey.create',
      actor: userId ? { userId } : null,
      orgId,
      targetType: 'CustomerApiKey',
      targetId: row.id,
      metadata: { name: row.name, prefix: row.prefix, scopes: row.scopes },
      meta,
    });
    return { ...row, secret: k.full };
  }

  async update(
    orgId: string,
    id: string,
    input: z.infer<typeof apiKeyUpdateSchema>,
    userId: string,
    meta: RequestMeta,
  ) {
    const key = await this.prisma.customerApiKey.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!key) throw notFound('API key');
    if (key.revokedAt) throw badRequest('Revoked keys cannot be edited.');
    if (input.scopes) await this.assertScopes(input.scopes);
    const row = await this.prisma.customerApiKey.update({
      where: { id },
      data: { ...input },
      select: PUBLIC,
    });
    await this.redis.client.del(`gw:key:${key.prefix}`);
    await this.audit.record({
      action: 'apikey.update',
      actor: { userId },
      orgId,
      targetType: 'CustomerApiKey',
      targetId: id,
      metadata: { changes: Object.keys(input) },
      meta,
    });
    return row;
  }

  async revoke(orgId: string, id: string, userId: string | null, meta?: RequestMeta) {
    const key = await this.prisma.customerApiKey.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!key) throw notFound('API key');
    if (!key.revokedAt)
      await this.prisma.customerApiKey.update({
        where: { id },
        data: { revokedAt: new Date(), revokedById: userId },
      });
    await this.redis.client.del(`gw:key:${key.prefix}`);
    await this.audit.record({
      action: 'apikey.revoke',
      actor: userId ? { userId } : null,
      orgId,
      targetType: 'CustomerApiKey',
      targetId: id,
      metadata: { prefix: key.prefix },
      meta,
    });
  }

  /** Regenerate = revoke the old key and issue a new one with identical settings. */
  async regenerate(orgId: string, id: string, userId: string, meta: RequestMeta) {
    const key = await this.prisma.customerApiKey.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!key) throw notFound('API key');
    await this.revoke(orgId, id, userId, meta);
    return this.create(
      orgId,
      userId,
      {
        name: key.name,
        environment: key.environment,
        scopes: key.scopes,
        allowedIps: key.allowedIps,
        rateLimitPerMinute: key.rateLimitPerMinute,
        expiresAt: key.expiresAt && key.expiresAt > new Date() ? key.expiresAt : null,
      },
      meta,
    );
  }

  /**
   * Gateway hot path. Looks up by public prefix (Redis-cached), verifies the HMAC in constant time,
   * and checks revocation/expiry/IP allowlist. Returns null on any failure (uniform 401).
   */
  async validate(
    raw: string | undefined,
    clientIp: string | undefined,
  ): Promise<ValidatedKey | 'IP_NOT_ALLOWED' | null> {
    if (!raw) return null;
    const parsed = parseApiKey(raw.trim());
    if (!parsed) return null;
    const cacheKey = `gw:key:${parsed.prefix}`;
    let rec: (ValidatedKey & { keyHash: string; revokedAt: Date | null }) | null = null;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      rec = cached === 'null' ? null : JSON.parse(cached);
      if (rec?.expiresAt) rec.expiresAt = new Date(rec.expiresAt);
    } else {
      rec = await this.prisma.customerApiKey.findFirst({
        where: { prefix: parsed.prefix, deletedAt: null },
        select: {
          id: true,
          orgId: true,
          prefix: true,
          scopes: true,
          allowedIps: true,
          rateLimitPerMinute: true,
          expiresAt: true,
          environment: true,
          keyHash: true,
          revokedAt: true,
        },
      });
      await this.redis.client.set(cacheKey, JSON.stringify(rec), 'EX', 60);
    }
    if (!rec || rec.revokedAt || !safeEqualHex(hmacApiKey(raw.trim()), rec.keyHash)) return null;
    if (rec.expiresAt && rec.expiresAt < new Date()) return null;
    if (
      rec.allowedIps.length &&
      (!clientIp || !rec.allowedIps.some((c) => ipInCidr(clientIp.replace(/^::ffff:/, ''), c)))
    )
      return 'IP_NOT_ALLOWED';
    // Throttled last-used timestamp (one write per key per minute).
    if (await this.redis.client.set(`gw:keyused:${rec.id}`, '1', 'EX', 60, 'NX')) {
      void this.prisma.customerApiKey
        .update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }
    const { keyHash: _h, revokedAt: _r, ...pub } = rec;
    return pub;
  }
}
