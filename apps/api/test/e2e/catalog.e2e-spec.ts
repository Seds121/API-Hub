import request from 'supertest';
import { ADMIN, bootApp, Client, closeApp, login, prisma } from '../helpers';

describe('Catalog, documentation & provider administration', () => {
  let server: unknown;
  let admin: Client;
  beforeAll(async () => {
    server = (await bootApp()).getHttpServer();
    admin = await login(server, ADMIN);
  });
  afterAll(closeApp);

  it('public search supports filters and sorting and only lists published APIs', async () => {
    const all = await request(server as never)
      .get('/api/catalog/products')
      .expect(200);
    const slugs = all.body.items.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain('social-profiles');
    expect(slugs).not.toContain('ai-text-summarize');
    const q = await request(server as never)
      .get('/api/catalog/products?q=email')
      .expect(200);
    expect(q.body.items.map((p: { slug: string }) => p.slug)).toEqual(['email-verification']);
    const cat = await request(server as never)
      .get('/api/catalog/products?category=geolocation')
      .expect(200);
    expect(
      cat.body.items.every(
        (p: { category: { slug: string } }) => p.category.slug === 'geolocation',
      ),
    ).toBe(true);
    const price = await request(server as never)
      .get('/api/catalog/products?sort=price')
      .expect(200);
    const prices = price.body.items.map((p: { pricePerRequest: string }) =>
      Number(p.pricePerRequest),
    );
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    const sub = await request(server as never)
      .get('/api/catalog/products?pricing=subscription')
      .expect(200);
    expect(
      sub.body.items.every((p: { requiresSubscription: boolean }) => p.requiresSubscription),
    ).toBe(true);
  });

  it('product details & OpenAPI never expose suppliers, credentials or costs', async () => {
    const d = await request(server as never)
      .get('/api/catalog/products/social-profiles')
      .expect(200);
    const s = JSON.stringify(d.body);
    expect(d.body.endpoints.length).toBe(2);
    expect(d.body.pricing.defaultPricePerRequest).toBe('0.015000');
    for (const forbidden of [
      'rapidapi',
      'integrations',
      'costPerCall',
      'mock-rapidapi-key',
      '127.0.0.1',
      'provider',
    ])
      expect(s.toLowerCase()).not.toContain(forbidden.toLowerCase());
    const oa = await request(server as never)
      .get('/api/catalog/products/social-profiles/openapi.json')
      .expect(200);
    expect(oa.body.openapi).toBe('3.0.3');
    expect(Object.keys(oa.body.paths)).toContain('/v1/social-profiles/profile');
    expect(JSON.stringify(oa.body).toLowerCase()).not.toContain('rapidapi');
    await request(server as never)
      .get('/api/catalog/products/ai-text-summarize')
      .expect(404);
  });

  it('supplier credentials are write-only (never returned) and encrypted at rest', async () => {
    const list = await admin.get('/api/admin/providers').expect(200);
    const s = JSON.stringify(list.body);
    expect(s).not.toContain('mock-rapidapi-key-for-dev-only');
    expect(s).not.toContain('cipherText');
    const p = list.body.find((x: { slug: string }) => x.slug === 'demo-rapidapi-social');
    const d = await admin.get(`/api/admin/providers/${p.id}`).expect(200);
    expect(JSON.stringify(d.body)).not.toContain('mock-rapidapi-key-for-dev-only');
    expect(d.body.credentials[0].hint).toBeDefined();
    const raw = await prisma.providerCredential.findFirstOrThrow({ where: { providerId: p.id } });
    expect(raw.cipherText).not.toContain('mock-rapidapi');
  });

  it('rejects secret-bearing static headers and unsafe upstream paths', async () => {
    const r = await admin.post('/api/admin/providers', {
      name: 'X',
      slug: 'x-bad-headers',
      kind: 'DIRECT_REST',
      baseUrl: 'https://api.example.com',
      defaultHeaders: { Authorization: 'Bearer leak' },
    });
    expect(r.status).toBe(400);
    const ep = await prisma.apiEndpoint.findFirstOrThrow({
      where: { product: { slug: 'social-profiles' } },
    });
    const p = await prisma.apiProvider.findUniqueOrThrow({
      where: { slug: 'demo-rapidapi-social' },
    });
    const bad = await admin.post('/api/admin/integrations', {
      endpointId: ep.id,
      providerId: p.id,
      upstreamMethod: 'GET',
      upstreamPath: '/../../etc/passwd',
    });
    expect(bad.status).toBe(400);
  });

  it('provides a working integration test function and health checks', async () => {
    const integ = await prisma.apiIntegration.findFirstOrThrow({
      where: { endpoint: { product: { slug: 'social-profiles' }, path: '/profile' } },
    });
    const t = await admin
      .post(`/api/admin/integrations/${integ.id}/test`, { query: { username: 'tester' } })
      .expect(200);
    expect(t.body.ok).toBe(true);
    expect(t.body.status).toBe(200);
    expect(t.body.bodyPreview.data.username).toBe('tester');
    const bad = await admin
      .post(`/api/admin/integrations/${integ.id}/test`, { query: {} })
      .expect(200);
    expect(bad.body.ok).toBe(false);
    const prov = await prisma.apiProvider.findUniqueOrThrow({
      where: { slug: 'demo-direct-verify' },
    });
    const h = await admin.post(`/api/admin/providers/${prov.id}/health-check`).expect(200);
    expect(h.body.ok).toBe(true);
  });

  it('admin analytics distinguishes actual vs estimated supplier cost', async () => {
    const o = await admin.get('/api/admin/analytics/overview').expect(200);
    expect(o.body.supplierCostThisMonth).toHaveProperty('actual');
    expect(o.body.supplierCostThisMonth).toHaveProperty('estimated');
    expect(o.body.supplierCostThisMonth).toHaveProperty('unknownCount');
    await admin.get('/api/admin/analytics/timeseries?granularity=hour&days=1').expect(200);
    await admin.get('/api/admin/analytics/breakdown').expect(200);
    await admin.get('/api/admin/analytics/revenue').expect(200);
    await admin.get('/api/admin/audit-logs').expect(200);
  });

  it('Swagger/OpenAPI for the platform API is served', async () => {
    const r = await request(server as never)
      .get('/api/docs-json')
      .expect(200);
    expect(r.body.info.title).toContain('Ze-Ze Technologies');
    expect(Object.keys(r.body.paths)).toContain('/api/keys');
  });
});
