import request from 'supertest';
import {
  ADMIN,
  bootApp,
  Client,
  closeApp,
  fund,
  login,
  prisma,
  registerCustomer,
} from '../helpers';

describe('Agency reseller system', () => {
  let server: unknown;
  let admin: Client;
  beforeAll(async () => {
    server = (await bootApp()).getHttpServer();
    admin = await login(server, ADMIN);
  });
  afterAll(closeApp);

  async function activeAgency() {
    const ag = await registerCustomer(server, { accountType: 'AGENCY', name: 'Agency' });
    await admin
      .post(`/api/admin/organizations/${ag.orgId}/agency-agreement`, {
        wholesaleDiscountPercent: '20',
        revenueSharePercent: '10',
        maxSubaccounts: 2,
      })
      .expect(201);
    await fund(admin, ag.orgId, '50');
    return ag;
  }

  it('requires an admin-approved agency agreement', async () => {
    const ag = await registerCustomer(server, { accountType: 'AGENCY' });
    const r = await ag.client.get('/api/agency/subaccounts');
    expect(r.status).toBe(403);
    const cust = await registerCustomer(server);
    expect((await cust.client.get('/api/agency/subaccounts')).status).toBe(403);
  });

  it('creates subaccounts (within limits), transfers credit, and issues subaccount keys', async () => {
    const ag = await activeAgency();
    const s1 = await ag.client
      .post('/api/agency/subaccounts', { name: 'Client One', monthlySpendLimit: '5' })
      .expect(201);
    await ag.client.post('/api/agency/subaccounts', { name: 'Client Two' }).expect(201);
    expect((await ag.client.post('/api/agency/subaccounts', { name: 'Client Three' })).status).toBe(
      400,
    );
    await ag.client
      .post(
        `/api/agency/subaccounts/${s1.body.id}/transfer`,
        { amount: '10' },
        { 'idempotency-key': 'xfer-00000001' },
      )
      .expect(200);
    await ag.client
      .post(
        `/api/agency/subaccounts/${s1.body.id}/transfer`,
        { amount: '10' },
        { 'idempotency-key': 'xfer-00000001' },
      )
      .expect(200);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { orgId: s1.body.id } })).balance.toString(),
    ).toBe('10');
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { orgId: ag.orgId } })).balance.toString(),
    ).toBe('40');
    const key = await ag.client
      .post(`/api/agency/subaccounts/${s1.body.id}/keys`, { name: 'client key' })
      .expect(201);
    // social-profiles license permits sub-resale → works, billed to the subaccount
    const ok = await request(server as never)
      .get('/v1/social-profiles/profile?username=x')
      .set('Authorization', `Bearer ${key.body.secret}`)
      .expect(200);
    expect(ok.headers['x-zz-cost']).toBe('0.015000');
    // email-verification license does NOT permit sub-resale → refused for subaccounts
    const denied = await request(server as never)
      .post('/v1/email-verification/verify')
      .set('Authorization', `Bearer ${key.body.secret}`)
      .send({ email: 'a@b.co' });
    expect(denied.status).toBe(503);
    expect(denied.body.error.code).toBe('API_UNAVAILABLE');
    const report = await ag.client.get('/api/agency/reports').expect(200);
    expect(
      report.body.subaccounts.find((s: { orgId: string }) => s.orgId === s1.body.id).requests,
    ).toBeGreaterThanOrEqual(1);
  });

  it('agency gets wholesale prices; resale prices cannot go below wholesale; spend caps are enforced', async () => {
    const ag = await activeAgency();
    const key = await ag.client.post('/api/keys', { name: 'agency own' }).expect(201);
    const own = await request(server as never)
      .get('/v1/social-profiles/profile?username=x')
      .set('Authorization', `Bearer ${key.body.secret}`)
      .expect(200);
    expect(own.headers['x-zz-cost']).toBe('0.012000'); // 0.015 − 20%
    const sub = await ag.client
      .post('/api/agency/subaccounts', { name: 'Capped', monthlySpendLimit: '0.03' })
      .expect(201);
    const prod = await prisma.apiProduct.findUniqueOrThrow({ where: { slug: 'social-profiles' } });
    expect(
      (
        await ag.client.post(`/api/agency/subaccounts/${sub.body.id}/pricing`, {
          productId: prod.id,
          pricePerRequest: '0.01',
        })
      ).status,
    ).toBe(400);
    await ag.client
      .post(`/api/agency/subaccounts/${sub.body.id}/pricing`, {
        productId: prod.id,
        pricePerRequest: '0.02',
      })
      .expect(201);
    await ag.client
      .post(
        `/api/agency/subaccounts/${sub.body.id}/transfer`,
        { amount: '1' },
        { 'idempotency-key': 'xfer-cap-00001' },
      )
      .expect(200);
    const sk = await ag.client
      .post(`/api/agency/subaccounts/${sub.body.id}/keys`, { name: 'k' })
      .expect(201);
    const call = () =>
      request(server as never)
        .get('/v1/social-profiles/profile?username=x')
        .set('Authorization', `Bearer ${sk.body.secret}`);
    const first = await call().expect(200);
    expect(first.headers['x-zz-cost']).toBe('0.020000');
    const second = await call();
    expect(second.status).toBe(402);
    expect(second.body.error.code).toBe('SPENDING_LIMIT_REACHED');
  });

  it('an agency cannot manage another agency’s subaccounts', async () => {
    const a = await activeAgency();
    const b = await activeAgency();
    const sub = await a.client
      .post('/api/agency/subaccounts', { name: 'Private client' })
      .expect(201);
    expect((await b.client.get(`/api/agency/subaccounts/${sub.body.id}/keys`)).status).toBe(404);
    expect(
      (
        await b.client.post(
          `/api/agency/subaccounts/${sub.body.id}/transfer`,
          { amount: '1' },
          { 'idempotency-key': 'xfer-steal-0001' },
        )
      ).status,
    ).toBe(404);
    expect(
      (await b.client.patch(`/api/agency/subaccounts/${sub.body.id}`, { status: 'SUSPENDED' }))
        .status,
    ).toBe(404);
  });
});
