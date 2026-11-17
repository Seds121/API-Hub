# System architecture

```
          Browser (app.<domain>)                      Customer servers (api.<domain>)
                 │ HTTPS                                         │ HTTPS  Authorization: Bearer zz_live_…
                 ▼                                               ▼
            ┌────────┐   /api/* (same-origin rewrite)       ┌──────────┐
            │ nginx  │──────────────────────────────────────▶│ NestJS   │──▶ PostgreSQL (Prisma)
            └────────┘──▶ Next.js web (SSR + client)         │  api ×N  │──▶ Redis (rate limits, caches, locks)
                                                             └────┬─────┘
                                                                  │ approved provider configs only
                                                                  ▼
                                               RapidAPI listings / direct REST suppliers
                                         worker ×1+ (health checks, renewals, sweeper, alerts, retention)
```

## Backend modules (`apps/api/src/modules`)

| Module | Responsibility |
|---|---|
| `auth` | Registration, login (argon2id, lockout, TOTP MFA), cookie sessions with CSRF double-submit, short-lived JWTs, session management |
| `orgs`, `rbac` (shared) | Organizations, members, roles and permissions; every query is scoped by the caller's org id |
| `providers`, `licenses`, `integrations` | Supplier config, AES-256-GCM credentials, supplier subscriptions, redistribution licenses, integration engine (RapidAPI and Direct adapters, SSRF guard, retries, circuit breaker, concurrency, quotas, OAuth2), integration test, health probes |
| `catalog`, `pricing` | Categories, products, endpoints, pricing rules, plans, OpenAPI generation, publishing gate |
| `api-keys` | Key lifecycle (HMAC-hashed, prefix lookup, scopes, IP allowlists, expiry, per-key limits) |
| `gateway` | The `/v1/:api/*path` pipeline (below) |
| `billing` | Wallet ledger, reservations, spend caps, subscriptions and renewals, invoices (PDF), statements |
| `payments` | Stripe / PayPal / bank transfer / dev mock gateways, verified and deduplicated webhooks, refunds |
| `usage`, `analytics` | Metering read models and admin analytics (actual vs estimated supplier cost) |
| `agency` | Subaccounts, transfers, subaccount keys, resale pricing, reports |
| `support`, `admin`, `jobs` | Tickets and contact, back office, background jobs |

## Connector registry
Upstream connectors are pluggable. `packages/shared/src/connectors.ts` is the single registry, and both the API and the web read it. Each entry has a label, default base URL, fixed auth semantics, accepted credential kinds and labels, admin form hints and one-click product templates. Each `ProviderKind` has exactly one `ProviderAdapter` (`RapidApiAdapter`, `DirectRestAdapter`, `BraveAdapter`, …) in a `Record<ProviderKind, ProviderAdapter>`, so an unregistered kind fails the build. Adapters only add auth material; everything else (URL building from admin config, validation, SSRF, retries, breakers, quotas, licensing, billing) is shared. See [PROVIDERS.md](PROVIDERS.md#adding-a-new-connector-type).

## Gateway pipeline
1. Correlation id (`X-Request-Id`).
2. API key: prefix lookup (Redis-cached 60s), then a constant-time HMAC compare; revocation, expiry and IP allowlist checks.
3. Organization and parent agency must be ACTIVE.
4. Route resolution against **admin-configured** products and endpoints. Customers never supply upstream URLs.
5. Key scopes.
6. Subscription requirement.
7. Rate limits: per key (key, then plan, then API default) and per org+endpoint.
8. Strict input validation. Unknown params are rejected and types, enums and patterns are enforced.
9. License gate: only providers with a VERIFIED redistribution license, plus sub-resale for agency subaccounts.
10. Price quote (decimal), included-quota consumption, monthly spend cap, then an atomic wallet **reservation** (`UPDATE … WHERE balance - reserved - price >= floor`).
11. Upstream call with failover across licensed integrations. Network and 5xx retries apply to idempotent methods only. Redirects are never followed.
12. Normalization: 2xx/3xx pass through; 401/403 from upstream become 503 (our credential problem); 429 becomes 503 with Retry-After; other 4xx become `UPSTREAM_REJECTED`; 5xx becomes 502; timeout becomes 504.
13. **Settle** in one DB transaction: release the hold, debit the ledger (idempotency key `usage:<requestId>`), write the usage record and supplier cost record.
14. Response headers: `X-ZZ-Cost`, `X-RateLimit-*`, `X-Request-Id`.

Failed upstream calls are never billed. Optional response caching runs only when the license permits it, scoped per tenant.

## Data model highlights
- All money columns are `Decimal(18,6)`. Arithmetic uses `decimal.js` (`packages/shared/src/money.ts`).
- `wallet_transactions` and `audit_logs` are append-only, enforced by DB triggers. Corrections are new rows.
- A DB CHECK constraint enforces `balance - reserved >= -creditLimit`, so negative balances exist only under an explicit enterprise credit limit.
- `supplier_usage_records.cost` is NULL when the cost is unknown, and `costIsEstimated` flags estimates.

## Frontend routes
- Public: `/`, `/marketplace`, `/marketplace/[slug]`, `/pricing`, `/developers`, `/docs`, `/docs/[slug]`, `/about`, `/contact`, `/login`, `/register`, `/terms`, `/privacy`.
- Customer: `/dashboard` plus `apis`, `keys`, `usage`, `billing` (+ `mock-checkout` in dev), `playground`, `support`, `settings`, `agency`.
- Admin: `/admin` plus `products`, `endpoints`, `integrations`, `providers`, `credentials`, `licenses`, `supplier-costs`, `customers`, `agencies`, `organizations`, `api-keys`, `pricing`, `plans`, `wallets`, `transactions`, `revenue`, `usage`, `support`, `audit`, `settings`.

## Scaling notes
- API instances are stateless. Rate limits, quotas, spend counters, OAuth tokens and job locks live in Redis.
- Circuit breakers and concurrency semaphores are per instance. Supplier-wide limits use Redis counters.
- Run API instances with `DISABLE_BACKGROUND_JOBS=true` and one or more `worker` processes. Each job takes a Redis lock.
- The ledger gets one row per billed request. For very high volume, partition `api_usage_records` and `wallet_transactions` by month (PostgreSQL native partitioning).
