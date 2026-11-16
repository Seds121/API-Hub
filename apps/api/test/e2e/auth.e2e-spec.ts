import {
  ADMIN,
  bootApp,
  Client,
  closeApp,
  DEMO,
  login,
  prisma,
  registerCustomer,
} from '../helpers';

describe('Auth, sessions, CSRF & permissions', () => {
  let server: unknown;
  beforeAll(async () => {
    server = (await bootApp()).getHttpServer();
  });
  afterAll(closeApp);

  it('registers a customer with org, owner role and empty wallet', async () => {
    const { client, orgId, email } = await registerCustomer(server);
    const me = await client.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.org.id).toBe(orgId);
    expect(me.body.orgRole).toBe('ORG_OWNER');
    expect(me.body.isPlatformStaff).toBe(false);
    const wallet = await prisma.wallet.findUnique({ where: { orgId } });
    expect(wallet?.balance.toString()).toBe('0');
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects weak passwords, duplicate emails and missing terms', async () => {
    const c = await new Client(server).init();
    const weak = await c.post('/api/auth/register', {
      name: 'A B',
      email: 'weak@test.local',
      password: 'short',
      organizationName: 'Org',
      acceptTerms: true,
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_FAILED');
    const dup = await c.post('/api/auth/register', {
      name: 'A B',
      email: DEMO.email,
      password: 'Str0ng-Passw0rd!',
      organizationName: 'Org',
      acceptTerms: true,
    });
    expect(dup.status).toBe(409);
    const noTerms = await c.post('/api/auth/register', {
      name: 'A B',
      email: 'x1@test.local',
      password: 'Str0ng-Passw0rd!',
      organizationName: 'Org',
    });
    expect(noTerms.status).toBe(400);
  });

  it('logs in, rejects bad passwords uniformly, and locks after repeated failures', async () => {
    const { email, password } = await registerCustomer(server);
    const c = await new Client(server).init();
    const unknown = await c.post('/api/auth/login', {
      email: 'nobody@test.local',
      password: 'whatever',
    });
    const wrong = await c.post('/api/auth/login', { email, password: 'wrong-password' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
    for (let i = 0; i < 4; i++)
      await c.post('/api/auth/login', { email, password: 'wrong-password' });
    const locked = await c.post('/api/auth/login', { email, password });
    expect(locked.status).toBe(423);
  });

  it('requires a CSRF token on state-changing cookie requests', async () => {
    const c = await login(server, DEMO);
    const noToken = await c.agent.post('/api/keys').send({ name: 'x' });
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe('CSRF_FAILED');
    const badToken = await c.agent
      .post('/api/keys')
      .set('x-csrf-token', 'nope')
      .send({ name: 'x' });
    expect(badToken.status).toBe(403);
  });

  it('logout revokes the session server-side', async () => {
    const { client } = await registerCustomer(server);
    await client.post('/api/auth/logout').expect(204);
    await client.get('/api/auth/me').expect(401);
  });

  it('issues short-lived JWTs bound to the session (no CSRF needed, revoked with session)', async () => {
    const { client } = await registerCustomer(server);
    const t = await client.post('/api/auth/token').expect(200);
    const req = (await import('supertest')).default;
    const me = await req(server as never)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${t.body.accessToken}`)
      .expect(200);
    expect(me.body.user).toBeDefined();
    await req(server as never)
      .post('/api/keys')
      .set('Authorization', `Bearer ${t.body.accessToken}`)
      .send({ name: 'jwt key' })
      .expect(201);
    await client.post('/api/auth/logout').expect(204);
    await req(server as never)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${t.body.accessToken}`)
      .expect(401);
  });

  it('enforces role-based permissions (customers cannot reach admin; viewers cannot write)', async () => {
    const { client, orgId } = await registerCustomer(server);
    const r = await client.get('/api/admin/providers');
    expect(r.status).toBe(403);
    const admin = await login(server, ADMIN);
    await admin.get('/api/admin/providers').expect(200);
    // Viewer role
    const viewer = await registerCustomer(server);
    await client
      .post('/api/org/members', { email: viewer.email, roleKey: 'ORG_VIEWER' })
      .expect(201);
    await viewer.client.post('/api/auth/switch-org', { orgId }).expect(204);
    await viewer.client.get('/api/keys').expect(200);
    const denied = await viewer.client.post('/api/keys', { name: 'nope' });
    expect(denied.status).toBe(403);
  });

  it('records audit logs for security events', async () => {
    const { userId } = await registerCustomer(server);
    const logs = await prisma.auditLog.findMany({ where: { actorUserId: userId } });
    expect(logs.map((l) => l.action)).toContain('auth.register');
  });
});
