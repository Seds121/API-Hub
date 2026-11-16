export interface ParamDef {
  name: string;
  in: 'query' | 'path' | 'header' | 'body';
  type: 'string' | 'integer' | 'number' | 'boolean';
  required?: boolean;
  description?: string;
  example?: string | number | boolean;
  enum?: string[];
  maxLength?: number;
}
export interface PublicEndpoint {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string | null;
  params: ParamDef[];
  requestBodyExample: unknown;
  responseExample: unknown;
  errorCodes: { status: number; code: string; description: string }[] | null;
  rateLimitPerMinute: number | null;
}
export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  summary: string;
  category: { name: string; slug: string };
  tags: string[];
  publisherName: string | null;
  isFeatured: boolean;
  requiresSubscription: boolean;
  popularity: number;
  endpointCount: number;
  pricePerRequest: string | null;
  currency: string;
  isDemo: boolean;
}
export interface ProductDetail extends Omit<ProductSummary, 'endpointCount' | 'pricePerRequest' | 'currency'> {
  internalCode: string;
  description: string | null;
  docsMarkdown: string | null;
  usageRestrictions: string | null;
  defaultRateLimitPerMinute: number;
  baseUrl: string;
  endpoints: PublicEndpoint[];
  pricing: { currency: string; defaultPricePerRequest: string | null; endpoints: { endpointId: string; pricePerRequest: string | null }[] };
}
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  productCount: number;
}
export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'SUBSCRIPTION' | 'PREPAID' | 'PAYG' | 'ENTERPRISE';
  interval: 'MONTHLY' | 'ANNUAL' | null;
  price: string;
  includedRequests: number;
  overagePricePerRequest: string | null;
  creditGrant: string;
  discountPercent: string;
  rateLimitPerMinute: number;
  features: string[];
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
