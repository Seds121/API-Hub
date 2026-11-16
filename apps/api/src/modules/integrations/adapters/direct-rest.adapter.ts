import {
  AdapterContext,
  AuthConfig,
  AuthMaterial,
  ProviderAdapter,
  ProviderConfigError,
} from './types';

/** Generic direct REST provider: API key (header/query), bearer, basic, OAuth2 client-credentials, custom headers. */
export class DirectRestAdapter implements ProviderAdapter {
  readonly kind = 'DIRECT_REST' as const;

  async authenticate(ctx: AdapterContext): Promise<AuthMaterial> {
    const { provider, secret } = ctx;
    const cfg = (provider.authConfig ?? {}) as AuthConfig;
    const need = (cond: unknown, msg: string) => {
      if (!cond) throw new ProviderConfigError(msg);
    };
    switch (provider.authType) {
      case 'NONE':
        return { headers: {}, query: {} };
      case 'API_KEY': {
        need(secret?.apiKey, 'API key credential missing');
        const name = cfg.name || 'X-API-Key';
        return cfg.in === 'query'
          ? { headers: {}, query: { [name]: secret!.apiKey! } }
          : { headers: { [name]: secret!.apiKey! }, query: {} };
      }
      case 'BEARER':
        need(secret?.token, 'Bearer token credential missing');
        return { headers: { Authorization: `Bearer ${secret!.token}` }, query: {} };
      case 'BASIC':
        need(secret?.username && secret?.password !== undefined, 'Basic auth credential missing');
        return {
          headers: {
            Authorization: `Basic ${Buffer.from(`${secret!.username}:${secret!.password}`).toString('base64')}`,
          },
          query: {},
        };
      case 'OAUTH2': {
        need(
          secret?.clientId && secret?.clientSecret && cfg.tokenUrl,
          'OAuth2 client credentials or token URL missing',
        );
        const token = await ctx.getOAuthToken(provider, secret!, cfg);
        return { headers: { Authorization: `Bearer ${token}` }, query: {} };
      }
      case 'CUSTOM_HEADERS':
        need(
          secret?.headers && Object.keys(secret.headers).length,
          'Custom header credential missing',
        );
        return { headers: { ...secret!.headers! }, query: {} };
      default:
        throw new ProviderConfigError(`Unsupported auth type ${provider.authType as string}`);
    }
  }
}
