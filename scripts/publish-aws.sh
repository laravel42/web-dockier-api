#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

load_publish_env

require_cmd pnpm
require_cmd docker
require_cmd aws

AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPOSITORY="${ECR_REPOSITORY:-dockier-api}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
PUBLISH_FRONTEND="${PUBLISH_FRONTEND:-true}"

[[ -n "${AWS_ACCOUNT_ID:-}" ]] || AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
[[ -n "$AWS_ACCOUNT_ID" && "$AWS_ACCOUNT_ID" != "None" ]] || die "Could not resolve AWS account id. Set AWS_ACCOUNT_ID or configure AWS CLI credentials."

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"

log "Checking ECR repository: $ECR_REPOSITORY"
if ! aws ecr describe-repositories --repository-names "$ECR_REPOSITORY" --region "$AWS_REGION" >/dev/null 2>&1; then
  log "Creating ECR repository $ECR_REPOSITORY"
  aws ecr create-repository --repository-name "$ECR_REPOSITORY" --region "$AWS_REGION" >/dev/null
fi

log "Logging in to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

log "Building backend image ($ECR_URI)"
docker build \
  --platform "$DOCKER_PLATFORM" \
  -f "$ROOT_DIR/backend/Dockerfile" \
  -t "$ECR_URI" \
  "$ROOT_DIR"

log "Pushing backend image"
docker push "$ECR_URI"

if [[ -n "${ECS_CLUSTER:-}" && -n "${ECS_SERVICE:-}" ]]; then
  log "Forcing ECS deployment ($ECS_CLUSTER / $ECS_SERVICE)"
  aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service "$ECS_SERVICE" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    >/dev/null
fi

if [[ "$PUBLISH_FRONTEND" == "true" ]]; then
  [[ -n "${S3_FRONTEND_BUCKET:-}" ]] || die "Set S3_FRONTEND_BUCKET to sync the built frontend to AWS."

  API_URL="$(resolve_api_url)"
  install_workspace_deps
  build_frontend "$API_URL"

  log "Syncing frontend to s3://$S3_FRONTEND_BUCKET"
  aws s3 sync "$ROOT_DIR/frontend/dist" "s3://${S3_FRONTEND_BUCKET}/" \
    --delete \
    --region "$AWS_REGION"

  if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
    log "Invalidating CloudFront distribution $CLOUDFRONT_DISTRIBUTION_ID"
    aws cloudfront create-invalidation \
      --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
      --paths "/*" \
      >/dev/null
  fi
fi

cat <<EOF

✓ AWS publish complete.

  Backend image : $ECR_URI
  Region        : $AWS_REGION

Next steps (if not using ECS_CLUSTER + ECS_SERVICE):
  1. Create or update an ECS Fargate service (or EC2 host) using image $ECR_URI
  2. Inject runtime env vars (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, JWT_SECRET, CORS_ORIGIN, DATABASE_URL, WEBHOOK_SECRET)
  3. Expose port 4000 behind an ALB / HTTPS listener
  4. Set DOCKIER_API_URL to that public API URL when publishing the frontend

Optional env vars for this script:
  ECS_CLUSTER, ECS_SERVICE     — force ECS rolling deploy after push
  S3_FRONTEND_BUCKET           — static frontend bucket (required when PUBLISH_FRONTEND=true)
  CLOUDFRONT_DISTRIBUTION_ID   — invalidate CDN after S3 sync
  PUBLISH_FRONTEND=false       — push backend image only

EOF
