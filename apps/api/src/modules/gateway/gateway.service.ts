import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Response } from 'express';
import { HttpMethod, Prisma } from '@prisma/client';
import { Decimal, ERROR_CODES, ErrorCode, money, ParamDef } from '@zeze/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import type { AppRequest } from '../../common/auth-context';
import { logger } from '../../common/logging/logger';
import { ApiKeysService, ValidatedKey } from '../api-keys/api-keys.service';
import { LicenseService, LicenseVerdict } from '../licenses/license.service';
import { PricingService } from '../pricing/pricing.service';
import { WalletService } from '../billing/wallet.service';
import { SpendTracker } from '../billing/spend-tracker.service';
import { SubscriptionService } from '../billing/subscription.service';
import {
  EngineError,
  ExecuteResult,
  IntegrationEngine,
} from '../integrations/engine/integration-engine.service';
import {
  matchEndpoint,
  RouteCache,
  RouteEndpoint,
  RouteIntegration,
  RouteProduct,
} from './route-cache';

const PRE_SEND_FAILURES = new Set([
  'CIRCUIT_OPEN',
  'CONCURRENCY',
  'CONFIG',
  'PROVIDER_RATE_LIMIT',
  'PROVIDER_QUOTA',
  'SSRF',
]);
const IDEMPOTENT = new Set(['GET', 'PUT', 'DELETE']);
const PASSTHROUGH_TYPES =
  /^(application\/(json|xml|pdf|octet-stream|[a-z.+-]*\+json)|text\/(plain|csv|xml|html)|image\/(png|jpeg|gif|webp|svg\+xml))/i;

interface Outcome {
  status: number;
  errorCode?: string;
  upstreamStatus?: number | null;
  upstreamLatencyMs?: number | null;
  billable: boolean;
  integration?: RouteIntegration | null;
  calledUpstream: boolean;
  fromCache?: boolean;
}

interface Ctx {
  correlationId: string;
  started: number;
  key?: ValidatedKey;
  orgId?: string;
  product?: RouteProduct;
  endpoint?: RouteEndpoint;
  price: Decimal;
  reserved: boolean;
  coveredSubId?: string;
  requestBytes: number;
}

type ActiveSub = {
  id: string;
  plan: {
    includedRequests: number;
    overagePricePerRequest: string | null;
    discountPercent: string;
    rateLimitPerMinute: number;
  };
} | null;

class GatewayReject extends Error {
  constructor(
    readonly code: ErrorCode | 'UPSTREAM_REJECTED',
    readonly status: number,
    message?: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(
      message ?? (code in ERROR_CODES ? ERROR_CODES[code as ErrorCode].message : 'Request failed'),
    );
  }
}
const reject = (
  code: ErrorCode,
  message?: string,
  details?: unknown,
  headers?: Record<string, string>,
) => new GatewayReject(code, ERROR_CODES[code].status, message, details, headers);

/**
 * Central API gateway pipeline:
 * key → org → route → scope → subscription → rate limits → input validation → license → price →
 * quota/spend/wallet reservation → upstream (with failover) → response normalization → atomic settle + metering.
 */
@Injectable()
export class GatewayService {
  private licenseCache = new Map<string, { at: number; v: LicenseVerdict }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly keys: ApiKeysService,
    private readonly routes: RouteCache,
    private readonly licenses: LicenseService,
    private readonly pricing: PricingService,
    private readonly wallet: WalletService,
    private readonly spend: SpendTracker,
    private readonly subs: SubscriptionService,
    private readonly engine: IntegrationEngine,
  ) {}

  async handle(req: AppRequest, res: Response, productSlug: string, subPath: string) {
    const ctx: Ctx = {
      correlationId: req.requestId,
      started: Date.now(),
      price: money(0),
      reserved: false,
      requestBytes: Number(req.headers['content-length'] ?? 0) || 0,
    };
    try {
      await this.pipeline(req, res, ctx, productSlug, subPath);
    } catch (e) {
      const rej = e instanceof GatewayReject ? e : null;
      if (!rej)
        logger.error(
          {
            correlationId: ctx.correlationId,
            err: (e as Error).message,
            stack: (e as Error).stack,
          },
          'gateway internal error',
        );
      await this.unwind(ctx);
      const status = rej?.status ?? 500;
      const code = rej?.code ?? 'INTERNAL_ERROR';
      if (ctx.orgId)
        await this.recordOutcome(
          req,
          ctx,
          { status, errorCode: code, billable: false, calledUpstream: false },
          money(0),
        ).catch(() => undefined);
      if (rej?.headers) for (const [k, v] of Object.entries(rej.headers)) res.setHeader(k, v);
      if (!res.headersSent)
        res
          .status(status)
          .json({
            error: {
              code,
              message: rej?.message ?? ERROR_CODES.INTERNAL_ERROR.message,
              ...(rej?.details !== undefined ? { details: rej.details } : {}),
              requestId: ctx.correlationId,
            },
          });
    }
  }

  private async unwind(ctx: Ctx) {
    if (ctx.reserved)
      await this.wallet
        .release(ctx.correlationId)
        .catch((e) => logger.error({ err: e.message }, 'release failed'));
    if (ctx.coveredSubId) await this.subs.refundIncluded(ctx.coveredSubId).catch(() => undefined);
    ctx.reserved = false;
    ctx.coveredSubId = undefined;
  }

  private extractKey(req: AppRequest) {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && /^Bearer\s+/i.test(auth))
      return auth.replace(/^Bearer\s+/i, '');
    const h = req.headers['x-api-key'];
    return typeof h === 'string' ? h : undefined;
  }

  private async activeSub(orgId: string): Promise<ActiveSub> {
    const k = `gw:sub:${orgId}`;
    const c = await this.redis.client.get(k);
    if (c) return JSON.parse(c) as ActiveSub;
    const s = await this.subs.active(orgId);
    const v: ActiveSub = s
      ? {
          id: s.id,
          plan: {
            includedRequests: s.plan.includedRequests,
            overagePricePerRequest: s.plan.overagePricePerRequest?.toString() ?? null,
            discountPercent: s.plan.discountPercent.toString(),
            rateLimitPerMinute: s.plan.rateLimitPerMinute,
          },
        }
      : null;
    await this.redis.client.set(k, JSON.stringify(v), 'EX', 15);
    return v;
  }

  private async licenseFor(providerId: string, productId: string) {
    const k = `${providerId}:${productId}`;
    const hit = this.licenseCache.get(k);
    if (hit && Date.now() - hit.at < 10_000) return hit.v;
    const v = await this.licenses.verdict(providerId, productId);
    this.licenseCache.set(k, { at: Date.now(), v });
    return v;
  }

  private async rateLimit(res: Response, key: string, limit: number) {
    const r = await this.redis.hit(key, limit, 60_000);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(r.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(r.resetMs / 1000)));
    if (!r.allowed)
      throw reject('RATE_LIMITED', undefined, undefined, {
        'Retry-After': String(Math.ceil(r.resetMs / 1000)),
      });
  }

  private async pipeline(
    req: AppRequest,
    res: Response,
    ctx: Ctx,
    productSlug: string,
    subPath: string,
  ) {
    // 1-4. Authenticate key, identify customer & organization.
    const key = await this.keys.validate(this.extractKey(req), req.ip);
    if (!key) throw reject('INVALID_API_KEY');
    if (key === 'IP_NOT_ALLOWED') throw reject('IP_NOT_ALLOWED');
    ctx.key = key;
    const org = await this.routes.org(key.orgId);
    if (!org) throw reject('INVALID_API_KEY');
    ctx.orgId = org.id;
    if (org.status !== 'ACTIVE') throw reject('ORGANIZATION_SUSPENDED');
    if (org.parentOrgId) {
      const parent = await this.routes.org(org.parentOrgId);
      if (!parent || parent.status !== 'ACTIVE')
        throw reject('ORGANIZATION_SUSPENDED', 'The parent agency account is suspended.');
    }

    // Resolve route (admin-configured only — customers can never supply upstream URLs).
    if (!/^[a-z0-9-]{1,80}$/.test(productSlug)) throw reject('API_NOT_FOUND');
    const product = await this.routes.product(productSlug);
    if (!product) throw reject('API_NOT_FOUND');
    ctx.product = product;
    const match = matchEndpoint(product, req.method, subPath);
    if (match === null) throw reject('API_NOT_FOUND');
    if (match === 'METHOD_NOT_ALLOWED') throw reject('METHOD_NOT_ALLOWED');
    const endpoint = match.endpoint;
    ctx.endpoint = endpoint;

    // 5. Permissions (key scopes).
    if (!key.scopes.includes('*') && !key.scopes.includes(product.slug))
      throw reject('API_NOT_IN_KEY_SCOPE');

    // 6. Subscription status.
    const sub = await this.activeSub(org.id);
    if (product.requiresSubscription && !sub) throw reject('SUBSCRIPTION_REQUIRED');

    // 8. Rate limiting (per key, and per org+endpoint when configured).
    await this.rateLimit(
      res,
      `gw:k:${key.id}`,
      key.rateLimitPerMinute ?? sub?.plan.rateLimitPerMinute ?? product.defaultRateLimitPerMinute,
    );
    if (endpoint.rateLimitPerMinute)
      await this.rateLimit(res, `gw:e:${org.id}:${endpoint.id}`, endpoint.rateLimitPerMinute);

    // Request validation (before any money moves).
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
    const bodySize = hasBody && req.body ? Buffer.byteLength(JSON.stringify(req.body)) : 0;
    ctx.requestBytes = bodySize;
    if (bodySize > endpoint.maxBodyBytes) throw reject('PAYLOAD_TOO_LARGE');
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (Array.isArray(v) || typeof v !== 'string')
        throw reject('VALIDATION_FAILED', undefined, [
          { param: k, message: 'Repeated or nested query parameters are not supported' },
        ]);
      query[k] = v;
    }
    const headers = Object.fromEntries(
      Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    ) as Record<string, string>;
    const input = {
      pathParams: match.pathParams,
      query,
      headers,
      body: hasBody ? req.body : undefined,
    };
    try {
      this.engine.validate(endpoint.params as ParamDef[], input);
    } catch (e) {
      if (e instanceof EngineError) throw reject('VALIDATION_FAILED', e.message, e.details);
      throw e;
    }

    // Sandbox (test) keys: documented example response, never forwarded upstream, never billed.
    if (key.environment === 'TEST') {
      res.setHeader('X-ZZ-Sandbox', 'true');
      res.setHeader('X-ZZ-Cost', '0.000000');
      await this.recordOutcome(
        req,
        ctx,
        { status: 200, billable: false, calledUpstream: false },
        money(0),
      );
      res
        .status(200)
        .json(
          endpoint.responseExample ?? {
            sandbox: true,
            message: 'No documented example response for this endpoint.',
          },
        );
      return;
    }

    // Licensing: only providers with verified redistribution rights may serve this product.
    // Agency subaccounts are downstream resale: the upstream license must also permit sub-resale.
    const isResold = Boolean(org.parentOrgId);
    const candidates: { integ: RouteIntegration; lic: LicenseVerdict }[] = [];
    for (const integ of endpoint.integrations) {
      const lic = await this.licenseFor(integ.providerId, product.id);
      if (lic.redistributionAllowed && (!isResold || lic.subResaleAllowed))
        candidates.push({ integ, lic });
    }
    candidates.sort(
      (a, b) =>
        Number(a.integ.provider.status === 'DOWN') - Number(b.integ.provider.status === 'DOWN') ||
        a.integ.priority - b.integ.priority,
    );
    if (!candidates.length) {
      logger.warn(
        { product: product.slug, endpoint: endpoint.id },
        'no licensed upstream available',
      );
      throw reject('API_UNAVAILABLE');
    }

    // 7. Price, included quota, spend cap and wallet reservation.
    const quote = await this.pricing.quote({
      orgId: org.id,
      orgType: org.type,
      productId: product.id,
      endpointId: endpoint.id,
      planDiscountPercent: sub?.plan.discountPercent,
    });
    if (!quote) {
      logger.error({ product: product.slug, endpoint: endpoint.id }, 'no pricing configured');
      throw reject('API_UNAVAILABLE');
    }
    let price = quote.unitPrice;
    if (sub && sub.plan.includedRequests > 0) {
      if (await this.subs.consumeIncluded(sub.id, sub.plan.includedRequests)) {
        ctx.coveredSubId = sub.id;
        price = money(0);
      } else if (sub.plan.overagePricePerRequest !== null) {
        price = money(sub.plan.overagePricePerRequest);
      }
    }
    ctx.price = price;
    if (price.gt(0)) {
      if (await this.spend.wouldExceed(org, price)) throw reject('SPENDING_LIMIT_REACHED');
      if (!(await this.wallet.reserve(org.id, price, ctx.correlationId, quote.minWalletBalance)))
        throw reject('INSUFFICIENT_BALANCE');
      ctx.reserved = true;
    }

    // Optional response cache — only when the supplier license explicitly permits caching. Tenant-scoped.
    const primary = candidates[0]!;
    const cacheable =
      req.method === 'GET' && primary.lic.cachingAllowed && (primary.lic.cacheTtlSeconds ?? 0) > 0;
    const cacheKey = cacheable
      ? `gwc:${org.id}:${endpoint.id}:${createHash('sha256')
          .update(JSON.stringify([match.pathParams, Object.entries(query).sort()]))
          .digest('hex')}`
      : null;
    if (cacheKey) {
      const hit = await this.redis.client.getBuffer(cacheKey);
      if (hit) {
        const { ct, body } = JSON.parse(hit.toString('utf8')) as { ct: string; body: string };
        await this.finish(req, res, ctx, {
          status: 200,
          upstreamStatus: 200,
          billable: true,
          integration: primary.integ,
          calledUpstream: false,
          fromCache: true,
        });
        res.setHeader('X-ZZ-Cache', 'HIT');
        res.status(200).type(ct).send(Buffer.from(body, 'base64'));
        return;
      }
    }

    // 9-11. Forward to the configured upstream, with failover across licensed integrations.
    let result: ExecuteResult | null = null;
    let used: RouteIntegration | null = null;
    let lastErr: EngineError | null = null;
    for (const { integ } of candidates) {
      try {
        const r = await this.engine.execute({
          provider: integ.provider,
          integration: integ,
          params: endpoint.params as ParamDef[],
          input,
          correlationId: ctx.correlationId,
          limits: integ.provider.subscriptions[0] ?? undefined,
        });
        result = r;
        used = integ;
        if (
          r.status >= 500 &&
          IDEMPOTENT.has(req.method) &&
          integ !== candidates[candidates.length - 1]!.integ
        )
          continue;
        break;
      } catch (e) {
        if (!(e instanceof EngineError)) throw e;
        if (e.kind === 'VALIDATION') throw reject('VALIDATION_FAILED', e.message, e.details);
        lastErr = e;
        used = integ;
        if (PRE_SEND_FAILURES.has(e.kind) || IDEMPOTENT.has(req.method)) continue;
        break;
      }
    }

    // 12-15. Normalize, bill, meter, respond.
    if (!result) {
      const kind = lastErr?.kind ?? 'NETWORK';
      const code: ErrorCode = kind === 'TIMEOUT' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE';
      await this.finish(req, res, ctx, {
        status: ERROR_CODES[code].status,
        errorCode: code,
        billable: false,
        integration: used,
        calledUpstream: !PRE_SEND_FAILURES.has(kind),
      });
      if (kind === 'PROVIDER_RATE_LIMIT' || kind === 'CIRCUIT_OPEN')
        res.setHeader('Retry-After', '30');
      res
        .status(ERROR_CODES[code].status)
        .json({
          error: { code, message: ERROR_CODES[code].message, requestId: ctx.correlationId },
        });
      return;
    }

    const s = result.status;
    const base = {
      upstreamStatus: s,
      upstreamLatencyMs: result.upstreamLatencyMs,
      integration: used,
      calledUpstream: true,
    };
    if (s >= 200 && s < 400) {
      await this.finish(req, res, ctx, { ...base, status: s, billable: true });
      if (cacheKey && s === 200) {
        void this.redis.client.set(
          cacheKey,
          JSON.stringify({
            ct: result.contentType ?? 'application/json',
            body: (result.json !== undefined
              ? Buffer.from(JSON.stringify(result.json))
              : result.raw
            ).toString('base64'),
          }),
          'EX',
          primary.lic.cacheTtlSeconds!,
        );
      }
      return this.sendUpstreamBody(res, s, result);
    }
    if (s === 401 || s === 403) {
      logger.error(
        { provider: used?.provider.slug, status: s, correlationId: ctx.correlationId },
        'upstream rejected our credentials',
      );
      await this.finish(req, res, ctx, {
        ...base,
        status: 503,
        errorCode: 'API_UNAVAILABLE',
        billable: false,
      });
      return res
        .status(503)
        .json({
          error: {
            code: 'API_UNAVAILABLE',
            message: ERROR_CODES.API_UNAVAILABLE.message,
            requestId: ctx.correlationId,
          },
        });
    }
    if (s === 429) {
      await this.finish(req, res, ctx, {
        ...base,
        status: 503,
        errorCode: 'UPSTREAM_UNAVAILABLE',
        billable: false,
      });
      res.setHeader('Retry-After', '30');
      return res
        .status(503)
        .json({
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: ERROR_CODES.UPSTREAM_UNAVAILABLE.message,
            requestId: ctx.correlationId,
          },
        });
    }
    if (s >= 400 && s < 500) {
      await this.finish(req, res, ctx, {
        ...base,
        status: s,
        errorCode: 'UPSTREAM_REJECTED',
        billable: quote.chargeOnClientError,
      });
      return res
        .status(s)
        .json({
          error: {
            code: 'UPSTREAM_REJECTED',
            message: 'The upstream provider rejected the request.',
            details: result.json ?? undefined,
            requestId: ctx.correlationId,
          },
        });
    }
    await this.finish(req, res, ctx, {
      ...base,
      status: 502,
      errorCode: 'UPSTREAM_ERROR',
      billable: false,
    });
    return res
      .status(502)
      .json({
        error: {
          code: 'UPSTREAM_ERROR',
          message: ERROR_CODES.UPSTREAM_ERROR.message,
          requestId: ctx.correlationId,
        },
      });
  }

  private sendUpstreamBody(res: Response, status: number, r: ExecuteResult) {
    if (r.json !== undefined) return res.status(status).json(r.json);
    const ct = r.contentType ?? 'application/octet-stream';
    if (!PASSTHROUGH_TYPES.test(ct))
      return res.status(status).type('application/octet-stream').send(r.raw);
    return res.status(status).type(ct).send(r.raw);
  }

  /** Settle billing + write metering atomically, then set cost headers. */
  private async finish(req: AppRequest, res: Response, ctx: Ctx, o: Outcome) {
    const charge = o.billable ? ctx.price : money(0);
    if (!o.billable && ctx.coveredSubId) {
      await this.subs.refundIncluded(ctx.coveredSubId).catch(() => undefined);
    }
    const coveredBySubscription = Boolean(ctx.coveredSubId) && o.billable;
    ctx.coveredSubId = undefined;
    const write = (tx: Tx) => this.writeUsage(tx, req, ctx, o, charge, coveredBySubscription);
    if (ctx.reserved) {
      await this.wallet.settle({
        orgId: ctx.orgId!,
        correlationId: ctx.correlationId,
        chargeAmount: charge,
        description: `${ctx.product?.name ?? 'API'} · ${req.method} ${ctx.endpoint?.path ?? ''}`,
        metadata: { productId: ctx.product?.id, endpointId: ctx.endpoint?.id },
        extra: write,
      });
      ctx.reserved = false;
    } else {
      await this.prisma.$transaction(write);
    }
    if (charge.gt(0)) await this.spend.add(ctx.orgId!, charge);
    if (ctx.product) void this.redis.client.incr(`pop:${ctx.product.id}`);
    res.setHeader('X-ZZ-Cost', charge.toFixed(6));
    if (coveredBySubscription) res.setHeader('X-ZZ-Covered-By-Plan', 'true');
  }

  private async recordOutcome(req: AppRequest, ctx: Ctx, o: Outcome, charge: Decimal) {
    await this.prisma.$transaction((tx) => this.writeUsage(tx, req, ctx, o, charge, false));
  }

  private async writeUsage(
    tx: Tx,
    req: AppRequest,
    ctx: Ctx,
    o: Outcome,
    charge: Decimal,
    covered: boolean,
  ) {
    const existing = await tx.apiUsageRecord.findUnique({
      where: { correlationId: ctx.correlationId },
      select: { id: true },
    });
    if (existing) return;
    const ip = req.ip ?? '';
    const ipPrefix = ip.includes('.')
      ? ip
          .replace(/^::ffff:/, '')
          .split('.')
          .slice(0, 3)
          .join('.') + '.0'
      : ip.split(':').slice(0, 4).join(':') + '::';
    const usage = await tx.apiUsageRecord.create({
      data: {
        correlationId: ctx.correlationId,
        orgId: ctx.orgId!,
        apiKeyId: ctx.key?.id,
        productId: ctx.product?.id,
        endpointId: ctx.endpoint?.id,
        providerId: o.integration?.providerId,
        method: (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
          ? req.method
          : 'GET') as HttpMethod,
        path: req.path.slice(0, 500),
        statusCode: o.status,
        upstreamStatus: o.upstreamStatus ?? null,
        errorCode: o.errorCode,
        latencyMs: Date.now() - ctx.started,
        upstreamLatencyMs: o.upstreamLatencyMs ?? null,
        billable: o.billable && charge.gt(0),
        price: new Prisma.Decimal(charge.toFixed(6)),
        coveredBySubscription: covered,
        requestBytes: ctx.requestBytes,
        clientIpPrefix: ipPrefix.slice(0, 64),
      },
    });
    if (o.integration && (o.calledUpstream || o.fromCache)) {
      const ok = (o.upstreamStatus ?? 0) >= 200 && (o.upstreamStatus ?? 0) < 400;
      const i = o.integration;
      // Supplier cost: actual 0 for cache hits; configured cost for successful calls (flagged estimated or not); unknown (null) otherwise.
      const cost = o.fromCache
        ? new Prisma.Decimal(0)
        : ok && i.costPerCall !== null
          ? i.costPerCall
          : null;
      await tx.supplierUsageRecord.create({
        data: {
          usageRecordId: usage.id,
          providerId: i.providerId,
          integrationId: i.id,
          cost,
          costIsEstimated: o.fromCache ? false : i.costIsEstimated,
          currency: i.costCurrency,
        },
      });
    }
  }
}
