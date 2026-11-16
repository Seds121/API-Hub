import { createHmac, timingSafeEqual } from 'crypto';
import type { Payment } from '@prisma/client';
import { demoAllowed, env } from '../../../config/env';
import { CheckoutResult, PaymentGateway, VerifiedEvent, WebhookSignatureError } from './types';

/** Manual bank transfer: payment stays PENDING until an administrator verifies receipt of funds. */
export class ManualBankGateway implements PaymentGateway {
  readonly kind = 'MANUAL_BANK' as const;
  readonly label = 'Bank transfer (manual verification)';
  isConfigured() {
    return true;
  }
  async createCheckout(p: Payment): Promise<CheckoutResult> {
    return {
      externalId: null,
      checkoutUrl: null,
      instructions: `${env().BANK_TRANSFER_INSTRUCTIONS}\nPayment reference: ${p.bankReference}`,
    };
  }
}

/**
 * DEVELOPMENT/TEST ONLY mock gateway. Disabled in production. The "complete payment" action is performed
 * server-side and is delivered through the same signed-webhook pipeline as real providers.
 */
export class MockGateway implements PaymentGateway {
  readonly kind = 'MOCK' as const;
  readonly label = 'Demo payment (development only)';
  isConfigured() {
    return demoAllowed();
  }
  async createCheckout(p: Payment): Promise<CheckoutResult> {
    return {
      externalId: `mock_${p.id}`,
      checkoutUrl: `${env().APP_URL}/dashboard/billing/mock-checkout?payment=${p.id}`,
    };
  }
  static sign(raw: string) {
    return createHmac('sha256', `mock:${env().SESSION_SECRET}`).update(raw).digest('hex');
  }
  async verifyWebhook(
    raw: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerifiedEvent> {
    if (!demoAllowed()) throw new WebhookSignatureError('Mock gateway disabled');
    const sig = headers['x-mock-signature'];
    const expected = MockGateway.sign(raw.toString('utf8'));
    if (
      typeof sig !== 'string' ||
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      throw new WebhookSignatureError('Bad mock signature');
    return JSON.parse(raw.toString('utf8')) as VerifiedEvent;
  }
  async refund(p: Payment) {
    return { externalRefundId: `mock_refund_${p.id}_${Date.now()}` };
  }
}
