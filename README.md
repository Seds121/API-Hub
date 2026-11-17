# Ze-Ze Technologies — API Marketplace & Reseller Platform

[![CI](https://github.com/Seds121/API-Hub/actions/workflows/ci.yml/badge.svg)](https://github.com/Seds121/API-Hub/actions/workflows/ci.yml) [![Docker images](https://github.com/Seds121/API-Hub/actions/workflows/images.yml/badge.svg)](https://github.com/Seds121/API-Hub/actions/workflows/images.yml)

A multi-tenant SaaS platform for distributing **authorized** third-party APIs (RapidAPI listings and direct REST providers) through one gateway, one key and one bill. It covers a public marketplace, customer dashboard, agency reseller tools, admin console, developer portal, a central API gateway, and a precise wallet and billing engine.

| Area | Location |
|---|---|
| NestJS API, gateway (`/v1/*`), workers | `apps/api` |
| Next.js web app (site, `/dashboard`, `/admin`, `/docs`) | `apps/web` |
| Shared types, money math, permissions | `packages/shared` |
| Docker, Compose, nginx, backups | `infra/` |
| Documentation | `docs/` |

Read these docs: [Architecture](docs/ARCHITECTURE.md) · [Installation](docs/INSTALL.md) · [Deployment](docs/DEPLOY.md) · [Provider & API integration](docs/PROVIDERS.md) · [Security](docs/SECURITY.md) · [Licensing model](docs/LICENSING.md).

## Quick start (development)

```bash
pnpm install
cp .env.example .env            # then generate secrets (see docs/INSTALL.md)
pnpm --filter @zeze/shared build
pnpm db:migrate && SEED_ADMIN_PASSWORD='ChangeMe-Admin-2026' pnpm db:seed
pnpm --filter @zeze/api mock-upstream   # terminal 1 — DEV-ONLY fake suppliers
pnpm dev:api                             # terminal 2 — http://localhost:4000 (Swagger at /api/docs)
pnpm dev:web                             # terminal 3 — http://localhost:3000
```

Demo logins (development seed only): `admin@zeze.local` / your `SEED_ADMIN_PASSWORD`, `demo@acme.test` / `DemoPass-2026`, `agency@northwind.test` / `DemoPass-2026`.

## Deploy

One VPS, one command: see **[docs/DEPLOY.md](docs/DEPLOY.md)** (`infra/scripts/bootstrap-vps.sh` sets up Docker, TLS via Let's Encrypt, secrets, the demo seed and backups).

## What needs real credentials

| Integration | Status without credentials | Required |
|---|---|---|
| RapidAPI / direct suppliers | Mock upstream (`isMock` providers, refused in production) | Supplier API key per provider **plus** a verified redistribution license |
| Brave Search (first-class connector) | Connector, template and gateway tested in CI against a Brave-shaped mock; live call needs your key | Brave API key in **Admin → API Providers → Credentials** + verified license. `BRAVE_API_KEY` in `.env` only seeds it locally/DEMO_MODE |
| Stripe | Signature verification tested offline; checkout not exercised | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| PayPal | Implemented, **untested** | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` |
| Bank transfer | Fully working (admin verification) | Bank instructions text |
| Email alerts | Events recorded in the admin console; not sent by email | SMTP integration (not implemented) |

Example customer call (Brave): `GET /v1/brave-web-search/search?q=openai` with `Authorization: Bearer zz_live_…`. See [docs/PROVIDERS.md](docs/PROVIDERS.md#brave-search-first-class-connector).

## Tests

```bash
pnpm --filter @zeze/api test     # 82 Jest unit + e2e tests (needs Postgres + Redis; see docs/INSTALL.md)
pnpm --filter @zeze/shared test
pnpm --filter @zeze/web e2e      # Playwright browser journeys (needs running API, mock upstream and web)
```
