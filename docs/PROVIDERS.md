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

## Adding a new connector type
Implement `ProviderAdapter.authenticate()` in `apps/api/src/modules/integrations/adapters/`, register it in `IntegrationEngine.adapters`, and add the enum value to `ProviderKind`. URL building, validation, SSRF protection, retries, breakers and metering are shared.

## Testing against a real supplier
CI uses the mock upstream (`apps/api/test/mock-upstream/server.ts`). To validate a real, authorized API: create the provider, credential and verified license in a staging environment, then use **Test integration** or call `/v1/...` with a staging key. No real-supplier integration test runs in this repository, because no supplier credentials were provided.
