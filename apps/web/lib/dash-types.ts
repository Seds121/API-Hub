export interface UsageSummary {
  totals: { requests: number; successful: number; failed: number; spend: string; avgLatencyMs: number };
  byApi: { productId: string; name: string; slug: string; requests: number; spend: string }[];
  series: { bucket: string; requests: number; successful: number; failed: number; spend: string; avgLatencyMs: number }[];
}
export interface UsageRecord {
  id: string;
  correlationId: string;
  method: string;
  path: string;
  statusCode: number;
  errorCode: string | null;
  latencyMs: number;
  price: string;
  coveredBySubscription: boolean;
  createdAt: string;
  product: { name: string; slug: string } | null;
  endpoint: { name: string; path: string } | null;
  apiKey: { name: string; prefix: string } | null;
}
export interface BillingOverview {
  wallet: { id: string; currency: string; balance: string; reserved: string; available: string; creditLimit: string; lowBalanceThreshold: string; isLow: boolean };
  subscription: null | { id: string; status: string; plan: { id: string; name: string; code: string; price: string; interval: string | null; includedRequests: number; discountPercent: string }; currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; requestsUsedInPeriod: number };
  monthToDateSpend: string;
  monthlySpendLimit: string | null;
}
export interface ApiKeyRow {
  id: string;
  name: string;
  environment: 'LIVE' | 'TEST';
  prefix: string;
  last4: string;
  scopes: string[];
  allowedIps: string[];
  rateLimitPerMinute: number | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: { name: string; email: string } | null;
  secret?: string;
}
