#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 VPS for the Ze-Ze API Hub (live DEMO deployment).
#
#   curl -fsSL https://raw.githubusercontent.com/Seds121/API-Hub/main/infra/scripts/bootstrap-vps.sh -o bootstrap.sh
#   sudo bash bootstrap.sh
#
# Optional environment overrides:
#   REPO_URL      (default https://github.com/Seds121/API-Hub.git; private repos: use a deploy-key SSH URL)
#   DOMAIN_APP / DOMAIN_API  (default app.<ip>.sslip.io / api.<ip>.sslip.io)
#   LE_EMAIL      (Let's Encrypt contact; optional)
#   DEMO_MODE     (default true)
#   ADMIN_EMAIL / ADMIN_PASSWORD (prompted if unset)
#   GHCR_USER / GHCR_TOKEN (only if the GHCR packages are private; token needs read:packages)
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }

REPO_URL="${REPO_URL:-https://github.com/Seds121/API-Hub.git}"
APP_DIR=/opt/zeze
DEMO_MODE="${DEMO_MODE:-true}"
log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

log "Installing Docker, git, ufw"
apt-get update -y
apt-get install -y ca-certificates curl git ufw openssl
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

log "Firewall: allow only SSH, HTTP, HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

log "Fetching code into $APP_DIR"
id zeze >/dev/null 2>&1 || useradd -r -m -s /bin/bash zeze
if [[ -d $APP_DIR/.git ]]; then
  sudo -u zeze git -C "$APP_DIR" pull --ff-only
else
  install -d -o zeze -g zeze "$APP_DIR"
  sudo -u zeze git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
APP_HOST="${DOMAIN_APP:-app.$IP.sslip.io}"
API_HOST="${DOMAIN_API:-api.$IP.sslip.io}"

if [[ ! -f .env ]]; then
  log "Generating .env with fresh secrets"
  : "${ADMIN_EMAIL:=$(read -rp 'Admin email: ' x && echo "$x")}"
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then read -rsp 'Admin password (12+ chars): ' ADMIN_PASSWORD; echo; fi
  [[ ${#ADMIN_PASSWORD} -ge 12 ]] || { echo "Password too short" >&2; exit 1; }
  rnd() { openssl rand -base64 32 | tr -d '\n'; }
  hex() { openssl rand -hex 24; }
  cp .env.example .env
  set_kv() { # set KEY='VALUE' in .env — single-quoted literal (no $ or quote interpolation in bash or compose)
    local k="$1" v="$2"
    if [[ "$v" == *"'"* || "$v" == *$'\n'* ]]; then echo "Value for $k must not contain a single quote or newline" >&2; exit 1; fi
    K="$k" V="$v" awk -v q="'" 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]} index($0, k "=")==1 {print k "=" q v q; done=1; next} {print} END{if(!done) print k "=" q v q}' .env > .env.tmp
    mv .env.tmp .env
  }
  set_kv NODE_ENV production
  set_kv DEMO_MODE "$DEMO_MODE"
  set_kv APP_URL "https://$APP_HOST"
  set_kv API_PUBLIC_URL "https://$API_HOST"
  set_kv NEXT_PUBLIC_API_PUBLIC_URL "https://$API_HOST"
  set_kv CORS_ORIGINS "https://$APP_HOST"
  set_kv APP_HOST "$APP_HOST"
  set_kv API_HOST "$API_HOST"
  set_kv TRUST_PROXY 1
  set_kv SESSION_SECRET "$(rnd)"
  set_kv JWT_SECRET "$(rnd)"
  set_kv API_KEY_HMAC_SECRET "$(rnd)"
  set_kv CREDENTIAL_ENCRYPTION_KEY "$(rnd)"
  set_kv POSTGRES_PASSWORD "$(hex)"
  set_kv REDIS_PASSWORD "$(hex)"
  set_kv SEED_ADMIN_EMAIL "$ADMIN_EMAIL"
  set_kv SEED_ADMIN_PASSWORD "$ADMIN_PASSWORD"
  if [[ "$DEMO_MODE" == "true" ]]; then
    set_kv GATEWAY_ALLOW_PRIVATE_UPSTREAMS true
    set_kv PAYMENT_PROVIDERS "mock,manual_bank"
  else
    set_kv GATEWAY_ALLOW_PRIVATE_UPSTREAMS false
    set_kv PAYMENT_PROVIDERS "manual_bank"
  fi
  # DATABASE_URL / REDIS_URL are provided by docker-compose; drop the localhost defaults.
  sed -i '/^DATABASE_URL=/d;/^REDIS_URL=/d;/^MOCK_UPSTREAM_URL=/d' .env
  chown zeze:zeze .env && chmod 600 .env
else
  log ".env already exists — keeping it"
fi
set -a; . ./.env; set +a

if [[ -n "${GHCR_TOKEN:-}" ]]; then
  log "Logging in to GHCR"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER required with GHCR_TOKEN}" --password-stdin
fi

PROFILE=(); [[ "${DEMO_MODE}" == "true" ]] && PROFILE=(--profile demo)
DC=(docker compose -f infra/docker-compose.yml --env-file .env "${PROFILE[@]}")

log "Pulling images"
"${DC[@]}" pull --quiet

log "TLS: temporary self-signed certificate so nginx can start"
TMPCERT="$(mktemp -d)"
openssl req -x509 -nodes -newkey rsa:2048 -days 2 -subj "/CN=$APP_HOST" \
  -keyout "$TMPCERT/privkey.pem" -out "$TMPCERT/fullchain.pem" 2>/dev/null
"${DC[@]}" run --rm --no-deps -v "$TMPCERT:/src:ro" --entrypoint sh certbot -c \
  'test -f /etc/letsencrypt/live/zeze/fullchain.pem || (mkdir -p /etc/letsencrypt/live/zeze && cp /src/*.pem /etc/letsencrypt/live/zeze/)'
rm -f "$TMPCERT/privkey.pem" "$TMPCERT/fullchain.pem" && rmdir "$TMPCERT"

log "Starting the stack (migrations run automatically)"
"${DC[@]}" up -d --scale api=2

log "Seeding roles, admin$([[ $DEMO_MODE == true ]] && echo ' and DEMO catalog')"
"${DC[@]}" run --rm --no-deps api node dist/cli/seed.js

log "Requesting Let's Encrypt certificate for $APP_HOST and $API_HOST"
EMAIL_ARG=(--register-unsafely-without-email); [[ -n "${LE_EMAIL:-}" ]] && EMAIL_ARG=(--email "$LE_EMAIL")
# Drop the temporary self-signed cert unless a real Let's Encrypt cert is already managed.
"${DC[@]}" run --rm --no-deps --entrypoint sh certbot -c \
  'test -f /etc/letsencrypt/renewal/zeze.conf || rm -r /etc/letsencrypt/live/zeze'
"${DC[@]}" run --rm --no-deps certbot certonly --webroot -w /var/www/certbot --cert-name zeze \
  -d "$APP_HOST" -d "$API_HOST" "${EMAIL_ARG[@]}" --agree-tos --non-interactive --keep-until-expiring
"${DC[@]}" exec nginx nginx -s reload

log "Daily database backups (02:30, 14-day retention)"
cat > /etc/cron.d/zeze-backup <<CRON
30 2 * * * root cd $APP_DIR && docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres pg_dump -U zeze -Fc zeze > backups/zeze-\$(date -u +\%Y\%m\%dT\%H\%M\%SZ).dump && find backups -name 'zeze-*.dump' -mtime +14 -delete
CRON
install -d -o root -m 700 "$APP_DIR/backups"

log "Done"
cat <<MSG

  Web app:      https://$APP_HOST
  API gateway:  https://$API_HOST/v1/...
  Admin login:  $SEED_ADMIN_EMAIL (password you entered)
$( [[ $DEMO_MODE == true ]] && echo "  Demo users:   demo@acme.test / agency@northwind.test — password DemoPass-2026" )

  Update later: sudo $APP_DIR/infra/scripts/deploy.sh [tag]
  Remove SEED_ADMIN_PASSWORD from $APP_DIR/.env after verifying you can sign in.
MSG
