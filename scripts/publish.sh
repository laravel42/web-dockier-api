#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Publish Dockier to Railway, Cloudflare, or AWS.

Usage:
  bash scripts/publish.sh prod          # Railway backend + Cloudflare frontend (production)
  bash scripts/publish.sh railway       # Backend only → Railway
  bash scripts/publish.sh cloudflare    # Frontend only → Cloudflare Pages
  bash scripts/publish.sh aws           # Legacy: ECR + optional S3 frontend

Environment:
  Set DOCKIER_API_URL (and other publish vars) in .env at the repo root,
  or pass PUBLISH_ENV_FILE to point at another env file.

Targets:
  prod         Deploy backend to Railway, then frontend to Cloudflare Pages.
  railway      Build and deploy the Fastify backend Docker image to Railway.
  cloudflare   Build the React SPA and deploy to Cloudflare Pages (wrangler).
  aws          Legacy — push backend image to ECR; optional S3 + CloudFront.

Examples:
  pnpm publish:prod

  DOCKIER_API_URL=https://dockier-api.up.railway.app pnpm publish:cloudflare

  SYNC_RAILWAY_ENV=true pnpm publish:railway

EOF
}

target="${1:-}"
case "$target" in
  prod)
    exec "$SCRIPT_DIR/publish-prod.sh" "${@:2}"
    ;;
  railway)
    exec "$SCRIPT_DIR/publish-railway.sh" "${@:2}"
    ;;
  cloudflare|cf)
    exec "$SCRIPT_DIR/publish-cloudflare.sh" "${@:2}"
    ;;
  aws)
    exec "$SCRIPT_DIR/publish-aws.sh" "${@:2}"
    ;;
  -h|--help|help|"")
    usage
    [[ -n "$target" ]] && exit 0 || exit 1
    ;;
  *)
    printf 'Unknown target: %s\n\n' "$target" >&2
    usage
    exit 1
    ;;
esac
