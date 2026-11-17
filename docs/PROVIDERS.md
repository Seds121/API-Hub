# Provider & API integration guide

Onboarding a supplier API takes six steps, all in **Admin**.

1. **Provider** (`Admin → API Providers → Add provider`)
   - *RapidAPI listing*: Base URL is the listing's own host, e.g. `https://example-api.p.rapidapi.com`. RapidAPI has no universal endpoint: each listing has its own host, paths and parameters. Optionally set `X-RapidAPI-Host` (defaults to the base host).
   - *Direct REST*: choose the auth method (API key in header or query, Bearer, Basic, OAuth2 client-credentials, custom headers).
   - Set timeout, retries (applied only to GET/PUT/DELETE), retry statuses, max concurrency, the **supplier rate limit** (the gateway never exceeds it) and an optional health-check path.
   - HTTPS is mandatory. The base host becomes the SSRF allowlist; add extra hosts (e.g. an OAuth token host) explicitly.
2. **Credential** (`provider → Credentials → Add / rotate`). Secrets are encrypted with AES-256-GCM, bound to the provider id, and write-only. Rotation deactivates the previous credential unless you choose to keep it.
3. **Supplier subscription**: plan, period, monthly fee and daily/monthly call limits. The gateway enforces the limits with Redis counters, and the fixed fee feeds the profit reports.
4. **License**: record the supplier's written redistribution authorization (reference, territory, restrictions, sub-resale, caching), then **Verify** it. Without a VERIFIED license with `redistributionAllowed`, the API cannot be published and the gateway will not route to that provider. See [LICENSING.md](LICENSING.md).
5. **API product and endpoints** (`Admin → API Marketplace → New API`). Define the public slug (`/v1/<slug>`), endpoints, and parameters (name, location, type, required, enum, max length, pattern, example). Unknown query parameters are always rejected.
6. **Integration** per endpoint: upstream method and path (`{param}` placeholders bound to path params), query rename map, static query and headers (non-secret), body mode (none / validated passthrough / `{{param}}` template), an optional response transform (`root`, `pick`, `rename`), priority (failover order), and **supplier cost per call** (leave blank if unknown; tick "estimate" if not contractual). Use **Test** to make a real call through the engine. Then set a price and **Publish**.

## Example: RapidAPI social profile
| Field | Value |
|---|---|
| Provider base URL | `https://example-api.p.rapidapi.com` |
| Credential | API key = your RapidAPI application key |
| Public endpoint | `GET /v1/social/profile?username=` (param `username`, query, required) |
| Integration | `GET /profile`, no mapping |
| Upstream request | `GET https://example-api.p.rapidapi.com/profile?username=test` with `X-RapidAPI-Key: ••••` and `X-RapidAPI-Host: example-api.p.rapidapi.com` |

## Brave Search (first-class connector)
Brave is a named connector (`kind = BRAVE`). The platform holds **one** Brave API key as an encrypted supplier credential. Customers never see it: they call our gateway with their own `zz_live_…` keys, we bill their wallet, and the gateway forwards to Brave with our key in `X-Subscription-Token`.

1. **Admin → API Providers → Add provider → Connector type: Brave Search.**
   - The base URL pre-fills to `https://api.search.brave.com`, which also becomes the SSRF allowlist.
   - Auth is fixed by the connector. There is no auth method or RapidAPI host to choose.
   - The default supplier rate limit is 60/min. Lower it to match your Brave plan (the free tier allows about 1 request/second).
   - **Never put the key in Default headers.** Secret-looking header names such as `X-Subscription-Token` are rejected.
2. **Credentials → Add / rotate credential.** The only accepted type is *Brave API key*. It is encrypted with AES-256-GCM and can never be viewed again, only rotated.
3. **Quick start → "Create draft API from template".** This creates the `brave-web-search` API (category *Search*) as a **DRAFT**:
   - public `GET /search` with params `q` (required), `count`, `offset`, `country`, `search_lang`, `ui_lang`, `safesearch`, `freshness`
   - upstream `GET /res/v1/web/search`
   - Parameter names match Brave's, so there is no query renaming. Supplier cost is left blank (unknown) until you record your contractual cost on the integration.
4. **Licenses → Record license → Verify.** Record Brave's written authorization for downstream redistribution. Purchasing a Brave plan does not by itself grant resale rights.
5. **Price:** API page → *Set price*. The suggested price is $0.005/request.
6. **Test integration** (API page → endpoint → *Test*, e.g. `q=openai`) makes a real call with the stored key. A 401/403 from Brave shows as a failed test; customers would get `503 API_UNAVAILABLE` and are not billed.
7. **Publish.** Customers can then call:
   ```bash
   curl "https://api.<your-domain>/v1/brave-web-search/search?q=openai&count=5" \
     -H "Authorization: Bearer zz_live_…"
   ```
   The response is Brave's web results JSON; `X-ZZ-Cost` shows the charge.

**Bad or expired key:** Brave reports this as `422 SUBSCRIPTION_TOKEN_INVALID`, not 401. The Brave adapter's `isCredentialError()` hook recognises it:
- Test integration shows *"Supplier rejected our credential"*.
- Customers get `503 API_UNAVAILABLE`, are not billed, and see no Brave details.
- The event is logged for operators.

**Health checks** only probe reachability of the Brave host. A real search probe every few minutes would consume your Brave quota. Validate the key with Test integration.

Brave is equally usable as a **Direct REST** provider: auth *API key*, header name `X-Subscription-Token`, plus a credential. The first-class connector is preferred because it pre-fills, locks and validates all of this.

Local development: set `BRAVE_API_KEY` in `.env` before `pnpm db:seed` to seed the real Brave provider, credential, demo license, price and a published `brave-web-search` API. This only happens in development or with `DEMO_MODE=true`. Without the key, the Brave seed is skipped. No fake Brave responses are ever seeded. In production, Admin → Credentials is the only source of the key.

## Adding a new connector type
Named connectors are registry-driven. The gateway and engine don't change. With Brave as the worked example:

1. **Adapter.** Add a file in `apps/api/src/modules/integrations/adapters/` implementing `ProviderAdapter.authenticate()`. See `brave.adapter.ts`: it returns `{ headers: { 'X-Subscription-Token': secret.apiKey } }` and throws `ProviderConfigError` when the credential is missing. Never log the secret.
2. **Enum + migration.** Add the value to `enum ProviderKind` in `apps/api/prisma/schema.prisma` and a migration (`ALTER TYPE "ProviderKind" ADD VALUE 'BRAVE';`).
3. **Registry entry.** Add it in `packages/shared/src/connectors.ts` (`CONNECTOR_KINDS` + `CONNECTORS`) with:
   - label and description, default base URL, fixed auth type and `authSummary`
   - accepted credential kinds and field labels
   - admin form hints and onboarding copy
   - defaults (timeout, rate limit)
   - optional one-click **templates** (product, endpoint, params, upstream path)
4. **Register the adapter** in `IntegrationEngine.ADAPTERS`. The map is typed `Record<ProviderKind, ProviderAdapter>`, so **the build fails until you do**. `connectors.spec.ts` also checks that every enum value has a registry entry.
5. **Done.** The admin UI reads the registry (connector dropdown, base-URL pre-fill, credential labels, badges, Quick start templates) and the API enforces it (allowed credential kinds, fixed auth type, default base URL). URL building, validation, SSRF protection, retries, circuit breakers, concurrency, supplier quotas, licensing, billing and metering all come from the shared engine and gateway.

Add unit tests for the adapter, and an e2e test against a mock route (see `test/e2e/brave.e2e-spec.ts`). CI never calls real suppliers.

## Testing against a real supplier
CI uses the mock upstream (`apps/api/test/mock-upstream/server.ts`). To validate a real, authorized API: create the provider, credential and verified license in a staging environment, then use **Test integration** or call `/v1/...` with a staging key. No real-supplier integration test runs in this repository, because no supplier credentials were provided.
