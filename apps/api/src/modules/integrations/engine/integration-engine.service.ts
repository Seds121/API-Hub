import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ApiIntegration, ApiProvider, HttpMethod } from '@prisma/client';
import type { ParamDef } from '@zeze/shared';
import { RedisService } from '../../../common/redis.service';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { env } from '../../../config/env';
import { logger } from '../../../common/logging/logger';
import { CircuitBreaker, Semaphore } from './circuit-breaker';
import {
  closeUpstreamAgents,
  sendUpstream,
  UpstreamHttpResponse,
  UpstreamNetworkError,
} from './http-client';
import {
  CustomerInput,
  MappingError,
  renderPath,
  renderTemplate,
  ResponseTransform,
  transformResponse,
  validateInput,
} from './mapping';
import { CredentialStore } from './credential-store';
import {
  AuthConfig,
  ProviderAdapter,
  ProviderConfigError,
  ProviderSecret,
} from '../adapters/types';
import { RapidApiAdapter } from '../adapters/rapidapi.adapter';
import { DirectRestAdapter } from '../adapters/direct-rest.adapter';

export type EngineFailureKind =
  | 'VALIDATION'
  | 'CONFIG'
  | 'CIRCUIT_OPEN'
  | 'CONCURRENCY'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_QUOTA'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'SSRF'
  | 'TOO_LARGE';

export class EngineError extends Error {
  constructor(
    readonly kind: EngineFailureKind,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ProviderLimits {
  usageLimitPerDay?: number | null;
  usageLimitPerMonth?: number | null;
}

export interface ExecuteParams {
  provider: ApiProvider;
  integration: ApiIntegration;
  params: ParamDef[];
  input: CustomerInput;
  correlationId: string;
  limits?: ProviderLimits;
  /** Admin integration test: skip quota counters. */
  isTest?: boolean;
}

export interface ExecuteResult {
  status: number;
  contentType: string | null;
  /** Parsed & transformed JSON when the upstream returned JSON. */
  json?: unknown;
  raw: Buffer;
  upstreamLatencyMs: number;
  attempts: number;
}

const IDEMPOTENT: HttpMethod[] = ['GET', 'PUT', 'DELETE'];

@Injectable()
export class IntegrationEngine implements OnModuleDestroy {
  private readonly adapters = new Map<string, ProviderAdapter>([
    ['RAPIDAPI', new RapidApiAdapter()],
    ['DIRECT_REST', new DirectRestAdapter()],
  ]);
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly semaphores = new Map<string, Semaphore>();

  constructor(
    private readonly creds: CredentialStore,
    private readonly redis: RedisService,
    private readonly enc: EncryptionService,
  ) {}

  async onModuleDestroy() {
    await closeUpstreamAgents();
  }

  breaker(providerId: string) {
    let b = this.breakers.get(providerId);
    if (!b) this.breakers.set(providerId, (b = new CircuitBreaker()));
    return b;
  }

  private semaphore(p: ApiProvider) {
    let s = this.semaphores.get(p.id);
    if (!s) this.semaphores.set(p.id, (s = new Semaphore(p.maxConcurrency)));
    s.setMax(p.maxConcurrency);
    return s;
  }

  allowPrivate(p: ApiProvider) {
    // Private/loopback upstreams are only reachable for mock (demo) providers, only when explicitly
    // enabled, and never in production. Real providers always get full SSRF protection.
    return p.isMock && env().GATEWAY_ALLOW_PRIVATE_UPSTREAMS && env().NODE_ENV !== 'production';
  }

  /** Validate customer input against the endpoint definition (exposed for the gateway to fail fast before reserving funds). */
  validate(params: ParamDef[], input: CustomerInput) {
    try {
      return validateInput(params, input);
    } catch (e) {
      if (e instanceof MappingError) throw new EngineError('VALIDATION', e.message, e.details);
      throw e;
    }
  }

  async execute(p: ExecuteParams): Promise<ExecuteResult> {
    const { provider, integration } = p;
    if (provider.isMock && env().NODE_ENV === 'production')
      throw new EngineError('CONFIG', 'Mock providers are disabled in production');
    const v = this.validate(p.params, p.input);

    // Build URL strictly from admin configuration.
    let url: URL;
    try {
      const base = provider.baseUrl.replace(/\/+$/, '');
      url = new URL(
        base +
          renderPath(
            integration.upstreamPath.startsWith('/')
              ? integration.upstreamPath
              : `/${integration.upstreamPath}`,
            v.path,
          ),
      );
    } catch (e) {
      throw new EngineError(
        e instanceof MappingError ? 'VALIDATION' : 'CONFIG',
        (e as Error).message,
      );
    }
    const qm = (integration.queryMapping ?? {}) as {
      map?: Record<string, string>;
      static?: Record<string, string>;
    };
    for (const [k, val] of Object.entries(v.query))
      url.searchParams.set(qm.map?.[k] ?? k, String(val));
    for (const [k, val] of Object.entries(qm.static ?? {})) url.searchParams.set(k, String(val));

    const hm = (integration.headerMapping ?? {}) as { static?: Record<string, string> };
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'ZeZe-Gateway/1.0',
      ...((provider.defaultHeaders ?? {}) as Record<string, string>),
      ...(hm.static ?? {}),
      ...v.header,
    };

    let body: string | undefined;
    if (integration.bodyMode === 'PASSTHROUGH_VALIDATED') {
      body = JSON.stringify(p.params.some((d) => d.in === 'body') ? v.body : (p.input.body ?? {}));
    } else if (integration.bodyMode === 'TEMPLATE') {
      body = JSON.stringify(
        renderTemplate(integration.bodyTemplate ?? {}, { ...v.path, ...v.query, ...v.body }),
      );
    }
    if (body !== undefined) headers['content-type'] = 'application/json';

    // Provider guards: circuit breaker, global (cross-instance) rate limit and supplier quota.
    const breaker = this.breaker(provider.id);
    if (!breaker.canPass())
      throw new EngineError('CIRCUIT_OPEN', 'Provider temporarily unavailable (circuit open)');
    if (provider.rateLimitPerMinute) {
      const r = await this.redis.hit(`prov:${provider.id}`, provider.rateLimitPerMinute, 60_000);
      if (!r.allowed) throw new EngineError('PROVIDER_RATE_LIMIT', 'Provider rate limit reached');
    }
    if (!p.isTest) await this.checkQuota(provider.id, p.limits);

    // Credentials + adapter auth.
    const adapter = this.adapters.get(provider.kind);
    if (!adapter) throw new EngineError('CONFIG', `No adapter for ${provider.kind}`);
    const secret =
      provider.authType === 'NONE' && provider.kind !== 'RAPIDAPI'
        ? null
        : await this.creds.get(provider.id);
    let auth;
    try {
      auth = await adapter.authenticate({
        provider,
        url,
        secret,
        getOAuthToken: (pr, s, c) => this.oauthToken(pr, s, c),
      });
    } catch (e) {
      if (e instanceof ProviderConfigError) throw new EngineError('CONFIG', e.message);
      throw e;
    }
    for (const [k, val] of Object.entries(auth.query)) url.searchParams.set(k, val);
    Object.assign(headers, auth.headers);

    const release = await this.semaphore(provider)
      .acquire(Math.min(5000, provider.timeoutMs))
      .catch(() => {
        throw new EngineError('CONCURRENCY', 'Provider concurrency limit reached');
      });
    const timeoutMs = integration.timeoutMsOverride ?? provider.timeoutMs;
    const canRetry = IDEMPOTENT.includes(integration.upstreamMethod);
    const maxAttempts = canRetry ? 1 + Math.max(0, provider.retryMaxAttempts) : 1;
    let attempts = 0;
    let lastErr: unknown;
    let res: UpstreamHttpResponse | undefined;
    try {
      while (attempts < maxAttempts) {
        attempts++;
        try {
          res = await sendUpstream({
            url,
            method: integration.upstreamMethod,
            headers,
            body,
            timeoutMs,
            allowedHosts: provider.allowedHosts,
            allowPrivate: this.allowPrivate(provider),
          });
          if (attempts < maxAttempts && provider.retryOnStatuses.includes(res.status)) {
            await sleep(provider.retryBackoffMs * 2 ** (attempts - 1));
            continue;
          }
          break;
        } catch (e) {
          lastErr = e;
          if (e instanceof UpstreamNetworkError && (e.kind === 'SSRF' || e.kind === 'TOO_LARGE'))
            break;
          if (attempts < maxAttempts) await sleep(provider.retryBackoffMs * 2 ** (attempts - 1));
        }
      }
    } finally {
      release();
    }

    if (!res) {
      breaker.failure();
      const ne = lastErr as UpstreamNetworkError;
      logger.warn(
        {
          provider: provider.slug,
          correlationId: p.correlationId,
          kind: ne?.kind,
          msg: ne?.message,
        },
        'upstream failure',
      );
      throw new EngineError(ne?.kind ?? 'NETWORK', ne?.message ?? 'Upstream failure');
    }
    if (res.status >= 500) breaker.failure();
    else breaker.success();

    let json: unknown;
    if (res.contentType?.includes('json') && res.body.length) {
      try {
        json = transformResponse(
          JSON.parse(res.body.toString('utf8')),
          integration.responseTransform as ResponseTransform | null,
        );
      } catch {
        json = undefined;
      }
    }
    return {
      status: res.status,
      contentType: res.contentType,
      json,
      raw: res.body,
      upstreamLatencyMs: res.latencyMs,
      attempts,
    };
  }

  /**
   * Health probe: authenticated GET of baseUrl + healthCheckPath. 401/403 count as unhealthy
   * because they indicate a credential/subscription problem on our side.
   */
  async probe(
    provider: ApiProvider,
  ): Promise<{
    ok: boolean;
    statusCode: number | null;
    latencyMs: number | null;
    error: string | null;
  }> {
    const started = Date.now();
    try {
      const url = new URL(provider.baseUrl.replace(/\/+$/, '') + (provider.healthCheckPath ?? ''));
      const adapter = this.adapters.get(provider.kind)!;
      const secret =
        provider.authType === 'NONE' && provider.kind !== 'RAPIDAPI'
          ? null
          : await this.creds.get(provider.id);
      const auth = await adapter.authenticate({
        provider,
        url,
        secret,
        getOAuthToken: (pr, s, c) => this.oauthToken(pr, s, c),
      });
      for (const [k, v] of Object.entries(auth.query)) url.searchParams.set(k, v);
      const res = await sendUpstream({
        url,
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': 'ZeZe-HealthCheck/1.0',
          ...((provider.defaultHeaders ?? {}) as Record<string, string>),
          ...auth.headers,
        },
        timeoutMs: Math.min(provider.timeoutMs, 10_000),
        allowedHosts: provider.allowedHosts,
        allowPrivate: this.allowPrivate(provider),
        maxResponseBytes: 256 * 1024,
      });
      const ok = res.status < 500 && res.status !== 401 && res.status !== 403 && res.status !== 429;
      return {
        ok,
        statusCode: res.status,
        latencyMs: res.latencyMs,
        error: ok ? null : `HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        ok: false,
        statusCode: null,
        latencyMs: Date.now() - started,
        error: (e as Error).message.slice(0, 300),
      };
    }
  }

  private async checkQuota(providerId: string, limits?: ProviderLimits) {
    if (!limits?.usageLimitPerDay && !limits?.usageLimitPerMonth) return;
    const d = new Date();
    const day = d.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const m = this.redis.client.multi();
    if (limits.usageLimitPerDay)
      m.incr(`pq:d:${providerId}:${day}`).expire(`pq:d:${providerId}:${day}`, 172800);
    if (limits.usageLimitPerMonth)
      m.incr(`pq:m:${providerId}:${month}`).expire(`pq:m:${providerId}:${month}`, 40 * 86400);
    const r = (await m.exec()) ?? [];
    let i = 0;
    if (limits.usageLimitPerDay) {
      if (Number(r[i]?.[1]) > limits.usageLimitPerDay)
        throw new EngineError('PROVIDER_QUOTA', 'Daily supplier quota reached');
      i += 2;
    }
    if (limits.usageLimitPerMonth && Number(r[i]?.[1]) > limits.usageLimitPerMonth)
      throw new EngineError('PROVIDER_QUOTA', 'Monthly supplier quota reached');
  }

  /** OAuth2 client-credentials with an encrypted Redis token cache. Token URL must be on the provider allowlist. */
  private async oauthToken(
    provider: ApiProvider,
    secret: ProviderSecret,
    cfg: AuthConfig,
  ): Promise<string> {
    const key = `oauth:${provider.id}`;
    const cached = await this.redis.client.get(key);
    if (cached) {
      try {
        return this.enc.decrypt(JSON.parse(cached), 'oauth');
      } catch {
        /* fall through */
      }
    }
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: secret.clientId!,
      client_secret: secret.clientSecret!,
    });
    if (cfg.scope) form.set('scope', cfg.scope);
    if (cfg.audience) form.set('audience', cfg.audience);
    let res: UpstreamHttpResponse;
    try {
      res = await sendUpstream({
        url: new URL(cfg.tokenUrl!),
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: form.toString(),
        timeoutMs: provider.timeoutMs,
        allowedHosts: provider.allowedHosts,
        allowPrivate: this.allowPrivate(provider),
      });
    } catch (e) {
      throw new ProviderConfigError(`OAuth2 token request failed: ${(e as Error).message}`);
    }
    if (res.status !== 200)
      throw new ProviderConfigError(`OAuth2 token endpoint returned ${res.status}`);
    const body = JSON.parse(res.body.toString('utf8')) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token)
      throw new ProviderConfigError('OAuth2 token response missing access_token');
    const ttl = Math.max(30, (body.expires_in ?? 3600) - 60);
    await this.redis.client.set(
      key,
      JSON.stringify(this.enc.encrypt(body.access_token, 'oauth')),
      'EX',
      ttl,
    );
    return body.access_token;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
