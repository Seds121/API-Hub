#!/usr/bin/env bash
# Pull images for a tag, run migrations and (re)start the stack. Run as root from /opt/zeze.
#   sudo ./infra/scripts/deploy.sh [tag]      (default: latest)
# Roll back by deploying an earlier commit SHA tag.
set -euo pipefail
cd "$(dirname "$0")/../.."
TAG="${1:-latest}"
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "invalid tag: $TAG" >&2; exit 1; }
set -a; . ./.env; set +a
OWNER_REPO="${GHCR_IMAGE_PREFIX:-ghcr.io/seds121/api-hub}"
export API_IMAGE="$OWNER_REPO-api:$TAG" WEB_IMAGE="$OWNER_REPO-web:$TAG"
PROFILE=()
[[ "${DEMO_MODE:-false}" == "true" ]] && PROFILE=(--profile demo)
DC=(docker compose -f infra/docker-compose.yml --env-file .env "${PROFILE[@]}")

"${DC[@]}" pull --quiet
"${DC[@]}" up -d --remove-orphans --scale api=2
"${DC[@]}" ps
echo "Deployed $TAG"
