import { Injectable } from '@nestjs/common';
import { Payment, PaymentProviderKind, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import { money, moneyStr, positiveMoneySchema } from '@zeze/shared';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, badRequest, notFound } from '../../common/http/app-error';
import { randomBase62 } from '../../common/crypto/tokens';
import { logger } from '../../common/logging/logger';
import type { RequestMeta } from '../../common/decorators';
import { env } from '../../config/env';
import { WalletService } from '../billing/wallet.service';
import { InvoiceService } from '../billing/invoice.service';
import { SubscriptionService } from '../billing/subscription.service';
import { PaymentGateway, VerifiedEvent, WebhookSignatureError } from './providers/types';
import { StripeGateway } from './providers/stripe.gateway';
import { PayPalGateway } from './providers/paypal.gateway';
import { ManualBankGateway, MockGateway } from './providers/offline.gateways';

export const initiatePaymentSchema = z
  .object({
    provider: z.enum(['STRIPE', 'PAYPAL', 'MANUAL_BANK', 'MOCK']),
    purpose: z.enum(['WALLET_TOPUP', 'SUBSCRIPTION']),
    amount: positiveMoneySchema.optional(),
    planId: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.purpose === 'SUBSCRIPTION' && !v.planId)
      ctx.addIssue({ code: 'custom', message: 'planId required for subscriptions' });
    if (v.purpose === 'WALLET_TOPUP' && !v.amount && !v.planId)
      ctx.addIssue({ code: 'custom', message: 'amount or prepaid planId required' });
  });

const MIN_TOPUP = '5';
const MAX_TOPUP = '50000';

@Injectable()
export class PaymentsService {
  private readonly gateways: Map<PaymentProviderKind, PaymentGateway>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
    private readonly invoices: InvoiceService,
    private readonly subs: SubscriptionService,
  ) {
    const all: PaymentGateway[] = [
      new StripeGateway(),
      new PayPalGateway(),
      new ManualBankGateway(),
      new MockGateway(),
    ];
    this.gateways = new Map(all.map((g) => [g.kind, g]));
  }

  private enabledKinds(): PaymentProviderKind[] {
    const wanted = env()
      .PAYMENT_PROVIDERS.split(',')
      .map((s) => s.trim().toUpperCase());
    return [...this.gateways.values()]
      .filter((g) => wanted.includes(g.kind) && g.isConfigured())
      .map((g) => g.kind);
  }

  providers() {
    const enabled = this.enabledKinds();
    return [...this.gateways.values()].map((g) => ({
      kind: g.kind,
      label: g.label,
      enabled: enabled.includes(g.kind),
      requiresCredentials: g.kind === 'STRIPE' || g.kind === 'PAYPAL',
    }));
  }

  private gateway(kind: PaymentProviderKind) {
    if (!this.enabledKinds().includes(kind))
      throw badRequest(`Payment method ${kind} is not enabled.`);
    return this.gateways.get(kind)!;
  }

  /** Create a pending payment and a provider checkout. Idempotent per (org, Idempotency-Key). */
  async initiate(
    orgId: string,
    userId: string,
    input: z.infer<typeof initiatePaymentSchema>,
    idemKey: string,
    meta: RequestMeta,
  ) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(idemKey))
      throw badRequest('A valid Idempotency-Key header (8-100 chars) is required.');
    const scopedKey = `${orgId}:${idemKey}`;
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const prior = await this.prisma.payment.findUnique({ where: { idempotencyKey: scopedKey } });
    if (prior) {
      if ((prior.metadata as { fingerprint?: string }).fingerprint !== fingerprint)
        throw new AppError('IDEMPOTENCY_CONFLICT');
      return this.present(prior);
    }
    const gw = this.gateway(input.provider);
    let amount = input.amount ? money(input.amount) : null;
    let description = 'Wallet top-up';
    let creditAmount: string | null = null;
    if (input.planId) {
      const plan = await this.prisma.subscriptionPlan.findFirst({
        where: { id: input.planId, isActive: true },
      });
      if (!plan) throw notFound('Plan');
      if (input.purpose === 'SUBSCRIPTION' && plan.type !== 'SUBSCRIPTION')
        throw badRequest('Plan is not a subscription plan.');
      if (input.purpose === 'WALLET_TOPUP' && plan.type !== 'PREPAID')
        throw badRequest('Only prepaid credit packs can be bought as a top-up.');
      amount = money(plan.price);
      description =
        input.purpose === 'SUBSCRIPTION' ? `${plan.name} subscription` : `${plan.name} credit pack`;
      creditAmount =
        input.purpose === 'WALLET_TOPUP' ? moneyStr(plan.creditGrant) : moneyStr(plan.price);
    }
    if (!amount) throw badRequest('Amount required.');
    if (
      input.purpose === 'WALLET_TOPUP' &&
      !input.planId &&
      (amount.lt(MIN_TOPUP) || amount.gt(MAX_TOPUP))
    )
      throw badRequest(`Top-ups must be between ${MIN_TOPUP} and ${MAX_TOPUP} USD.`);
    if (!amount.mul(100).isInteger())
      throw badRequest('Payment amounts must have at most 2 decimals.');

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    let payment = await this.prisma.payment.create({
      data: {
        orgId,
        provider: input.provider,
        purpose: input.purpose,
        amount: new Prisma.Decimal(amount.toFixed(6)),
        currency: 'USD',
        planId: input.planId,
        idempotencyKey: scopedKey,
        createdById: userId,
        bankReference:
          input.provider === 'MANUAL_BANK' ? `ZZ-${randomBase62(8).toUpperCase()}` : null,
        metadata: { fingerprint, description, creditAmount: creditAmount ?? amount.toFixed(6) },
      },
    });
    try {
      const appUrl = env().APP_URL;
      const r = await gw.createCheckout(payment, {
        successUrl: `${appUrl}/dashboard/billing?payment=${payment.id}&status=success`,
        cancelUrl: `${appUrl}/dashboard/billing?payment=${payment.id}&status=cancelled`,
        description,
        customerEmail: org.billingEmail,
      });
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          externalId: r.externalId,
          checkoutUrl: r.checkoutUrl,
          status: input.provider === 'MANUAL_BANK' ? 'PENDING' : 'REQUIRES_ACTION',
          metadata: { ...(payment.metadata as object), instructions: r.instructions ?? null },
        },
      });
    } catch (e) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: (e as Error).message.slice(0, 300) },
      });
      logger.error(
        { err: (e as Error).message, provider: input.provider },
        'checkout creation failed',
      );
      throw new AppError(
        'UPSTREAM_UNAVAILABLE',
        'The payment provider could not create a checkout. Please try again.',
      );
    }
    await this.audit.record({
      action: 'payment.initiate',
      actor: { userId },
      orgId,
      targetType: 'Payment',
      targetId: payment.id,
      metadata: { provider: input.provider, purpose: input.purpose, amount: amount.toFixed(2) },
      meta,
    });
    return this.present(payment);
  }

  present(p: Payment) {
    const m = p.metadata as { description?: string; instructions?: string | null };
    return {
      id: p.id,
      provider: p.provider,
      purpose: p.purpose,
      status: p.status,
      amount: moneyStr(p.amount),
      refundedAmount: moneyStr(p.refundedAmount),
      currency: p.currency,
      checkoutUrl: p.checkoutUrl,
      bankReference: p.bankReference,
      instructions: m.instructions ?? null,
      description: m.description ?? null,
      createdAt: p.createdAt,
      failureReason: p.failureReason,
    };
  }

  list(orgId: string) {
    return this.prisma.payment
      .findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 100 })
      .then((r) => r.map((p) => this.present(p)));
  }

  /** Provider webhook entry: verify signature on raw body, dedupe by event id, then apply. */
  async handleWebhook(
    kind: PaymentProviderKind,
    raw: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const gw = this.gateways.get(kind);
    if (!gw?.verifyWebhook || !gw.isConfigured()) throw notFound('Webhook');
    if (!raw) throw badRequest('Missing body');
    let evt: VerifiedEvent;
    try {
      evt = await gw.verifyWebhook(raw, headers);
    } catch (e) {
      if (e instanceof WebhookSignatureError) {
        logger.warn({ provider: kind, reason: e.message }, 'webhook signature rejected');
        throw new AppError('FORBIDDEN', 'Invalid webhook signature.');
      }
      throw e;
    }
    const payloadHash = createHash('sha256').update(raw).digest('hex');
    // Dedupe by (provider, eventId) without relying on a thrown unique violation.
    const created = await this.prisma.webhookEvent.createMany({
      data: [
        {
          provider: kind,
          eventId: evt.eventId,
          type: evt.type,
          payloadHash,
          payload: JSON.parse(raw.toString('utf8')) as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });
    const event = await this.prisma.webhookEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider: kind, eventId: evt.eventId } },
    });
    if (created.count === 0 && event.status !== 'FAILED')
      return { received: true, duplicate: true };
    try {
      if (evt.outcome === 'IGNORED' || !evt.paymentId) {
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: 'IGNORED', processedAt: new Date() },
        });
        return { received: true };
      }
      if (evt.outcome === 'SUCCEEDED')
        await this.markSucceeded(evt.paymentId, {
          amount: evt.amount,
          currency: evt.currency,
          source: `${kind}:${evt.eventId}`,
        });
      if (evt.outcome === 'FAILED')
        await this.prisma.payment.updateMany({
          where: { id: evt.paymentId, status: { in: ['PENDING', 'REQUIRES_ACTION'] } },
          data: { status: 'FAILED', failureReason: evt.type },
        });
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { received: true };
    } catch (e) {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED', error: (e as Error).message.slice(0, 500) },
      });
      throw e;
    }
  }

  /**
   * Single success path for webhooks and manual verification. Locks the payment row; credits the wallet
   * exactly once (ledger idempotency key payment:<id>); issues a paid invoice; activates subscriptions.
   */
  async markSucceeded(
    paymentId: string,
    opts: {
      amount?: string;
      currency?: string;
      source: string;
      verifiedById?: string;
      bankReference?: string;
    },
  ) {
    let subscribePlan: { planId: string; orgId: string; userId: string } | null = null;
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Payment[]
      >`SELECT * FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const p = rows[0];
      if (!p) throw notFound('Payment');
      if (p.status === 'SUCCEEDED' || p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED')
        return; // already applied
      if (opts.amount !== undefined && !money(opts.amount).eq(money(p.amount)))
        throw new AppError(
          'CONFLICT',
          `Amount mismatch: expected ${moneyStr(p.amount)}, got ${opts.amount}`,
        );
      if (opts.currency && opts.currency.toUpperCase() !== p.currency)
        throw new AppError('CONFLICT', 'Currency mismatch');
      const meta = p.metadata as { creditAmount?: string; description?: string };
      const credit = money(meta.creditAmount ?? p.amount);
      await tx.payment.update({
        where: { id: p.id },
        data: {
          status: 'SUCCEEDED',
          verifiedById: opts.verifiedById,
          bankReference: opts.bankReference ?? p.bankReference,
        },
      });
      if (credit.gt(0)) {
        await this.wallet.apply(
          {
            orgId: p.orgId,
            amount: credit,
            direction: 'credit',
            type: 'TOPUP',
            description: meta.description ?? 'Wallet top-up',
            idempotencyKey: `payment:${p.id}`,
            referenceType: 'Payment',
            referenceId: p.id,
            actorUserId: opts.verifiedById,
            metadata: { provider: p.provider, source: opts.source },
          },
          tx,
        );
      }
      await this.invoices.create(tx, {
        orgId: p.orgId,
        status: 'PAID',
        paymentId: p.id,
        lines: [
          {
            description: `${meta.description ?? 'Wallet top-up'} (${p.provider.replace('_', ' ').toLowerCase()})`,
            quantity: 1,
            unitPrice: moneyStr(p.amount),
          },
        ],
      });
      await this.audit.record(
        {
          action: 'payment.succeeded',
          actorType: opts.verifiedById ? 'USER' : 'SYSTEM',
          actor: opts.verifiedById ? { userId: opts.verifiedById } : null,
          orgId: p.orgId,
          targetType: 'Payment',
          targetId: p.id,
          metadata: { source: opts.source, amount: moneyStr(p.amount) },
        },
        tx,
      );
      if (p.purpose === 'SUBSCRIPTION' && p.planId)
        subscribePlan = {
          planId: p.planId,
          orgId: p.orgId,
          userId: p.createdById ?? opts.verifiedById ?? '',
        };
    });
    if (subscribePlan) {
      const s = subscribePlan as { planId: string; orgId: string; userId: string };
      await this.subs
        .subscribeFromWallet(s.orgId, s.planId, s.userId, `payment-${paymentId}`)
        .catch((e) =>
          logger.error(
            { err: (e as Error).message, paymentId },
            'subscription activation after payment failed',
          ),
        );
    }
  }

  /** DEV ONLY: simulate the provider by emitting a correctly signed mock webhook. */
  async mockComplete(orgId: string, paymentId: string, outcome: 'SUCCEEDED' | 'FAILED') {
    const p = await this.prisma.payment.findFirst({
      where: { id: paymentId, orgId, provider: 'MOCK' },
    });
    if (!p) throw notFound('Payment');
    const evt: VerifiedEvent = {
      eventId: `mock_evt_${p.id}_${outcome}`,
      type: outcome === 'SUCCEEDED' ? 'mock.payment.succeeded' : 'mock.payment.failed',
      paymentId: p.id,
      externalId: p.externalId,
      outcome,
      amount: moneyStr(p.amount),
      currency: p.currency,
    };
    const raw = JSON.stringify(evt);
    await this.handleWebhook('MOCK', Buffer.from(raw), {
      'x-mock-signature': MockGateway.sign(raw),
    });
    return this.present(await this.prisma.payment.findUniqueOrThrow({ where: { id: p.id } }));
  }

  async adminVerifyManual(
    paymentId: string,
    adminId: string,
    bankReference: string | undefined,
    meta: RequestMeta,
  ) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw notFound('Payment');
    if (p.provider !== 'MANUAL_BANK')
      throw badRequest('Only bank transfer payments are verified manually.');
    await this.markSucceeded(paymentId, { source: 'manual', verifiedById: adminId, bankReference });
    await this.audit.record({
      action: 'payment.manual_verify',
      actor: { userId: adminId },
      orgId: p.orgId,
      targetType: 'Payment',
      targetId: p.id,
      metadata: { bankReference },
      meta,
    });
  }

  async adminRefund(
    paymentId: string,
    amountStr: string,
    reason: string,
    adminId: string,
    meta: RequestMeta,
  ) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw notFound('Payment');
    if (p.status !== 'SUCCEEDED' && p.status !== 'PARTIALLY_REFUNDED')
      throw badRequest('Only successful payments can be refunded.');
    const amount = money(amountStr);
    const remaining = money(p.amount).minus(p.refundedAmount);
    if (amount.lte(0) || amount.gt(remaining))
      throw badRequest(`Refund must be between 0 and ${remaining.toFixed(2)}.`);
    const refundKey = `refund:${p.id}:${money(p.refundedAmount).toFixed(6)}`;
    // Debit the wallet first (fails if the credit was already spent), then call the provider.
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.apply(
        {
          orgId: p.orgId,
          amount,
          direction: 'debit',
          type: 'REFUND',
          description: `Refund of payment ${p.id.slice(0, 8)}: ${reason}`,
          idempotencyKey: refundKey,
          referenceType: 'Payment',
          referenceId: p.id,
          actorUserId: adminId,
          respectCreditLimit: false,
        },
        tx,
      );
      const newRefunded = money(p.refundedAmount).plus(amount);
      await tx.payment.update({
        where: { id: p.id },
        data: {
          refundedAmount: new Prisma.Decimal(newRefunded.toFixed(6)),
          status: newRefunded.eq(p.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
      if (newRefunded.eq(p.amount))
        await tx.invoice.updateMany({ where: { paymentId: p.id }, data: { status: 'REFUNDED' } });
      await this.audit.record(
        {
          action: 'payment.refund',
          actor: { userId: adminId },
          orgId: p.orgId,
          targetType: 'Payment',
          targetId: p.id,
          metadata: { amount: amount.toFixed(2), reason },
          meta,
        },
        tx,
      );
    });
    const gw = this.gateways.get(p.provider);
    if (gw?.refund && p.provider !== 'MANUAL_BANK') {
      try {
        await gw.refund(p, amount.toFixed(2));
      } catch (e) {
        logger.error(
          { err: (e as Error).message, paymentId },
          'provider refund failed — wallet already debited; complete refund manually in provider dashboard',
        );
        throw new AppError(
          'UPSTREAM_ERROR',
          'Wallet was debited but the provider refund failed. Complete the refund in the provider dashboard; this is recorded in the audit log.',
        );
      }
    }
  }
}
