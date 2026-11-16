# Installation (local development)

Requirements: Node ≥ 20.11, pnpm 10, PostgreSQL 16, Redis 7.

```bash
pnpm install
cp .env.example .env
```

Generate secrets with `openssl rand -base64 32` for `SESSION_SECRET`, `JWT_SECRET`, `API_KEY_HMAC_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` (the last must be exactly 32 bytes in base64). For the local mock upstream only, set `GATEWAY_ALLOW_PRIVATE_UPSTREAMS=true`. This is refused in production.

```bash
createdb zeze && createdb zeze_test
pnpm --filter @zeze/shared build
pnpm db:migrate                                   # prisma migrate deploy
SEED_ADMIN_PASSWORD='a-strong-password' pnpm db:seed   # roles, admin, DEMO catalog (dev only)
```

Run the services:

```bash
pnpm --filter @zeze/api mock-upstream   # DEV ONLY fake suppliers on :4010
pnpm dev:api                             # :4000, Swagger at http://localhost:4000/api/docs
pnpm dev:web                             # :3000
```

## Tests
- `pnpm --filter @zeze/api test` resets the **`zeze_test`** schema (it refuses any other DB), uses Redis DB 1, and starts its own mock upstream on :4011.
- `pnpm --filter @zeze/web e2e` runs Playwright against running servers (`E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`).
