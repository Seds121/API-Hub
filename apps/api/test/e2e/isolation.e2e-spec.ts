import request from 'supertest';
import {
  ADMIN,
  bootApp,
  closeApp,
  createKey,
  fund,
  login,
  prisma,
  registerCustomer,
} from '../helpers';

describe('Organization (tenant) isolation', () => {
  let server: unknown;
  beforeAll(async () => {
    server = (await bootApp()).getHttpServer();
  });
  afterAll(closeApp);

  it('a tenant cannot read, modify or revoke another tenant’s keys', async () => {
    const a = await registerCustomer(server);
    const b = await registerCustomer(server);
    const bKey = await createKey(b.client);
    const list = await a.client.get('/api/keys').expect(200);
    expect(list.body.find((k: { id: string }) => k.id === bKey.id)).toBeUndefined();
    expect((await a.client.patch(`/api/keys/${bKey.id}`, { name: 'hijack' })).status).toBe(404);
    expect((await a.client.delete(`/api/keys/${bKey.id}`)).status).toBe(404);
    expect((await a.client.post(`/api/keys/${bKey.id}/regenerate`)).status).toBe(404);
    expect(
      (await prisma.customerApiKey.findUniqueOrThrow({ where: { id: bKey.id } })).revokedAt,
    ).toBeNull();
  });

  it('x-org-id cannot be used to switch into an organization the user is not a member of', async () => {
    const a = await registerCustomer(server);
    const b = await registerCustomer(server);
    const me = await a.client.get('/api/auth/me').set('x-org-id', b.orgId).expect(200);
    expect(me.body.org.id).toBe(a.orgId);
    expect((await a.client.post('/api/auth/switch-org', { orgId: b.orgId })).status).toBe(404);
    const overview = await a.client
      .get('/api/billing/overview')
      .set('x-org-id', b.orgId)
      .expect(200);
    const bw = await prisma.wallet.findUniqueOrThrow({ where: { orgId: b.orgId } });
    expect(overview.body.wallet.id).not.toBe(bw.id);
  });

  it('usage, billing and invoices are scoped to the caller’s organization', async () => {
    const admin = await login(server, ADMIN);
    const a = await registerCustomer(server);
    const b = await registerCustomer(server);
    await fund(admin, b.orgId, '2');
    const bKey = await createKey(b.client);
    await request(server as never)
      .get('/v1/ip-geolocation/ip/1.1.1.1')
      .set('Authorization', `Bearer ${bKey.secret}`)
      .expect(200);
    const ua = await a.client.get('/api/usage/records').expect(200);
    expect(ua.body.total).toBe(0);
    const ub = await b.client.get('/api/usage/records').expect(200);
    expect(ub.body.total).toBe(1);
    const tx = await a.client.get('/api/billing/transactions').expect(200);
    expect(tx.body.total).toBe(0);
  });

  it('a key always bills its own organization', async () => {
    const admin = await login(server, ADMIN);
    const a = await registerCustomer(server);
    const b = await registerCustomer(server);
    await fund(admin, a.orgId, '1');
    await fund(admin, b.orgId, '1');
    const aKey = await createKey(a.client);
    await request(server as never)
      .get('/v1/ip-geolocation/ip/1.1.1.1')
      .set('Authorization', `Bearer ${aKey.secret}`)
      .set('x-org-id', b.orgId)
      .expect(200);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { orgId: a.orgId } })).balance.toString(),
    ).toBe('0.998');
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { orgId: b.orgId } })).balance.toString(),
    ).toBe('1');
  });

  it('suspended organizations are refused at the gateway', async () => {
    const admin = await login(server, ADMIN);
    const a = await registerCustomer(server);
    await fund(admin, a.orgId, '1');
    const k = await createKey(a.client);
    await admin.patch(`/api/admin/organizations/${a.orgId}`, { status: 'SUSPENDED' }).expect(200);
    await new Promise((r) => setTimeout(r, 10_500)); // route/org cache TTL
    const r = await request(server as never)
      .get('/v1/ip-geolocation/ip/1.1.1.1')
      .set('Authorization', `Bearer ${k.secret}`);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('ORGANIZATION_SUSPENDED');
  });

  it('support tickets are private to their organization', async () => {
    const a = await registerCustomer(server);
    const b = await registerCustomer(server);
    const t = await a.client
      .post('/api/support/tickets', {
        subject: 'Billing question',
        message: 'Please explain my invoice.',
      })
      .expect(201);
    expect((await b.client.get(`/api/support/tickets/${t.body.id}`)).status).toBe(404);
  });
});
