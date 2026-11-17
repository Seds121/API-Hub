import { AdapterContext, AuthMaterial, ProviderAdapter, ProviderConfigError } from './types';

/**
 * Brave Search API connector. Sends the platform's Brave API key (decrypted from the Admin credential
 * store) as X-Subscription-Token. Paths/params come from admin-configured integrations
 * (e.g. GET /res/v1/web/search). The key is never logged or returned.
 */
export class BraveAdapter implements ProviderAdapter {
  readonly kind = 'BRAVE' as const;

  async authenticate({ secret }: AdapterContext): Promise<AuthMaterial> {
    if (!secret?.apiKey)
      throw new ProviderConfigError('Brave provider has no active API key credential');
    return { headers: { 'X-Subscription-Token': secret.apiKey }, query: {} };
  }

  /** Brave reports an invalid/expired key as 422 with error.code SUBSCRIPTION_TOKEN_INVALID (component "authentication"). */
  isCredentialError(status: number, body: unknown): boolean {
    if (status === 401 || status === 403) return true;
    const err = (body as { error?: { code?: string; meta?: { component?: string } } } | null)
      ?.error;
    return (
      status === 422 &&
      (err?.code === 'SUBSCRIPTION_TOKEN_INVALID' || err?.meta?.component === 'authentication')
    );
  }
}
