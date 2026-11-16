import type { ApiProvider, ProviderKind } from '@prisma/client';

/** Decrypted supplier secret payload (never logged, never returned). */
export interface ProviderSecret {
  apiKey?: string;
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  headers?: Record<string, string>;
}

export interface AuthConfig {
  /** RapidAPI: X-RapidAPI-Host value (defaults to the base URL host). */
  rapidApiHost?: string;
  /** API_KEY providers: where the key goes. */
  in?: 'header' | 'query';
  name?: string;
  /** OAUTH2 client-credentials */
  tokenUrl?: string;
  scope?: string;
  audience?: string;
}

export interface AuthMaterial {
  headers: Record<string, string>;
  query: Record<string, string>;
}

export interface AdapterContext {
  provider: ApiProvider;
  url: URL;
  secret: ProviderSecret | null;
  getOAuthToken: (
    provider: ApiProvider,
    secret: ProviderSecret,
    cfg: AuthConfig,
  ) => Promise<string>;
}

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  /** Produces the auth headers/query for one upstream call. Must not mutate inputs. */
  authenticate(ctx: AdapterContext): Promise<AuthMaterial>;
}

export class ProviderConfigError extends Error {}
