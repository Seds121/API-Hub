import request from 'supertest';
import type { Server } from 'http';
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
import { createMockUpstream, MOCK_BRAVE_KEY } from '../mock-upstream/server';

/**
 * Brave Search as a first-class connector, end to end through the gateway.
 * No real Brave calls in CI: the provider points at an isMock copy of the test mock upstream, whose
 * test-only /res/v1/web/search route enforces Brave's X-Subscription-Token contract.
 */
describe('Brave Search connector', () => {
  let server: unknown;
  let admin: Client;
  let mock: ReturnType<typeof createMockUpstream>;
  let mockUrl: string;

  beforeAll(async () => {
    server = (await bootApp()).getHttpServer();
    admin = await login(server, ADMIN);
    mock = createMockUpstream();
    await new Promise<void>((r) => (mock.server as Server).listen(0, '127.0.0.1', () => r()));
    mockUrl = `http://127.0.0.1:${(mock.server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => mock.server.close(r));
    await closeApp();
  });

  it('exposes the connector registry to admins', async () => {
    const r = await admin.get('/api/admin/connectors').expect(200);
    const brave = r.body.find((c: { kind: string }) => c.kind === 'BRAVE');
    expect(brave.label).toBe('Brave Search');
    expect(brave.defaultBaseUrl).toBe('https://api.search.brave.com');
    expect(brave.templates[0].id).toBe('brave-web-search');
  });

  it('defaults the base URL, locks auth semantics and requires https for real providers', async () => {
    const real = await admin
      .post('/api/admin/providers', {
        name: 'Brave real',
        slug: 'brave-real-default',
        kind: 'BRAVE',
        authType: 'BASIC',
        authConfig: { in: 'query', name: 'k' },
      })
      .expect(201);
    expect(real.body.baseUrl).toBe('https://api.search.brave.com');
    expect(real.body.allowedHosts).toEqual(['api.search.brave.com']);
    expect(real.body.authType).toBe('API_KEY');
    expect(real.body.authConfig).toEqual({});
    expect(real.body.defaultHeaders).toEqual({});
    const insecure = await admin.post('/api/admin/providers', {
      name: 'Brave http',
      slug: 'brave-http',
      kind: 'BRAVE',
      baseUrl: 'http://api.search.brave.com',
    });
    expect(insecure.status).toBe(400);
    // Supplier secrets belong in encrypted credentials, never in default headers.
    const secretHeader = await admin.post('/api/admin/providers', {
      name: 'Brave hdr',
      slug: 'brave-hdr',
      kind: 'BRAVE',
      defaultHeaders: { 'X-Subscription-Token': 'leak' },
    });
    expect(secretHeader.status).toBe(400);
  });

  it('admin flow: credential → template (draft) → license + price → publish → customer call billed', async () => {
    const p = await admin
      .post('/api/admin/providers', {
        name: 'Brave (test)',
        slug: 'brave-test',
        kind: 'BRAVE',
        baseUrl: mockUrl,
        isMock: true,
      })
      .expect(201);
    expect(p.body.kind).toBe('BRAVE');

    // Only API_KEY credentials are accepted for Brave.
    const wrong = await admin.post(`/api/admin/providers/${p.body.id}/credentials`, {
      label: 'x',
      kind: 'BEARER_TOKEN',
      secret: { token: 't' },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toMatch(/X-Subscription-Token/);
    await admin
      .post(`/api/admin/providers/${p.body.id}/credentials`, {
        label: 'Brave key',
        kind: 'API_KEY',
        secret: { apiKey: MOCK_BRAVE_KEY },
      })
      .expect(201);

    // Clean slate for the template slug in case another run left one behind.
    await prisma.apiProduct.updateMany({
      where: { slug: 'brave-web-search' },
      data: { slug: `brave-old-${Date.now()}`, deletedAt: new Date() },
    });
    const t = await admin
      .post(`/api/admin/providers/${p.body.id}/templates/brave-web-search`)
      .expect(201);
    expect(t.body.slug).toBe('brave-web-search');
    expect(t.body.suggestedPricePerRequest).toBe('0.005');
    const product = await prisma.apiProduct.findUniqueOrThrow({
      where: { id: t.body.productId },
      include: { endpoints: { include: { integrations: true } } },
    });
    expect(product.status).toBe('DRAFT');
    expect(product.endpoints[0]!.integrations[0]!.upstreamPath).toBe('/res/v1/web/search');
    expect(
      (await admin.post(`/api/admin/providers/${p.body.id}/templates/brave-web-search`)).status,
    ).toBe(409);

    // Integration test through the engine (real call to the Brave-shaped mock).
    const integ = product.endpoints[0]!.integrations[0]!;
    const test = await admin
      .post(`/api/admin/integrations/${integ.id}/test`, { query: { q: 'openai', count: '3' } })
      .expect(200);
    expect(test.body.ok).toBe(true);
    expect(test.body.bodyPreview.web.results[0].title).toBe('Result for openai');

    // Publish gate still applies: no license/price yet.
    expect((await admin.post(`/api/admin/products/${product.id}/publish`)).status).toBe(409);
    const lic = await admin
      .post(`/api/admin/providers/${p.body.id}/licenses`, {
        redistributionAllowed: true,
        documentRef: 'BRAVE-TEST-AGREEMENT',
      })
      .expect(201);
    await admin
      .post(`/api/admin/providers/${p.body.id}/licenses/${lic.body.id}/decision`, {
        decision: 'VERIFIED',
      })
      .expect(200);
    expect((await admin.post(`/api/admin/products/${product.id}/publish`)).status).toBe(400); // no price yet
    await admin
      .post('/api/admin/pricing', {
        scope: 'PRODUCT_DEFAULT',
        productId: product.id,
        pricePerRequest: t.body.suggestedPricePerRequest,
      })
      .expect(201);
    await admin.post(`/api/admin/products/${product.id}/publish`).expect(200);

    // Customer call through the gateway with their own key; billed normally.
    const c = await registerCustomer(server);
    await fund(admin, c.orgId, '1');
    const key = await createKey(c.client);
    const before = mock.stats.calls.length;
    const r = await request(server as never)
      .get('/v1/brave-web-search/search?q=openai&count=5&safesearch=strict')
      .set('Authorization', `Bearer ${key.secret}`)
      .expect(200);
    expect(r.body.web.results[0].title).toBe('Result for openai');
    expect(r.headers['x-zz-cost']).toBe('0.005000');
    expect(JSON.stringify(r.body)).not.toContain(MOCK_BRAVE_KEY);
    const call = mock.stats.calls[before]!;
    expect(call.path).toBe('/res/v1/web/search');
    expect(call.query).toEqual({ q: 'openai', count: '5', safesearch: 'strict' });
    expect(call.headers['x-subscription-token']).toBe(MOCK_BRAVE_KEY);
    expect(call.headers['authorization']).toBeUndefined(); // customer key never forwarded
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { orgId: c.orgId } })).balance.toString(),
    ).toBe('0.995');

    // Strict validation: bad enum / unknown params are rejected before any upstream call or charge.
    const n = mock.stats.calls.length;
    expect(
      (
        await request(server as never)
          .get('/v1/brave-web-search/search?q=x&safesearch=maybe')
          .set('Authorization', `Bearer ${key.secret}`)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(server as never)
          .get('/v1/brave-web-search/search?q=x&url=http://169.254.169.254')
          .set('Authorization', `Bearer ${key.secret}`)
      ).status,
    ).toBe(400);
    expect(mock.stats.calls.length).toBe(n);

    // A rotated-out / wrong key upstream yields 503 to the customer (our credential problem), not billed.
    await admin
      .post(`/api/admin/providers/${p.body.id}/credentials`, {
        label: 'bad',
        kind: 'API_KEY',
        secret: { apiKey: 'wrong-key' },
      })
      .expect(201);
    // (adding a credential rotates out the old one and invalidates the credential cache)
    const bad = await request(server as never)
      .get('/v1/brave-web-search/search?q=openai')
      .set('Authorization', `Bearer ${key.secret}`);
    expect(bad.status).toBe(503);
    expect(JSON.stringify(bad.body)).not.toMatch(/wrong-key|SUBSCRIPTION_TOKEN/);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { orgId: c.orgId } })).balance.toString(),
    ).toBe('0.995');
  });
});
