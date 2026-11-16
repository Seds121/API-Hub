# Deployment

The supported first deployment is **one Linux VPS running Docker Compose**, published as a **live demo** (`DEMO_MODE=true`). Images are built by GitHub Actions and pulled from GHCR.

```
GitHub (Seds121/API-Hub) ──push──▶ Actions: CI (tests) + images (GHCR)
                                                    │ docker pull
VPS: nginx (TLS, Let's Encrypt) ─▶ web (Next.js) ─▶ api ×2 ─▶ postgres, redis
                                     worker (jobs) · mock-upstream (demo only) · certbot (renewal)
```

## 1. Prerequisites
- A VPS running Ubuntu 22.04 or 24.04, with ≥2 vCPU, 4 GB RAM and 40 GB disk (e.g. Hetzner CX22 or a DigitalOcean 4 GB droplet), and a public IPv4 address.
- Ports 22, 80 and 443 reachable.
- The repository pushed to GitHub, with both workflows green (**CI** and **Docker images**). The images are `ghcr.io/seds121/api-hub-api` and `ghcr.io/seds121/api-hub-web`.
  - If the GHCR packages are private, either make them public (GitHub → Packages → package settings → visibility) or pass `GHCR_USER` and `GHCR_TOKEN` (a PAT with `read:packages`) to the bootstrap.
  - A private *repository* additionally needs a deploy key, with `REPO_URL=git@github.com:Seds121/API-Hub.git`.

## 2. Bootstrap (once)
```bash
ssh root@<server-ip>
curl -fsSL https://raw.githubusercontent.com/Seds121/API-Hub/main/infra/scripts/bootstrap-vps.sh -o bootstrap.sh
sudo bash bootstrap.sh            # asks for the admin email + password
```
What the script does:
1. Installs Docker and enables a ufw firewall (22, 80 and 443 only).
2. Clones the repo to `/opt/zeze`.
3. Generates `.env` with fresh secrets (mode 600).
4. Picks hostnames `app.<ip>.sslip.io` / `api.<ip>.sslip.io`.
5. Pulls the images and starts the stack. Migrations run automatically.
6. Seeds the admin and the DEMO catalog.
7. Obtains a Let's Encrypt certificate.
8. Installs a daily `pg_dump` backup into `/opt/zeze/backups` (14-day retention).

It finishes by printing the URLs and logins. Afterwards, remove `SEED_ADMIN_PASSWORD` from `.env` and enable MFA on the admin account.

Optional variables: `DOMAIN_APP`, `DOMAIN_API`, `LE_EMAIL`, `DEMO_MODE=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REPO_URL`, `GHCR_USER`, `GHCR_TOKEN`.

## 3. Updating and rolling back
```bash
sudo /opt/zeze/infra/scripts/deploy.sh            # latest images
sudo /opt/zeze/infra/scripts/deploy.sh 3f2c1ab…   # a specific commit SHA tag (rollback)
```
Alternatively, run **Actions → Deploy to VPS** after adding the `VPS_HOST`, `VPS_USER` and `VPS_SSH_KEY` repository secrets.

## 4. Using your own domain
1. Create DNS A records for `app.yourdomain.com` and `api.yourdomain.com` pointing to the server IP.
2. In `/opt/zeze/.env`, set `APP_HOST`, `API_HOST`, `APP_URL=https://app…`, `API_PUBLIC_URL=https://api…` and `CORS_ORIGINS=https://app…`.
3. Re-run `sudo bash bootstrap.sh`. It keeps the existing `.env` and requests a new certificate.

## 5. Going from demo to production
1. Set `DEMO_MODE=false` and `GATEWAY_ALLOW_PRIVATE_UPSTREAMS=false`. Remove `mock` from `PAYMENT_PROVIDERS`.
2. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and configure the Stripe webhook to `https://app.<domain>/api/webhooks/stripe` (PayPal works the same way).
3. In Admin: disable or delete the DEMO products and providers. Add the real providers, encrypted credentials, supplier subscriptions and **verified redistribution licenses** ([PROVIDERS.md](PROVIDERS.md), [LICENSING.md](LICENSING.md)). Set prices, then publish.
4. Run `sudo ./infra/scripts/deploy.sh`. With `DEMO_MODE=false`, the mock supplier container is not started, mock providers are refused, demo licenses are ignored, and the demo payment method disappears.

## Security properties of the demo deployment
- `NODE_ENV=production` is always set: Secure cookies, HSTS, HTTPS-only API (plain HTTP gets a 400), and placeholder secrets are rejected.
- `DEMO_MODE` enables **only** the simulated suppliers (an internal container with no public port), the demo payment method and the demo seed. A banner on every page states that it is a demo.
- Postgres and Redis are not published. Redis requires a password.

## Scaling beyond one server
See the AWS reference in [ARCHITECTURE.md](ARCHITECTURE.md#scaling-notes). The same images run on ECS Fargate with RDS, ElastiCache and an ALB.

## Backups and restore
- The nightly dump goes to `/opt/zeze/backups`. Copy it off the server (e.g. `rclone` to S3/B2).
- Restore with `docker compose -f infra/docker-compose.yml exec -T postgres pg_restore -U zeze -d zeze --clean --if-exists < backups/<file>.dump`.
- `infra/scripts/backup.sh` provides encrypted and checksummed dumps for external hosts.
