import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/bootstrap';

export const ADMIN = { email: 'admin@test.local', password: 'Admin-Password-123' };
export const DEMO = { email: 'demo@acme.test', password: 'DemoPass-2026' };

let app: INestApplication | null = null;
export const prisma = new PrismaClient();

export async function bootApp() {
  if (!app) {
    app = await createApp({ logger: false });
    await app.init();
  }
  return app;
}
export async function closeApp() {
  await app?.close();
  app = null;
  await prisma.$disconnect();
}

/** Cookie-jar client that handles the CSRF double-submit token like the web app does. */
export class Client {
  readonly agent: TestAgent;
  csrf = '';
  /** Each client gets its own source IP (via X-Forwarded-For, trusted proxy hop) so per-IP limits stay realistic. */
  readonly ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  constructor(server: unknown) {
    this.agent = request.agent(server as never).set('x-forwarded-for', this.ip);
  }
  async init() {
    const r = await this.agent.get('/api/auth/csrf');
    this.csrf = r.body.csrfToken;
    return this;
  }
  get(url: string) {
    return this.agent.get(url);
  }
  post(url: string, body?: object, headers: Record<string, string> = {}) {
    return this.agent
      .post(url)
      .set('x-csrf-token', this.csrf)
      .set(headers)
      .send(body ?? {});
  }
  patch(url: string, body?: object, headers: Record<string, string> = {}) {
    return this.agent
      .patch(url)
      .set('x-csrf-token', this.csrf)
      .set(headers)
      .send(body ?? {});
  }
  put(url: string, body?: object) {
    return this.agent
      .put(url)
      .set('x-csrf-token', this.csrf)
      .send(body ?? {});
  }
  delete(url: string) {
    return this.agent.delete(url).set('x-csrf-token', this.csrf);
  }
}

export async function login(server: unknown, creds: { email: string; password: string }) {
  const c = await new Client(server).init();
  const r = await c.post('/api/auth/login', creds);
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}

let n = 0;
export async function registerCustomer(
  server: unknown,
  opts: { accountType?: 'CUSTOMER' | 'AGENCY'; name?: string } = {},
) {
  const c = await new Client(server).init();
  const email = `user${Date.now()}${n++}${Math.floor(Math.random() * 1e6)}@test.local`;
  const password = 'Str0ng-Passw0rd!';
  const r = await c.post('/api/auth/register', {
    name: opts.name ?? 'Test User',
    email,
    password,
    organizationName: `${opts.name ?? 'Test'} Org ${n}`,
    accountType: opts.accountType ?? 'CUSTOMER',
    acceptTerms: true,
  });
  if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.body)}`);
  return {
    client: c,
    email,
    password,
    orgId: r.body.orgId as string,
    userId: r.body.user.id as string,
  };
}

/** Admin wallet credit through the real admin API (audited, idempotent). */
export async function fund(admin: Client, orgId: string, amount: string) {
  const r = await admin.post(
    `/api/admin/wallets/${orgId}/adjust`,
    { direction: 'credit', amount, reason: 'test funding' },
    { 'idempotency-key': `fund-${randomUUID()}` },
  );
  if (r.status !== 200) throw new Error(`fund failed ${r.status} ${JSON.stringify(r.body)}`);
}

export async function createKey(c: Client, body: object = {}) {
  const r = await c.post('/api/keys', { name: 'test key', ...body });
  if (r.status !== 201) throw new Error(`key failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { id: string; secret: string; prefix: string };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
