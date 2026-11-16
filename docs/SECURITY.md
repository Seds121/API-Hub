# Security

| Control | Implementation |
|---|---|
| Passwords | argon2id (19 MiB, t=2), timing-equalized unknown-user path, lockout after 5 failures (15 min), rehash on login |
| Sessions | Random 48-char tokens, stored only as SHA-256, httpOnly + SameSite=Lax + Secure (prod) cookies, server-side revocation, password change revokes other sessions |
| CSRF | Double-submit token (`zz_csrf` cookie ↔ `X-CSRF-Token`) on every state-changing request; JWT bearer requests are exempt |
| MFA | TOTP (otplib); secret encrypted at rest; required at login once enabled |
| RBAC | Platform roles (admin, support, finance) and org roles (owner, admin, developer, billing, viewer) with permission checks on every route |
| Tenant isolation | Org id comes from the server-side membership (an `x-org-id` header for a non-member is ignored); every query is org-scoped; agency operations verify `parentOrgId`. Tested in `test/e2e/isolation.e2e-spec.ts` |
| API keys | `zz_<env>_<id>_<secret>` with 238 bits of entropy; only HMAC-SHA256 (server pepper) stored; constant-time compare; shown once |
| Supplier credentials | AES-256-GCM with per-provider AAD and versioned keys; write-only API; never logged or returned; key rotation via `CREDENTIAL_ENCRYPTION_OLD_KEYS` |
| SSRF | Customers cannot influence scheme, host or port; host allowlist per provider; DNS resolution checked at connect time (blocks private, link-local and metadata ranges, including via rebinding); no redirects followed; response size cap |
| Input validation | zod on every body and query; strict endpoint parameter validation in the gateway |
| Injection / XSS | Prisma parameterized queries (raw SQL uses tagged templates); React escaping; CSV export neutralizes formula injection; helmet CSP on the API; security headers on web |
| Rate limiting | Per-IP app API limits plus stricter auth limits; gateway per-key, per-endpoint and supplier-level limits (Redis) |
| Payments | Never trusts the client: only signature-verified webhooks (or an admin verifying a bank transfer) credit wallets; amount and currency are checked; events are deduplicated by provider event id |
| Financial integrity | Decimal arithmetic, row locks, idempotency keys, append-only ledger (DB trigger), balance floor CHECK constraint |
| Logging | pino with redaction paths plus a recursive key redactor; API keys and bearer tokens are masked in free text; request bodies are not logged |
| Errors | Normalized envelope; no stack traces or upstream secrets returned |
| HTTPS | HSTS and HTTPS enforcement in production behind a TLS proxy |
| Retention | Usage metadata purged after `DATA_RETENTION_DAYS` (default 90), webhook payloads cleared, expired sessions deleted, audit logs purged after a configurable period through a controlled path |
| Backups | `infra/scripts/backup.sh` (encrypted, checksummed dumps) plus RDS snapshots and PITR in AWS |

## Not yet implemented / recommendations
- Email verification and self-service password reset require an email provider (SMTP is not wired). Password resets currently go through support.
- Put WAF/bot protection in front of `/api/auth/*`.
- Run a third-party penetration test before production launch.
