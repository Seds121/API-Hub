import type { Payment } from '@prisma/client';
import { money } from '@zeze/shared';
import { env } from '../../../config/env';
import { CheckoutResult, PaymentGateway, VerifiedEvent, WebhookSignatureError } from './types';

/**
 * PayPal Orders v2 + webhook signature verification via PayPal's verify-webhook-signature API.
 * REQUIRES REAL CREDENTIALS: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID. Not exercised in CI.
 */
export class PayPalGateway implements PaymentGateway {
  readonly kind = 'PAYPAL' as const;
  readonly label = 'PayPal';

  isConfigured() {
    const e = env();
    return Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET && e.PAYPAL_WEBHOOK_ID);
  }

  private base() {
    return env().PAYPAL_ENV === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private async token() {
    const e = env();
    const r = await fetch(`${this.base()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${e.PAYPAL_CLIENT_ID}:${e.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`PayPal auth failed (${r.status})`);
    return ((await r.json()) as { access_token: string }).access_token;
  }

  async createCheckout(
    p: Payment,
    ctx: { successUrl: string; cancelUrl: string; description: string },
  ): Promise<CheckoutResult> {
    const r = await fetch(`${this.base()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'content-type': 'application/json',
        'PayPal-Request-Id': `order-${p.id}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: p.id,
            description: ctx.description.slice(0, 120),
            amount: { currency_code: p.currency, value: money(p.amount).toFixed(2) },
          },
        ],
        application_context: {
          return_url: ctx.successUrl,
          cancel_url: ctx.cancelUrl,
          user_action: 'PAY_NOW',
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`PayPal order creation failed (${r.status})`);
    const o = (await r.json()) as { id: string; links: { rel: string; href: string }[] };
    return {
      externalId: o.id,
      checkoutUrl:
        o.links.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href ?? null,
    };
  }

  async verifyWebhook(
    raw: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerifiedEvent> {
    const h = (k: string) => {
      const v = headers[k];
      if (typeof v !== 'string') throw new WebhookSignatureError(`Missing ${k}`);
      return v;
    };
    const event = JSON.parse(raw.toString('utf8')) as {
      id: string;
      event_type: string;
      resource: {
        id: string;
        custom_id?: string;
        supplementary_data?: { related_ids?: { order_id?: string } };
        amount?: { value: string; currency_code: string };
      };
    };
    const r = await fetch(`${this.base()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: h('paypal-auth-algo'),
        cert_url: h('paypal-cert-url'),
        transmission_id: h('paypal-transmission-id'),
        transmission_sig: h('paypal-transmission-sig'),
        transmission_time: h('paypal-transmission-time'),
        webhook_id: env().PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const v = (await r.json().catch(() => ({}))) as { verification_status?: string };
    if (v.verification_status !== 'SUCCESS')
      throw new WebhookSignatureError('PayPal signature verification failed');
    const outcome =
      event.event_type === 'PAYMENT.CAPTURE.COMPLETED'
        ? 'SUCCEEDED'
        : event.event_type === 'PAYMENT.CAPTURE.DENIED'
          ? 'FAILED'
          : 'IGNORED';
    return {
      eventId: event.id,
      type: event.event_type,
      paymentId: event.resource.custom_id ?? null,
      externalId: event.resource.supplementary_data?.related_ids?.order_id ?? null,
      outcome,
      amount: event.resource.amount?.value,
      currency: event.resource.amount?.currency_code,
    };
  }
}
