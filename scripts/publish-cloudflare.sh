#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

load_publish_env

require_cmd pnpm
require_cmd npx

API_URL="$(resolve_api_url)"
CF_PAGES_PROJECT="${CF_PAGES_PROJECT:-dockier-frontend}"
CF_PAGES_BRANCH="${CF_PAGES_BRANCH:-}"

install_workspace_deps
build_frontend "$API_URL"

log "Deploying frontend to Cloudflare Pages (project: $CF_PAGES_PROJECT)"
(
  cd "$ROOT_DIR/frontend"
  DEPLOY_ARGS=(pages deploy dist --project-name "$CF_PAGES_PROJECT")
  if [[ -n "$CF_PAGES_BRANCH" ]]; then
    DEPLOY_ARGS+=(--branch "$CF_PAGES_BRANCH")
  fi
  pnpm exec wrangler "${DEPLOY_ARGS[@]}"
)

cat <<EOF

✓ Frontend published to Cloudflare Pages.

  Project : $CF_PAGES_PROJECT
  API URL : $API_URL

Cloudflare Pages serves the React SPA. The API runs on Railway in production.

  pnpm publish:railway       # backend → Railway
  pnpm publish:prod          # Railway + Cloudflare Pages
  pnpm backend:dev           # local API for development

EOF
