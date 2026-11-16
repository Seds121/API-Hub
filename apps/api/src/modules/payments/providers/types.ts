import type { Payment, PaymentProviderKind } from '@prisma/client';

export interface CheckoutResult {
  externalId: string | null;
  checkoutUrl: string | null;
  /** Instructions for offline methods (bank transfer). */
  instructions?: string;
}

export interface VerifiedEvent {
  eventId: string;
  type: string;
  /** Our Payment id when the provider echoes it (metadata / custom_id), else null. */
  paymentId: string | null;
  externalId: string | null;
  outcome: 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'IGNORED';
  amount?: string;
  currency?: string;
}

export interface PaymentGateway {
  readonly kind: PaymentProviderKind;
  readonly label: string;
  isConfigured(): boolean;
  createCheckout(
    p: Payment,
    ctx: {
      successUrl: string;
      cancelUrl: string;
      description: string;
      customerEmail?: string | null;
    },
  ): Promise<CheckoutResult>;
  /** Must verify the signature against the RAW body. Throws on invalid signature. */
  verifyWebhook?(
    raw: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerifiedEvent>;
  refund?(p: Payment, amount: string): Promise<{ externalRefundId: string }>;
}

export class WebhookSignatureError extends Error {}
