#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Publish Dockier to Cloudflare or AWS.

Usage:
  bash scripts/publish.sh cloudflare
  bash scripts/publish.sh aws

Environment:
  Copy scripts/publish.env.example to scripts/publish.env (or set PUBLISH_ENV_FILE).

Targets:
  cloudflare   Build the React SPA and deploy to Cloudflare Pages (wrangler).
  aws          Build/push the Fastify backend Docker image to ECR; optionally sync
               the frontend to S3 + invalidate CloudFront.

Cloudflare Pages hosts the frontend only. The API must run elsewhere (use aws).

Examples:
  DOCKIER_API_URL=https://api.example.com bash scripts/publish.sh cloudflare

  DOCKIER_API_URL=https://api.example.com \
  S3_FRONTEND_BUCKET=dockier-app \
  ECS_CLUSTER=dockier \
  ECS_SERVICE=dockier-api \
  bash scripts/publish.sh aws

EOF
}

target="${1:-}"
case "$target" in
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
