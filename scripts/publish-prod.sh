#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

load_publish_env

log "Step 1/2 — Backend → Railway"
bash "$SCRIPT_DIR/publish-railway.sh"

if [[ -z "${DOCKIER_API_URL:-}" ]]; then
  if pnpm exec railway whoami >/dev/null 2>&1 || [[ -n "${RAILWAY_TOKEN:-}" ]]; then
    RAILWAY_SERVICE="${RAILWAY_SERVICE:-dockier-api}"
    RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
    CANDIDATE="$(pnpm exec railway domain --service "$RAILWAY_SERVICE" --environment "$RAILWAY_ENVIRONMENT" 2>/dev/null | tail -n 1 || true)"
    if [[ -n "$CANDIDATE" ]]; then
      if [[ "$CANDIDATE" != http* ]]; then
        DOCKIER_API_URL="https://${CANDIDATE}"
      else
        DOCKIER_API_URL="$CANDIDATE"
      fi
      export DOCKIER_API_URL
      log "Using Railway URL for frontend build: $DOCKIER_API_URL"
    fi
  fi
fi

[[ -n "${DOCKIER_API_URL:-}" ]] || die "Set DOCKIER_API_URL in .env to your Railway public API URL, then re-run."

log "Step 2/2 — Frontend → Cloudflare Pages"
bash "$SCRIPT_DIR/publish-cloudflare.sh"

cat <<EOF

✓ Production publish complete.

  API (Railway) : $DOCKIER_API_URL
  Frontend      : Cloudflare Pages (${CF_PAGES_PROJECT:-dockier-frontend})

EOF
