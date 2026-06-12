#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

load_publish_env

require_cmd pnpm

RAILWAY_SERVICE="${RAILWAY_SERVICE:-dockier-api}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
SYNC_RAILWAY_ENV="${SYNC_RAILWAY_ENV:-false}"

railway_cmd() {
  pnpm exec railway "$@"
}

if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  export RAILWAY_TOKEN
elif ! railway_cmd whoami >/dev/null 2>&1; then
  die "Not logged in to Railway. Run: pnpm exec railway login — or set RAILWAY_TOKEN for CI."
fi

if [[ -z "${RAILWAY_PROJECT_ID:-}" ]]; then
  if ! railway_cmd status >/dev/null 2>&1; then
    die "Project not linked. Run once from repo root: pnpm exec railway link"
  fi
fi

skip_railway_env_key() {
  local key="$1"
  case "$key" in
    DOCKIER_API_URL|IMAGE_TAG|SHADCNBLOCKS_API_KEY)
      return 0
      ;;
  esac
  case "$key" in
    VITE_*|RAILWAY_*|AWS_*|ECR_*|ECS_*|S3_*|CLOUDFRONT_*|CF_*)
      return 0
      ;;
  esac
  return 1
}

sync_railway_env() {
  local env_file="${RAILWAY_ENV_FILE:-$ROOT_DIR/.env}"
  [[ -f "$env_file" ]] || die "No env file to sync: $env_file"

  log "Syncing runtime variables from $env_file to Railway ($RAILWAY_SERVICE / $RAILWAY_ENVIRONMENT)"

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    if skip_railway_env_key "$key"; then
      continue
    fi

    if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi
    [[ -n "$value" ]] || continue

    if [[ "$value" == *"@"* || "$value" == *" "* || "$value" == *"="* ]]; then
      printf '%s' "$value" | railway_cmd variable set "$key" \
        --stdin \
        --service "$RAILWAY_SERVICE" \
        --environment "$RAILWAY_ENVIRONMENT" \
        --skip-deploys
    else
      railway_cmd variable set "$key=$value" \
        --service "$RAILWAY_SERVICE" \
        --environment "$RAILWAY_ENVIRONMENT" \
        --skip-deploys
    fi
    log "  Set variable $key"
  done < "$env_file"

  # Variable updates use --skip-deploys to batch; restart the service so the
  # running container picks up the new env (railway up may SKIPPED when code unchanged).
  log "Restarting service to apply synced variables"
  railway_cmd redeploy \
    --service "$RAILWAY_SERVICE" \
    --environment "$RAILWAY_ENVIRONMENT" \
    --yes
}

if [[ "$SYNC_RAILWAY_ENV" == "true" ]]; then
  sync_railway_env
fi

log "Deploying backend to Railway (service: $RAILWAY_SERVICE, environment: $RAILWAY_ENVIRONMENT)"
(
  cd "$ROOT_DIR"
  railway_cmd up \
    --service "$RAILWAY_SERVICE" \
    --environment "$RAILWAY_ENVIRONMENT" \
    --detach
)

RAILWAY_PUBLIC_URL="${DOCKIER_API_URL:-}"
if [[ -z "$RAILWAY_PUBLIC_URL" ]]; then
  RAILWAY_PUBLIC_URL="$(railway_cmd domain --service "$RAILWAY_SERVICE" --environment "$RAILWAY_ENVIRONMENT" 2>/dev/null | tail -n 1 || true)"
  if [[ -n "$RAILWAY_PUBLIC_URL" && "$RAILWAY_PUBLIC_URL" != http* ]]; then
    RAILWAY_PUBLIC_URL="https://${RAILWAY_PUBLIC_URL}"
  fi
fi

cat <<EOF

✓ Backend published to Railway.

  Service     : $RAILWAY_SERVICE
  Environment : $RAILWAY_ENVIRONMENT
  Public URL  : ${RAILWAY_PUBLIC_URL:-"(generate a domain in Railway dashboard)"}

Next steps:
  1. Set DOCKIER_API_URL in .env to the Railway public URL (if not already set)
  2. Set CORS_ORIGIN on Railway to your Cloudflare Pages frontend origin
  3. Runtime secrets — either:
       a) LOAD_SECRETS_FROM=cloudflare + bridge vars (recommended), or
       b) SYNC_RAILWAY_ENV=true pnpm publish:railway  (push .env vars to Railway)
  4. Publish frontend: pnpm publish:cloudflare
     Or full stack: pnpm publish:prod

Optional env vars:
  RAILWAY_SERVICE=dockier-api
  RAILWAY_ENVIRONMENT=production
  SYNC_RAILWAY_ENV=true          — upload .env runtime vars before deploy
  RAILWAY_TOKEN                  — CI deploy token (no interactive login)

EOF
