import request from 'supertest';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { ADMIN, bootApp, Client, closeApp, login, prisma, registerCustomer } from '../helpers';

describe('Wallet, ledger, payments & webhooks', () => {
  let server: unknown;
  let admin: Client;
  beforeAll(async () => {
    server = (await bootApp()).getHttpServer();
    admin = await login(server, ADMIN);
  });
  afterAll(closeApp);

  it('admin adjustments are idempotent, audited, and cannot create negative balances', async () => {
    const { orgId } = await registerCustomer(server);
    const key = 'adjust-idem-0001';
    const a = await admin
      .post(
        `/api/admin/wallets/${orgId}/adjust`,
        { direction: 'credit', amount: '25.50', reason: 'goodwill credit' },
        { 'idempotency-key': key },
      )
      .expect(200);
    const b = await admin
      .post(
        `/api/admin/wallets/${orgId}/adjust`,
        { direction: 'credit', amount: '25.50', reason: 'goodwill credit' },
        { 'idempotency-key': key },
      )
      .expect(200);
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.replayed).toBe(true);
    const conflict = await admin.post(
      `/api/admin/wallets/${orgId}/adjust`,
      { direction: 'credit', amount: '99', reason: 'goodwill credit' },
      { 'idempotency-key': key },
    );
    expect(conflict.status).toBe(409);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '25.5',
    );
    const over = await admin.post(
      `/api/admin/wallets/${orgId}/adjust`,
      { direction: 'debit', amount: '30', reason: 'test overdraft' },
      { 'idempotency-key': 'adjust-idem-0002' },
    );
    expect(over.status).toBe(402);
    expect(await prisma.auditLog.count({ where: { orgId, action: 'admin.wallet.credit' } })).toBe(
      1,
    );
  });

  it('allows negative balance only within an explicit enterprise credit limit', async () => {
    const { orgId } = await registerCustomer(server);
    await admin.patch(`/api/admin/wallets/${orgId}`, { creditLimit: '10' }).expect(200);
    await admin
      .post(
        `/api/admin/wallets/${orgId}/adjust`,
        { direction: 'debit', amount: '8', reason: 'enterprise usage' },
        { 'idempotency-key': 'credit-limit-0001' },
      )
      .expect(200);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '-8',
    );
    const r = await admin.post(
      `/api/admin/wallets/${orgId}/adjust`,
      { direction: 'debit', amount: '3', reason: 'enterprise usage' },
      { 'idempotency-key': 'credit-limit-0002' },
    );
    expect(r.status).toBe(402);
  });

  it('the ledger is append-only at the database level', async () => {
    const tx = await prisma.walletTransaction.findFirstOrThrow();
    await expect(
      prisma.$executeRaw`UPDATE wallet_transactions SET amount = 0 WHERE id = ${tx.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM wallet_transactions WHERE id = ${tx.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`UPDATE wallets SET balance = -1 WHERE "orgId" = ${(await prisma.wallet.findFirstOrThrow({ where: { creditLimit: 0 } })).orgId}::uuid`,
    ).rejects.toThrow();
  });

  it('mock checkout → signed webhook credits the wallet exactly once and issues a paid invoice', async () => {
    const { client, orgId } = await registerCustomer(server);
    const init = await client
      .post(
        '/api/billing/payments',
        { provider: 'MOCK', purpose: 'WALLET_TOPUP', amount: '20' },
        { 'idempotency-key': 'topup-0000001' },
      )
      .expect(201);
    expect(init.body.status).toBe('REQUIRES_ACTION');
    expect(init.body.checkoutUrl).toContain('/mock-checkout');
    // Same idempotency key → same payment; different body → conflict
    const again = await client
      .post(
        '/api/billing/payments',
        { provider: 'MOCK', purpose: 'WALLET_TOPUP', amount: '20' },
        { 'idempotency-key': 'topup-0000001' },
      )
      .expect(201);
    expect(again.body.id).toBe(init.body.id);
    expect(
      (
        await client.post(
          '/api/billing/payments',
          { provider: 'MOCK', purpose: 'WALLET_TOPUP', amount: '30' },
          { 'idempotency-key': 'topup-0000001' },
        )
      ).status,
    ).toBe(409);
    // Client-side "confirmation" is not trusted: nothing credited yet.
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '0',
    );
    await client
      .post(`/api/billing/payments/${init.body.id}/mock-complete`, { outcome: 'SUCCEEDED' })
      .expect(200);
    await client
      .post(`/api/billing/payments/${init.body.id}/mock-complete`, { outcome: 'SUCCEEDED' })
      .expect(200);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '20',
    );
    expect(
      await prisma.walletTransaction.count({ where: { wallet: { orgId }, type: 'TOPUP' } }),
    ).toBe(1);
    const inv = await client.get('/api/billing/invoices').expect(200);
    expect(inv.body[0].status).toBe('PAID');
    const pdf = await client.get(`/api/billing/invoices/${inv.body[0].id}/pdf`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const csv = await client.get('/api/billing/statement.csv').expect(200);
    expect(csv.text).toContain('TOPUP');
  });

  it('rejects webhooks with invalid signatures', async () => {
    const r = await request(server as never)
      .post('/api/webhooks/mock')
      .set('content-type', 'application/json')
      .set('x-mock-signature', 'deadbeef')
      .send({ eventId: 'x', paymentId: 'y', outcome: 'SUCCEEDED' });
    expect(r.status).toBe(403);
    const s = await request(server as never)
      .post('/api/webhooks/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', 't=1,v1=bad')
      .send({ id: 'evt_1' });
    expect(s.status).toBe(403);
  });

  it('verifies real Stripe signatures, dedupes replays, and checks amounts', async () => {
    const { orgId } = await registerCustomer(server);
    const pay = await prisma.payment.create({
      data: {
        orgId,
        provider: 'STRIPE',
        purpose: 'WALLET_TOPUP',
        amount: new Prisma.Decimal('15'),
        idempotencyKey: `stripe-test-${orgId}`,
        externalId: `cs_test_${orgId.slice(0, 8)}`,
        status: 'REQUIRES_ACTION',
        metadata: { creditAmount: '15', description: 'Wallet top-up' },
      },
    });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const send = (evt: object) => {
      const payload = JSON.stringify(evt);
      const header = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.STRIPE_WEBHOOK_SECRET!,
      });
      return request(server as never)
        .post('/api/webhooks/stripe')
        .set('content-type', 'application/json')
        .set('stripe-signature', header)
        .send(payload);
    };
    const evt = (id: string, amount: number) => ({
      id,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: pay.externalId,
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: amount,
          currency: 'usd',
          metadata: { paymentId: pay.id },
          client_reference_id: pay.id,
        },
      },
    });
    const bad = await send(evt('evt_wrong_amount', 999));
    expect(bad.status).toBe(409);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '0',
    );
    await send(evt('evt_ok_1', 1500)).expect(200);
    const dup = await send(evt('evt_ok_1', 1500)).expect(200);
    expect(dup.body.duplicate).toBe(true);
    await send(evt('evt_ok_2_redelivery', 1500)).expect(200); // different event id, same payment → still once
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '15',
    );
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe(
      'SUCCEEDED',
    );
  });

  it('manual bank transfers stay pending until an admin verifies them; refunds debit the wallet', async () => {
    const { client, orgId } = await registerCustomer(server);
    const p = await client
      .post(
        '/api/billing/payments',
        { provider: 'MANUAL_BANK', purpose: 'WALLET_TOPUP', amount: '40' },
        { 'idempotency-key': 'bank-0000001' },
      )
      .expect(201);
    expect(p.body.status).toBe('PENDING');
    expect(p.body.bankReference).toMatch(/^ZZ-/);
    expect(p.body.instructions).toContain(p.body.bankReference);
    await admin
      .post(`/api/admin/payments/${p.body.id}/verify`, { bankReference: 'BANK-TX-1' })
      .expect(204);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '40',
    );
    await admin
      .post(`/api/admin/payments/${p.body.id}/refund`, { amount: '15', reason: 'customer request' })
      .expect(204);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '25',
    );
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.body.id } })).status).toBe(
      'PARTIALLY_REFUNDED',
    );
    expect(
      (
        await admin.post(`/api/admin/payments/${p.body.id}/refund`, {
          amount: '30',
          reason: 'too much refund',
        })
      ).status,
    ).toBe(400);
  });

  it('subscribing via payment activates the plan after the verified webhook', async () => {
    const { client, orgId } = await registerCustomer(server);
    const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'GROWTH' } });
    const p = await client
      .post(
        '/api/billing/payments',
        { provider: 'MOCK', purpose: 'SUBSCRIPTION', planId: plan.id },
        { 'idempotency-key': 'subpay-0000001' },
      )
      .expect(201);
    expect(p.body.amount).toBe('99.000000');
    await client.post(`/api/billing/payments/${p.body.id}/mock-complete`, {}).expect(200);
    const sub = await prisma.customerSubscription.findFirst({
      where: { orgId, status: 'ACTIVE' },
      include: { plan: true },
    });
    expect(sub?.plan.code).toBe('GROWTH');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '0',
    );
  });

  it('prepaid credit packs grant their configured credit', async () => {
    const { client, orgId } = await registerCustomer(server);
    const plan = await prisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: 'CREDITS_100' },
    });
    const p = await client
      .post(
        '/api/billing/payments',
        { provider: 'MOCK', purpose: 'WALLET_TOPUP', planId: plan.id },
        { 'idempotency-key': 'pack-0000001' },
      )
      .expect(201);
    await client.post(`/api/billing/payments/${p.body.id}/mock-complete`, {}).expect(200);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '110',
    );
  });

  it('renewal job charges the next period or marks PAST_DUE when funds are missing', async () => {
    const { orgId } = await registerCustomer(server);
    const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'STARTER' } });
    await prisma.customerSubscription.create({
      data: {
        orgId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(Date.now() - 31 * 86400_000),
        currentPeriodEnd: new Date(Date.now() - 1000),
      },
    });
    const { SubscriptionService } = await import('../../src/modules/billing/subscription.service');
    const app = await bootApp();
    const subs = app.get(SubscriptionService);
    await subs.processRenewals();
    expect((await prisma.customerSubscription.findFirstOrThrow({ where: { orgId } })).status).toBe(
      'PAST_DUE',
    );
    await admin
      .post(
        `/api/admin/wallets/${orgId}/adjust`,
        { direction: 'credit', amount: '50', reason: 'top up for renewal' },
        { 'idempotency-key': `renew-${orgId}` },
      )
      .expect(200);
    await subs.processRenewals();
    const s = await prisma.customerSubscription.findFirstOrThrow({ where: { orgId } });
    expect(s.status).toBe('ACTIVE');
    expect(s.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    expect((await prisma.wallet.findUniqueOrThrow({ where: { orgId } })).balance.toString()).toBe(
      '21',
    );
  });
});
