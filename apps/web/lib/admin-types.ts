import type { ConnectorKind } from '@zeze/shared';

export interface Overview {
  totalCustomers: number;
  activeCustomers: number;
  totalProviders: number;
  activeApis: number;
  requestsToday: number;
  requestsThisMonth: number;
  failedRequestsThisMonth: number;
  revenueThisMonth: string;
  revenueBreakdown: { usage: string; subscriptions: string; total: string };
  paymentsCollectedThisMonth: string;
  supplierCostThisMonth: { actual: string; estimated: string; fixedSubscriptionFeesProrated: string; unknownCount: number };
  grossMarginThisMonth: string;
  grossMarginNote: string | null;
  providerAvailability: Record<string, number>;
}
export interface SeriesRow { bucket: string; requests: number; successful: number; failed: number; avgLatencyMs: number; avgUpstreamLatencyMs: number; revenue: string; costActual: string; costEstimated: string; margin: string }
export interface Provider {
  id: string;
  name: string;
  slug: string;
  kind: ConnectorKind;
  description: string | null;
  website: string | null;
  baseUrl: string;
  allowedHosts: string[];
  authType: string;
  authConfig: Record<string, string>;
  defaultHeaders: Record<string, string>;
  timeoutMs: number;
  retryMaxAttempts: number;
  retryBackoffMs: number;
  retryOnStatuses: number[];
  maxConcurrency: number;
  rateLimitPerMinute: number | null;
  healthCheckPath: string | null;
  status: string;
  isMock: boolean;
  _count?: { integrations: number };
  credentials: Credential[];
  subscriptions: ProviderSub[];
  licenses: License[];
  healthChecks: { id: string; ok: boolean; statusCode: number | null; latencyMs: number | null; error: string | null; checkedAt: string }[];
  integrations?: Integration[];
  circuit?: { state: string; failures: number };
}
export interface Credential { id: string; label: string; kind: string; hint: string; isActive: boolean; keyVersion: number; expiresAt: string | null; rotatedAt: string | null; createdAt: string; provider?: { id: string; name: string } }
export interface ProviderSub { id: string; planName: string; status: string; startsAt: string; expiresAt: string | null; monthlyFee: string | null; currency: string; includedCalls: number | null; usageLimitPerMonth: number | null; usageLimitPerDay: number | null; notes: string | null }
export interface License { id: string; status: string; redistributionAllowed: boolean; subResaleAllowed: boolean; cachingAllowed: boolean; cacheTtlSeconds: number | null; documentRef: string | null; evidenceNotes: string | null; restrictions: string | null; territory: string | null; isDemo: boolean; verifiedAt: string | null; expiresAt: string | null; createdAt: string; apiProduct?: { id: string; name: string } | null; provider?: { id: string; name: string } }
export interface Integration {
  id: string;
  priority: number;
  upstreamMethod: string;
  upstreamPath: string;
  queryMapping: { map?: Record<string, string>; static?: Record<string, string> };
  headerMapping: { static?: Record<string, string> };
  bodyMode: string;
  bodyTemplate: unknown;
  responseTransform: unknown;
  timeoutMsOverride: number | null;
  costPerCall: string | null;
  costIsEstimated: boolean;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestStatus: number | null;
  lastTestError: string | null;
  providerId: string;
  endpointId: string;
  provider?: { id: string; name: string; kind: string; status: string };
  endpoint?: { id: string; name: string; method: string; path: string; params?: unknown; product: { id: string; name: string; slug: string; status?: string } };
}
export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  billingEmail: string | null;
  createdAt: string;
  isDemo: boolean;
  monthlySpendLimit: string | null;
  wallet: { balance: string; reserved: string; creditLimit: string } | null;
  parent: { id: string; name: string } | null;
  agencyAgreement: { status: string } | null;
  subscriptions: { plan: { name: string } }[];
  _count: { members: number; apiKeys: number; children: number };
}
