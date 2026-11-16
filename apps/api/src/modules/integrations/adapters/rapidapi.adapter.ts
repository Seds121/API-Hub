import {
  AdapterContext,
  AuthConfig,
  AuthMaterial,
  ProviderAdapter,
  ProviderConfigError,
} from './types';

/**
 * RapidAPI connector. Each RapidAPI listing has its own host and endpoint structure, so the base URL,
 * paths, params and body are fully configured per integration; this adapter only applies the
 * X-RapidAPI-Key / X-RapidAPI-Host headers using the supplier key stored encrypted on the server.
 */
export class RapidApiAdapter implements ProviderAdapter {
  readonly kind = 'RAPIDAPI' as const;

  async authenticate({ provider, url, secret }: AdapterContext): Promise<AuthMaterial> {
    if (!secret?.apiKey)
      throw new ProviderConfigError('RapidAPI provider has no active API key credential');
    const cfg = (provider.authConfig ?? {}) as AuthConfig;
    return {
      headers: { 'X-RapidAPI-Key': secret.apiKey, 'X-RapidAPI-Host': cfg.rapidApiHost || url.host },
      query: {},
    };
  }
}
