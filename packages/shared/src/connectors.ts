/**
 * Upstream connector registry — the single source of truth for named provider connectors.
 *
 * API and web both read this. To add a connector (e.g. SERPAPI):
 *   1. adapter file in apps/api/src/modules/integrations/adapters/
 *   2. enum value in prisma `ProviderKind` + migration
 *   3. entry in CONNECTORS below (and CONNECTOR_KINDS)
 *   4. register the adapter in IntegrationEngine (tsc fails until you do)
 *   5. the admin UI picks it up automatically (form defaults, credential labels, badges, templates)
 *
 * Never put secrets here: credentials live encrypted in Admin → Provider credentials.
 */
import type { HttpMethod, ParamDef } from './schemas';

export const CONNECTOR_KINDS = ['RAPIDAPI', 'DIRECT_REST', 'BRAVE'] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export type CredentialKindName = 'API_KEY' | 'BEARER_TOKEN' | 'BASIC' | 'OAUTH2_CLIENT' | 'HEADERS';
export type AuthTypeName = 'NONE' | 'API_KEY' | 'BEARER' | 'BASIC' | 'OAUTH2' | 'CUSTOM_HEADERS';

export interface CredentialFieldDef {
  key: 'apiKey' | 'token' | 'username' | 'password' | 'clientId' | 'clientSecret' | 'headers';
  label: string;
  secret: boolean;
}

/** Ready-made product + endpoint + integration an admin can create in one click (as a DRAFT). */
export interface ConnectorTemplate {
  id: string;
  label: string;
  description: string;
  product: {
    name: string;
    slug: string;
    summary: string;
    /** Created on demand (with categoryName) if it doesn't exist. */
    categorySlug: string;
    categoryName: string;
    publisherName: string;
    tags: string[];
    docsMarkdown: string;
    usageRestrictions: string;
    defaultRateLimitPerMinute: number;
  };
  endpoint: {
    name: string;
    method: HttpMethod;
    path: string;
    description: string;
    params: ParamDef[];
    responseExample: unknown;
  };
  integration: {
    upstreamMethod: HttpMethod;
    upstreamPath: string;
    /** Customer param name → upstream param name (omit for 1:1). */
    queryMap?: Record<string, string>;
  };
  /** Suggested list price per request (USD) shown in the UI; not applied automatically in production. */
  suggestedPricePerRequest: string;
}

export interface ConnectorDef {
  kind: ConnectorKind;
  label: string;
  shortLabel: string;
  description: string;
  /** Pre-filled base URL in the admin form (and applied when omitted on create). */
  defaultBaseUrl?: string;
  /** Named connectors lock the auth type; null = admin chooses (Direct REST). */
  fixedAuthType: AuthTypeName | null;
  /** Human-readable summary of what the adapter sends upstream. */
  authSummary: string;
  /** False only for connectors that may run without any credential (Direct REST with auth NONE). */
  requiresCredential: boolean;
  credential: {
    /** Credential kinds accepted for this connector (first is the default). */
    kinds: CredentialKindName[];
    /** Field labels per credential kind (used by the admin credential dialog). */
    fields: Partial<Record<CredentialKindName, CredentialFieldDef[]>>;
    help: string;
  };
  formHints: {
    showRapidApiHost: boolean;
    showAuthMethod: boolean;
    baseUrlHelp: string;
    onboarding: string[];
  };
  defaults?: { timeoutMs?: number; rateLimitPerMinute?: number; healthCheckPath?: string | null };
  templates: ConnectorTemplate[];
}

const GENERIC_FIELDS: ConnectorDef['credential']['fields'] = {
  API_KEY: [{ key: 'apiKey', label: 'API key', secret: true }],
  BEARER_TOKEN: [{ key: 'token', label: 'Bearer token', secret: true }],
  BASIC: [
    { key: 'username', label: 'Username', secret: false },
    { key: 'password', label: 'Password', secret: true },
  ],
  OAUTH2_CLIENT: [
    { key: 'clientId', label: 'Client ID', secret: false },
    { key: 'clientSecret', label: 'Client secret', secret: true },
  ],
  HEADERS: [{ key: 'headers', label: 'Headers JSON, e.g. {"X-Auth":"…"}', secret: true }],
};

const BRAVE_WEB_SEARCH: ConnectorTemplate = {
  id: 'brave-web-search',
  label: 'Brave Web Search',
  description:
    'GET /search → Brave /res/v1/web/search with q, count, offset, country, languages, safesearch and freshness.',
  product: {
    name: 'Brave Web Search',
    slug: 'brave-web-search',
    summary:
      'Independent web search results (titles, URLs, snippets) powered by the Brave Search index.',
    categorySlug: 'search',
    categoryName: 'Search',
    publisherName: 'Brave Search',
    tags: ['search', 'web', 'serp'],
    docsMarkdown:
      '## Brave Web Search\n\nQuery the independent Brave Search index. Pass your search terms in `q`; Brave search operators (quotes, `-term`, `site:`) are supported inside `q`.\n\nResults are paginated with `count` (max 20) and `offset` (max 9).',
    usageRestrictions:
      'Subject to the Brave Search API terms. Do not store or redistribute results beyond your application’s display needs.',
    defaultRateLimitPerMinute: 60,
  },
  endpoint: {
    name: 'Web search',
    method: 'GET',
    path: '/search',
    description: 'Search the web. Returns Brave’s web results object.',
    params: [
      {
        name: 'q',
        in: 'query',
        type: 'string',
        required: true,
        maxLength: 400,
        description: 'Search query (Brave operators allowed)',
        example: 'openai',
      },
      {
        name: 'count',
        in: 'query',
        type: 'integer',
        required: false,
        description: 'Results per page (1–20, default 20)',
        example: 10,
      },
      {
        name: 'offset',
        in: 'query',
        type: 'integer',
        required: false,
        description: 'Zero-based page offset (0–9)',
      },
      {
        name: 'country',
        in: 'query',
        type: 'string',
        required: false,
        maxLength: 2,
        pattern: '^[A-Za-z]{2}$',
        description: '2-letter country code, e.g. US',
      },
      {
        name: 'search_lang',
        in: 'query',
        type: 'string',
        required: false,
        maxLength: 10,
        pattern: '^[A-Za-z-]{2,10}$',
        description: 'Content language, e.g. en',
      },
      {
        name: 'ui_lang',
        in: 'query',
        type: 'string',
        required: false,
        maxLength: 10,
        pattern: '^[A-Za-z-]{2,10}$',
        description: 'Response metadata language, e.g. en-US',
      },
      {
        name: 'safesearch',
        in: 'query',
        type: 'string',
        required: false,
        enum: ['off', 'moderate', 'strict'],
        description: 'Adult content filter (default moderate)',
      },
      {
        name: 'freshness',
        in: 'query',
        type: 'string',
        required: false,
        maxLength: 30,
        pattern: '^(pd|pw|pm|py|\\d{4}-\\d{2}-\\d{2}to\\d{4}-\\d{2}-\\d{2})$',
        description: 'pd, pw, pm, py or YYYY-MM-DDtoYYYY-MM-DD',
      },
    ],
    responseExample: {
      type: 'search',
      query: { original: 'openai' },
      web: {
        type: 'search',
        results: [{ title: 'Example result', url: 'https://example.com', description: 'Snippet…' }],
      },
    },
  },
  integration: { upstreamMethod: 'GET', upstreamPath: '/res/v1/web/search' },
  suggestedPricePerRequest: '0.005',
};

export const CONNECTORS: Record<ConnectorKind, ConnectorDef> = {
  RAPIDAPI: {
    kind: 'RAPIDAPI',
    label: 'RapidAPI listing',
    shortLabel: 'RapidAPI',
    description: 'Any RapidAPI listing. Each listing has its own host, paths and parameters.',
    fixedAuthType: 'API_KEY',
    authSummary: 'X-RapidAPI-Key + X-RapidAPI-Host',
    requiresCredential: true,
    credential: {
      kinds: ['API_KEY'],
      fields: { API_KEY: [{ key: 'apiKey', label: 'RapidAPI application key', secret: true }] },
      help: 'Your RapidAPI application key, sent as X-RapidAPI-Key.',
    },
    formHints: {
      showRapidApiHost: true,
      showAuthMethod: false,
      baseUrlHelp:
        'e.g. https://example-api.p.rapidapi.com — every RapidAPI listing has its own host and paths.',
      onboarding: [
        'Store your RapidAPI application key under Credentials after creating the provider.',
      ],
    },
    templates: [],
  },
  DIRECT_REST: {
    kind: 'DIRECT_REST',
    label: 'Direct REST provider',
    shortLabel: 'Direct',
    description:
      'Generic HTTPS REST API with API key, bearer, basic, OAuth2 client-credentials or custom headers.',
    fixedAuthType: null,
    authSummary: 'Configured auth method',
    requiresCredential: false,
    credential: {
      kinds: ['API_KEY', 'BEARER_TOKEN', 'BASIC', 'OAUTH2_CLIENT', 'HEADERS'],
      fields: GENERIC_FIELDS,
      help: 'Must match the provider’s auth method.',
    },
    formHints: {
      showRapidApiHost: false,
      showAuthMethod: true,
      baseUrlHelp: 'HTTPS only. Endpoint paths are appended to this.',
      onboarding: [],
    },
    templates: [],
  },
  BRAVE: {
    kind: 'BRAVE',
    label: 'Brave Search',
    shortLabel: 'Brave',
    description:
      'Brave Search API (independent web index). Authenticated with X-Subscription-Token.',
    defaultBaseUrl: 'https://api.search.brave.com',
    fixedAuthType: 'API_KEY',
    authSummary: 'X-Subscription-Token: <Brave API key>',
    requiresCredential: true,
    credential: {
      kinds: ['API_KEY'],
      fields: { API_KEY: [{ key: 'apiKey', label: 'Brave API key', secret: true }] },
      help: 'Credential must be your Brave Search API key (sent as X-Subscription-Token).',
    },
    formHints: {
      showRapidApiHost: false,
      showAuthMethod: false,
      baseUrlHelp: 'Brave Search API host. Keep the default unless Brave instructs otherwise.',
      onboarding: [
        'The Brave API key is our platform’s supplier credential — add it under Credentials (sent as X-Subscription-Token). Never put it in Default headers.',
        'Customers never see it: they create their own zz_live_… keys in this app.',
        'Calls go through our gateway, are billed to the customer’s wallet, then forwarded to Brave with our key.',
        'Use Quick start to create the Brave Web Search API, then record the license, set a price and publish.',
      ],
    },
    defaults: { timeoutMs: 10000, rateLimitPerMinute: 60, healthCheckPath: null },
    templates: [BRAVE_WEB_SEARCH],
  },
};

const FALLBACK: ConnectorDef = {
  ...CONNECTORS.DIRECT_REST,
  label: 'Unknown connector',
  shortLabel: 'Unknown',
};

/** Registry lookup with a safe fallback for kinds the client doesn't know yet. */
export function connectorDef(kind: string): ConnectorDef {
  return (
    (CONNECTORS as Record<string, ConnectorDef>)[kind] ?? {
      ...FALLBACK,
      kind: kind as ConnectorKind,
    }
  );
}

export function connectorTemplate(kind: string, templateId: string): ConnectorTemplate | undefined {
  return connectorDef(kind).templates.find((t) => t.id === templateId);
}
