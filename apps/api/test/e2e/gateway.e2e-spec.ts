import request from 'supertest';
import {
  ADMIN,
  bootApp,
  Client,
  closeApp,
  createKey,
  fund,
  login,
  prisma,
  registerCustomer,
} from '../helpers';
import { createMockUpstream, MOCK_DIRECT_KEY } from '../mock-upstream/server';
import type { Server } from 'http';

describe('Central API gateway', () => {
  let server: unknown;
  let admin: Client;
  let mock: { server: Server; stats: ReturnType<typeof createMockUpstream>['stats'] };
  let mockUrl: string;

  beforeAll(async () => {
    server = (await bootApp()).getHttpServer();
    admin = await login(server, ADMIN);
    mock = createMockUpstream();
    await new Promise<void>((r) => mock.server.listen(0, '127.0.0.1', () => r()));
    mockUrl = `http://127.0.0.1:${(mock.server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => mock.server.close(r));
    await closeApp();
  });

  const gw = (path: string, key?: string) => {
    const r = request(server as never).get(path);
    return key ? r.set('Authorization', `Bearer ${key}`) : r;
  };

  async function customerWithKey(balance = '10', keyBody: object = {}) {
    const c = await registerCustomer(server);
    if (Number(balance) > 0) await fund(admin, c.orgId, balance);
    const key = await createKey(c.client, keyBody);
    return { ...c, key };
  }

  /** Builds a full product through the admin API against this suite's private mock upstream. */
  async function buildProduct(opts: {
    slug: string;
    path?: string;
    upstreamPath: string;
    price: string;
    isMock?: boolean;
    baseUrl?: string;
    license?: boolean;
    subResale?: boolean;
    cost?: string | null;
    params?: object[];
    retry?: number;
    timeoutMs?: number;
  }) {
    const cat = (await admin.get('/api/admin/categories')).body[0];
    const p = await admin.post('/api/admin/providers', {
      name: `P ${opts.slug}`,
      slug: `p-${opts.slug}`,
      kind: 'DIRECT_REST',
      baseUrl: opts.baseUrl ?? mockUrl,
      authType: 'API_KEY',
      authConfig: { in: 'header', name: 'X-API-Key' },
      isMock: opts.isMock ?? true,
      timeoutMs: opts.timeoutMs ?? 1500,
      retryMaxAttempts: opts.retry ?? 0,
    });
    expect(p.status).toBe(201);
    await admin
      .post(`/api/admin/providers/${p.body.id}/credentials`, {
        label: 'k',
        kind: 'API_KEY',
        secret: { apiKey: MOCK_DIRECT_KEY },
      })
      .expect(201);
    const prod = await admin.post('/api/admin/products', {
      name: `Prod ${opts.slug}`,
      slug: opts.slug,
      summary: 'A test product for the gateway suite',
      categoryId: cat.id,
    });
    expect(prod.status).toBe(201);
    const ep = await admin.post(`/api/admin/products/${prod.body.id}/endpoints`, {
      name: 'ep',
      method: 'GET',
      path: opts.path ?? '/run',
      params: opts.params ?? [],
    });
    expect(ep.status).toBe(201);
    const integ = await admin.post('/api/admin/integrations', {
      endpointId: ep.body.id,
      providerId: p.body.id,
      upstreamMethod: 'GET',
      upstreamPath: opts.upstreamPath,
      costPerCall: opts.cost === undefined ? '0.001' : opts.cost,
      costIsEstimated: false,
    });
    expect(integ.status).toBe(201);
    await admin
      .post('/api/admin/pricing', {
        scope: 'PRODUCT_DEFAULT',
        productId: prod.body.id,
        pricePerRequest: opts.price,
      })
      .expect(201);
    if (opts.license !== false) {
      const lic = await admin.post(`/api/admin/providers/${p.body.id}/licenses`, {
        redistributionAllowed: true,
        subResaleAllowed: opts.subResale ?? false,
        documentRef: 'TEST-AGREEMENT-1',
      });
      await admin
        .post(`/api/admin/providers/${p.body.id}/licenses/${lic.body.id}/decision`, {
          decision: 'VERIFIED',
        })
        .expect(200);
    }
    const pub = await admin.post(`/api/admin/products/${prod.body.id}/publish`);
    return {
      providerId: p.body.id,
      productId: prod.body.id,
      endpointId: ep.body.id,
      integrationId: integ.body.id,
      publish: pub,
    };
  }

  it('routes a request: key → org → upstream → normalized response, with billing & metering', async () => {
    const { key, orgId } = await customerWithKey('10');
    const r = await gw('/v1/social-profiles/profile?username=jane', key.secret).expect(200);
    expect(r.body.data.username).toBe('jane');
    expect(r.headers['x-zz-cost']).toBe('0.015000');
    expect(r.headers['x-request-id']).toBeDefined();
    expect(r.headers['x-upstream-secret-header']).toBeUndefined();
    const usage = await prisma.apiUsageRecord.findUnique({
      where: { correlationId: r.headers['x-request-id'] },
      include: { supplierUsage: true },
    });
    expect(usage?.orgId).toBe(orgId);
    expect(usage?.price.toString()).toBe('0.015');
    expect(usage?.supplierUsage?.cost?.toString()).toBe('0.005');
    expect(usage?.supplierUsage?.costIsEstimated).toBe(false);
    const w = await prisma.wallet.findUniqueOrThrow({ where: { orgId } });
    expect(w.balance.toString()).toBe('9.985');
    expect(w.reserved.toString()).toBe('0');
    const ledger = await prisma.walletTransaction.findFirst({
      where: { idempotencyKey: `usage:${r.headers['x-request-id']}` },
    });
    expect(ledger?.amount.toString()).toBe('-0.015');
  });

  it('applies endpoint-specific prices, query mapping, path params and body passthrough', async () => {
    const { key } = await customerWithKey('5');
    const posts = await gw('/v1/social-profiles/posts?username=jane&limit=3', key.secret).expect(
      200,
    );
    expect(posts.body.posts).toHaveLength(3);
    expect(posts.headers['x-zz-cost']).toBe('0.025000');
    const geo = await gw('/v1/ip-geolocation/ip/1.2.3.4', key.secret).expect(200);
    expect(geo.body.ip).toBe('1.2.3.4');
    const ev = await request(server as never)
      .post('/v1/email-verification/verify')
      .set('X-API-Key', key.secret)
      .send({ email: 'a@b.co' })
      .expect(200);
    expect(ev.body.valid).toBe(true);
    const missing = await request(server as never)
      .post('/v1/email-verification/verify')
      .set('X-API-Key', key.secret)
      .send({})
      .expect(400);
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects missing/invalid/revoked/expired keys and enforces scopes & IP allowlists', async () => {
    const c = await customerWithKey('1');
    expect((await gw('/v1/social-profiles/profile?username=a')).status).toBe(401);
    expect(
      (await gw('/v1/social-profiles/profile?username=a', 'zz_live_AAAAAAAA_' + 'A'.repeat(40)))
        .status,
    ).toBe(401);
    const scoped = await createKey(c.client, { scopes: ['ip-geolocation'] });
    const outOfScope = await gw('/v1/social-profiles/profile?username=a', scoped.secret);
    expect(outOfScope.status).toBe(403);
    expect(outOfScope.body.error.code).toBe('API_NOT_IN_KEY_SCOPE');
    const ipKey = await createKey(c.client, { allowedIps: ['203.0.113.0/24'] });
    expect(
      (
        await gw('/v1/ip-geolocation/ip/1.1.1.1', ipKey.secret).set(
          'x-forwarded-for',
          '198.51.100.7',
        )
      ).body.error.code,
    ).toBe('IP_NOT_ALLOWED');
    await gw('/v1/ip-geolocation/ip/1.1.1.1', ipKey.secret)
      .set('x-forwarded-for', '203.0.113.9')
      .expect(200);
    await c.client.delete(`/api/keys/${c.key.id}`).expect(204);
    expect((await gw('/v1/ip-geolocation/ip/1.1.1.1', c.key.secret)).status).toBe(401);
    const exp = await createKey(c.client, { expiresAt: new Date(Date.now() + 1500).toISOString() });
    await gw('/v1/ip-geolocation/ip/1.1.1.1', exp.secret).expect(200);
    await new Promise((r) => setTimeout(r, 1700));
    expect((await gw('/v1/ip-geolocation/ip/1.1.1.1', exp.secret)).status).toBe(401);
    // Regenerate: old secret dies, new one works
    const regen = await c.client.post(`/api/keys/${scoped.id}/regenerate`).expect(201);
    expect((await gw('/v1/ip-geolocation/ip/1.1.1.1', scoped.secret)).status).toBe(401);
    await gw('/v1/ip-geolocation/ip/1.1.1.1', regen.body.secret).expect(200);
  });

  it('never stores or returns plaintext key material after creation', async () => {
    const c = await customerWithKey('0');
    const list = await c.client.get('/api/keys').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(c.key.secret);
    expect(list.body[0].keyHash).toBeUndefined();
    const row = await prisma.customerApiKey.findUniqueOrThrow({ where: { id: c.key.id } });
    expect(row.keyHash).not.toContain(c.key.secret.slice(-40));
  });

  it('returns 404/405 for unknown routes and does not proxy arbitrary URLs', async () => {
    const { key } = await customerWithKey('1');
    expect((await gw('/v1/nope/profile', key.secret)).body.error.code).toBe('API_NOT_FOUND');
    expect((await gw('/v1/social-profiles/unknown', key.secret)).body.error.code).toBe(
      'API_NOT_FOUND',
    );
    expect(
      (
        await request(server as never)
          .delete('/v1/social-profiles/profile')
          .set('Authorization', `Bearer ${key.secret}`)
      ).status,
    ).toBe(405);
    expect(
      (await gw('/v1/social-profiles/profile?username=x&url=http://169.254.169.254', key.secret))
        .status,
    ).toBe(400);
    const before = mock.stats.calls.length;
    expect([400, 404]).toContain(
      (await gw('/v1/ip-geolocation/ip/..%2F..%2Fadmin', key.secret)).status,
    );
    expect(mock.stats.calls.length).toBe(before);
  });

  it('refuses with 402 on insufficient balance — without calling the upstream or charging', async () => {
    const { key, orgId } = await customerWithKey('0');
    const before = mock.stats.calls.length;
    const r = await gw('/v1/social-profiles/profile?username=a', key.secret).expect(402);
    expect(r.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(mock.stats.calls.length).toBe(before);
    expect(await prisma.walletTransaction.count({ where: { wallet: { orgId } } })).toBe(0);
  });

  it('never overdraws a wallet under concurrent requests (atomic reservations)', async () => {
    const { key, orgId } = await customerWithKey('0.1'); // 0.1 / 0.015 → 6 affordable calls
    const results = await Promise.all(
      Array.from({ length: 15 }, () => gw('/v1/social-profiles/profile?username=a', key.secret)),
    );
    const ok = results.filter((r) => r.status === 200).length;
    const declined = results.filter((r) => r.status === 402).length;
    expect(ok).toBe(6);
    expect(declined).toBe(9);
    const w = await prisma.wallet.findUniqueOrThrow({ where: { orgId } });
    expect(w.balance.toString()).toBe('0.01');
    expect(w.reserved.toString()).toBe('0');
    expect(
      await prisma.walletTransaction.count({ where: { wallet: { orgId }, type: 'USAGE_DEBIT' } }),
    ).toBe(6);
  });

  it('enforces per-key rate limits with 429 and Retry-After', async () => {
    const { key } = await customerWithKey('5', { rateLimitPerMinute: 3 });
    for (let i = 0; i < 3; i++) await gw('/v1/ip-geolocation/ip/1.1.1.1', key.secret).expect(200);
    const r = await gw('/v1/ip-geolocation/ip/1.1.1.1', key.secret).expect(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect(r.headers['retry-after']).toBeDefined();
  });

  it('subscription: required APIs refuse without plan; included quota covers requests at zero cost', async () => {
    const { key, client, orgId } = await customerWithKey('100');
    expect((await gw('/v1/company-lookup/search?name=Acme', key.secret)).body.error.code).toBe(
      'SUBSCRIPTION_REQUIRED',
    );
    const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'STARTER' } });
    const sub = await client.post(
      '/api/billing/subscription',
      { planId: plan.id },
      { 'idempotency-key': `sub-${orgId}` },
    );
    expect(sub.status).toBe(201);
    // Replay with the same key must not charge twice.
    await client
      .post('/api/billing/subscription', { planId: plan.id }, { 'idempotency-key': `sub-${orgId}` })
      .expect(201);
    expect(
      await prisma.walletTransaction.count({
        where: { wallet: { orgId }, type: 'SUBSCRIPTION_FEE' },
      }),
    ).toBe(1);
    const r = await gw('/v1/company-lookup/search?name=Acme', key.secret).expect(200);
    expect(r.headers['x-zz-cost']).toBe('0.000000');
    expect(r.headers['x-zz-covered-by-plan']).toBe('true');
    const s = await prisma.customerSubscription.findFirstOrThrow({
      where: { orgId, status: 'ACTIVE' },
    });
    expect(s.requestsUsedInPeriod).toBe(1);
  });

  it('normalizes upstream failures: 5xx→502, timeout→504, upstream 429→503; none are billed', async () => {
    const fiveHundred = await buildProduct({
      slug: 'gw-fail-500',
      upstreamPath: '/faults/500',
      price: '0.01',
    });
    const slow = await buildProduct({
      slug: 'gw-fail-slow',
      upstreamPath: '/faults/slow',
      price: '0.01',
      timeoutMs: 600,
    });
    const quota = await buildProduct({
      slug: 'gw-fail-429',
      upstreamPath: '/faults/429',
      price: '0.01',
    });
    expect(fiveHundred.publish.status).toBe(200);
    const { key, orgId } = await customerWithKey('1');
    const a = await gw('/v1/gw-fail-500/run', key.secret);
    expect(a.status).toBe(502);
    expect(a.body.error.code).toBe('UPSTREAM_ERROR');
    expect(JSON.stringify(a.body)).not.toContain('boom');
    const b = await gw('/v1/gw-fail-slow/run', key.secret);
    expect(b.status).toBe(504);
    const c = await gw('/v1/gw-fail-429/run', key.secret);
    expect(c.status).toBe(503);
    expect(c.headers['retry-after']).toBe('30');
    const w = await prisma.wallet.findUniqueOrThrow({ where: { orgId } });
    expect(w.balance.toString()).toBe('1');
    expect(w.reserved.toString()).toBe('0');
    void slow;
    void quota;
  });

  it('retries idempotent calls on configured statuses (flaky upstream recovers)', async () => {
    await buildProduct({
      slug: 'gw-flaky',
      upstreamPath: '/faults/flaky',
      price: '0.01',
      retry: 2,
    });
    const { key } = await customerWithKey('1');
    const r = await gw('/v1/gw-flaky/run', key.secret);
    expect(r.status).toBe(200);
    expect(r.body.recovered).toBe(true);
  });

  it('opens the circuit breaker after repeated upstream failures', async () => {
    await buildProduct({ slug: 'gw-breaker', upstreamPath: '/faults/500', price: '0.01' });
    const { key } = await customerWithKey('1');
    for (let i = 0; i < 5; i++) await gw('/v1/gw-breaker/run', key.secret);
    const before = mock.stats.calls.filter((c) => c.path === '/faults/500').length;
    const r = await gw('/v1/gw-breaker/run', key.secret);
    expect(r.status).toBe(503);
    expect(mock.stats.calls.filter((c) => c.path === '/faults/500').length).toBe(before);
  });

  it('blocks SSRF: non-mock providers cannot reach private addresses and redirects are not followed', async () => {
    // Real (non-mock) provider must be https.
    const httpProv = await admin.post('/api/admin/providers', {
      name: 'Bad',
      slug: 'bad-http',
      kind: 'DIRECT_REST',
      baseUrl: 'http://example.com',
      authType: 'NONE',
    });
    expect(httpProv.status).toBe(400);
    const p = await admin.post('/api/admin/providers', {
      name: 'Internal',
      slug: 'ssrf-internal',
      kind: 'DIRECT_REST',
      baseUrl: 'https://127.0.0.1',
      authType: 'NONE',
      isMock: false,
    });
    expect(p.status).toBe(201);
    const ep = await prisma.apiEndpoint.findFirstOrThrow({
      where: { product: { slug: 'ip-geolocation' } },
    });
    const integ = await admin.post('/api/admin/integrations', {
      endpointId: ep.id,
      providerId: p.body.id,
      upstreamMethod: 'GET',
      upstreamPath: '/geo/ip/{ip}',
      isActive: false,
    });
    const t = await admin
      .post(`/api/admin/integrations/${integ.body.id}/test`, { pathParams: { ip: '1.1.1.1' } })
      .expect(200);
    expect(t.body.ok).toBe(false);
    expect(t.body.error).toMatch(/SSRF|Private/);
    // Redirect to metadata IP is returned as-is (3xx), never followed.
    await buildProduct({ slug: 'gw-redirect', upstreamPath: '/faults/redirect', price: '0.01' });
    const { key } = await customerWithKey('1');
    const before = mock.stats.calls.length;
    await gw('/v1/gw-redirect/run', key.secret);
    expect(mock.stats.calls.length).toBe(before + 1);
  });

  it('licensing gate: cannot publish without verified redistribution rights; revocation disables routing', async () => {
    const unlicensed = await buildProduct({
      slug: 'gw-unlicensed',
      upstreamPath: '/health',
      price: '0.01',
      license: false,
    });
    expect(unlicensed.publish.status).toBe(409);
    expect(unlicensed.publish.body.error.code).toBe('LICENSE_REQUIRED');
    const licensed = await buildProduct({
      slug: 'gw-licensed',
      upstreamPath: '/health',
      price: '0.01',
    });
    expect(licensed.publish.status).toBe(200);
    const { key } = await customerWithKey('1');
    await gw('/v1/gw-licensed/run', key.secret).expect(200);
    const lic = await prisma.providerLicense.findFirstOrThrow({
      where: { providerId: licensed.providerId },
    });
    await admin
      .post(`/api/admin/providers/${licensed.providerId}/licenses/${lic.id}/decision`, {
        decision: 'REVOKED',
        notes: 'supplier terminated resale',
      })
      .expect(200);
    const prod = await prisma.apiProduct.findUniqueOrThrow({ where: { id: licensed.productId } });
    expect(prod.status).toBe('DISABLED');
  });

  it('records unknown supplier cost as null (never guessed)', async () => {
    const { key } = await customerWithKey('1');
    const r = await gw('/v1/ip-geolocation/ip/9.9.9.9', key.secret).expect(200);
    const u = await prisma.apiUsageRecord.findUniqueOrThrow({
      where: { correlationId: r.headers['x-request-id'] },
      include: { supplierUsage: true },
    });
    expect(u.supplierUsage?.cost).toBeNull();
  });

  it('test (sandbox) keys return documented examples, never call upstream, never charge', async () => {
    const c = await customerWithKey('0');
    const t = await createKey(c.client, { environment: 'TEST' });
    const before = mock.stats.calls.length;
    const r = await gw('/v1/social-profiles/profile?username=a', t.secret).expect(200);
    expect(r.headers['x-zz-sandbox']).toBe('true');
    expect(r.body.data.username).toBe('acme');
    expect(mock.stats.calls.length).toBe(before);
  });

  it('supports per-organization custom (enterprise) pricing', async () => {
    const { key, orgId } = await customerWithKey('1');
    const prod = await prisma.apiProduct.findUniqueOrThrow({ where: { slug: 'ip-geolocation' } });
    await admin
      .post('/api/admin/pricing', {
        scope: 'ORGANIZATION',
        orgId,
        productId: prod.id,
        pricePerRequest: '0.0005',
      })
      .expect(201);
    const r = await gw('/v1/ip-geolocation/ip/1.1.1.1', key.secret).expect(200);
    expect(r.headers['x-zz-cost']).toBe('0.000500');
  });
});
