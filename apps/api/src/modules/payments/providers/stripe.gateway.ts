import Stripe from 'stripe';
import type { Payment } from '@prisma/client';
import { money } from '@zeze/shared';
import { env } from '../../../config/env';
import { CheckoutResult, PaymentGateway, VerifiedEvent, WebhookSignatureError } from './types';

/** Stripe Checkout + signed webhooks. REQUIRES REAL CREDENTIALS: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. */
export class StripeGateway implements PaymentGateway {
  readonly kind = 'STRIPE' as const;
  readonly label = 'Card (Stripe)';
  private client: Stripe | null = null;

  isConfigured() {
    return Boolean(env().STRIPE_SECRET_KEY && env().STRIPE_WEBHOOK_SECRET);
  }

  private stripe() {
    this.client ??= new Stripe(env().STRIPE_SECRET_KEY!);
    return this.client;
  }

  async createCheckout(
    p: Payment,
    ctx: {
      successUrl: string;
      cancelUrl: string;
      description: string;
      customerEmail?: string | null;
    },
  ): Promise<CheckoutResult> {
    const cents = money(p.amount).mul(100);
    if (!cents.isInteger()) throw new Error('Stripe amounts must have at most 2 decimals');
    const s = await this.stripe().checkout.sessions.create(
      {
        mode: 'payment',
        success_url: ctx.successUrl,
        cancel_url: ctx.cancelUrl,
        customer_email: ctx.customerEmail ?? undefined,
        client_reference_id: p.id,
        metadata: { paymentId: p.id, orgId: p.orgId },
        payment_intent_data: { metadata: { paymentId: p.id } },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: p.currency.toLowerCase(),
              unit_amount: Number(cents.toFixed(0)),
              product_data: { name: ctx.description },
            },
          },
        ],
      },
      { idempotencyKey: `checkout:${p.id}` },
    );
    return { externalId: s.id, checkoutUrl: s.url };
  }

  async verifyWebhook(
    raw: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerifiedEvent> {
    const sig = headers['stripe-signature'];
    if (typeof sig !== 'string') throw new WebhookSignatureError('Missing Stripe-Signature');
    let evt: Stripe.Event;
    try {
      evt = this.stripe().webhooks.constructEvent(raw, sig, env().STRIPE_WEBHOOK_SECRET!);
    } catch (e) {
      throw new WebhookSignatureError((e as Error).message);
    }
    const base = { eventId: evt.id, type: evt.type };
    if (
      evt.type === 'checkout.session.completed' ||
      evt.type === 'checkout.session.async_payment_succeeded' ||
      evt.type === 'checkout.session.async_payment_failed'
    ) {
      const s = evt.data.object as Stripe.Checkout.Session;
      const paid = s.payment_status === 'paid';
      const outcome =
        evt.type === 'checkout.session.async_payment_failed'
          ? 'FAILED'
          : paid
            ? 'SUCCEEDED'
            : 'IGNORED';
      return {
        ...base,
        paymentId: s.metadata?.paymentId ?? s.client_reference_id ?? null,
        externalId: s.id,
        outcome,
        amount: s.amount_total != null ? money(s.amount_total).div(100).toFixed(2) : undefined,
        currency: s.currency?.toUpperCase(),
      };
    }
    return { ...base, paymentId: null, externalId: null, outcome: 'IGNORED' };
  }

  async refund(p: Payment, amount: string) {
    const session = await this.stripe().checkout.sessions.retrieve(p.externalId!);
    const pi =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!pi) throw new Error('No payment intent on Stripe session');
    const r = await this.stripe().refunds.create(
      { payment_intent: pi, amount: Number(money(amount).mul(100).toFixed(0)) },
      { idempotencyKey: `refund:${p.id}:${amount}:${p.refundedAmount}` },
    );
    return { externalRefundId: r.id };
  }
}
