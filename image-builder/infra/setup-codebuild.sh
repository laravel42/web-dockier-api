#!/usr/bin/env bash
set -euo pipefail

# ─── Image Builder — AWS Infrastructure Setup ───
# Creates the CodeBuild project, S3 source bucket, IAM role, and CloudWatch log group.
# Preferred method: use CloudFormation instead (cloudformation.yml).
#
# Usage:
#   ./setup-codebuild.sh                          # defaults: us-east-1, project=image-builder
#   ./setup-codebuild.sh us-west-2 my-builder     # custom region and project name

REGION="${1:-us-east-1}"
PROJECT_NAME="${2:-image-builder}"
LOG_GROUP="/aws/codebuild/${PROJECT_NAME}"
ROLE_NAME="${PROJECT_NAME}-codebuild-role"
POLICY_NAME="${PROJECT_NAME}-codebuild-policy"

echo "── Setting up CodeBuild project: ${PROJECT_NAME} in ${REGION} ──"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account: ${ACCOUNT_ID}"

BUCKET_NAME="${PROJECT_NAME}-source-${ACCOUNT_ID}"

# ── 1. S3 Bucket for source uploads ──
echo "Creating S3 source bucket..."
if aws s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
  echo "  (already exists)"
else
  aws s3api create-bucket --bucket "${BUCKET_NAME}" --region "${REGION}" \
    $([ "${REGION}" != "us-east-1" ] && echo "--create-bucket-configuration LocationConstraint=${REGION}" || true)
  aws s3api put-public-access-block --bucket "${BUCKET_NAME}" \
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  # Auto-expire old source zips after 7 days
  aws s3api put-bucket-lifecycle-configuration --bucket "${BUCKET_NAME}" --lifecycle-configuration '{
    "Rules": [{"ID": "ExpireOldSources", "Status": "Enabled", "Expiration": {"Days": 7}, "Filter": {"Prefix": ""}}]
  }'
fi
echo "  ✓ S3 bucket: ${BUCKET_NAME}"

# ── 2. CloudWatch Log Group ──
echo "Creating CloudWatch log group..."
aws logs create-log-group \
  --log-group-name "${LOG_GROUP}" \
  --region "${REGION}" 2>/dev/null || echo "  (already exists)"

aws logs put-retention-policy \
  --log-group-name "${LOG_GROUP}" \
  --retention-in-days 30 \
  --region "${REGION}"
echo "  ✓ Log group: ${LOG_GROUP} (30-day retention)"

# ── 3. IAM Role ──
echo "Creating IAM role..."
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "codebuild.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
)

aws iam create-role \
  --role-name "${ROLE_NAME}" \
  --assume-role-policy-document "${TRUST_POLICY}" \
  --region "${REGION}" 2>/dev/null || echo "  (role already exists)"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

# ── 4. IAM Policy ──
echo "Attaching IAM policy..."
POLICY_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": [
        "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP}",
        "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP}:*"
      ]
    },
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "ECRPushPull",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
        "ecr:CreateRepository", "ecr:DescribeRepositories", "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart"
      ],
      "Resource": ["arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/*"]
    },
    {
      "Sid": "S3Source",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:GetObjectVersion", "s3:GetBucketVersioning"],
      "Resource": [
        "arn:aws:s3:::${BUCKET_NAME}",
        "arn:aws:s3:::${BUCKET_NAME}/*"
      ]
    },
    {
      "Sid": "CodeBuildReports",
      "Effect": "Allow",
      "Action": [
        "codebuild:CreateReportGroup", "codebuild:CreateReport",
        "codebuild:UpdateReport", "codebuild:BatchPutTestCases"
      ],
      "Resource": ["arn:aws:codebuild:${REGION}:${ACCOUNT_ID}:report-group/${PROJECT_NAME}-*"]
    }
  ]
}
EOF
)

aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "${POLICY_NAME}" \
  --policy-document "${POLICY_DOC}"
echo "  ✓ IAM role: ${ROLE_NAME}"

echo "  Waiting for IAM propagation..."
sleep 10

# ── 5. CodeBuild Project ──
echo "Creating CodeBuild project..."

PROJECT_CONFIG=$(cat <<EOF
{
  "name": "${PROJECT_NAME}",
  "description": "Builds Docker images for user projects — source uploaded via S3",
  "source": {
    "type": "S3",
    "location": "${BUCKET_NAME}/",
    "buildspec": "$(cat "$(dirname "$0")/../buildspec.yml" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'| sed 's/^"//;s/"$//')"
  },
  "artifacts": { "type": "NO_ARTIFACTS" },
  "cache": {
    "type": "LOCAL",
    "modes": ["LOCAL_DOCKER_LAYER_CACHE", "LOCAL_CUSTOM_CACHE"]
  },
  "environment": {
    "type": "LINUX_CONTAINER",
    "image": "aws/codebuild/amazonlinux2-x86_64-standard:5.0",
    "computeType": "BUILD_GENERAL1_MEDIUM",
    "privilegedMode": true,
    "environmentVariables": [
      { "name": "DOCKER_BUILDKIT", "value": "1", "type": "PLAINTEXT" }
    ]
  },
  "serviceRole": "${ROLE_ARN}",
  "timeoutInMinutes": 30,
  "queuedTimeoutInMinutes": 60,
  "logsConfig": {
    "cloudWatchLogs": { "status": "ENABLED", "groupName": "${LOG_GROUP}" }
  }
}
EOF
)

if aws codebuild create-project --cli-input-json "${PROJECT_CONFIG}" --region "${REGION}" >/dev/null 2>&1; then
  echo "  ✓ CodeBuild project created: ${PROJECT_NAME}"
else
  aws codebuild update-project --cli-input-json "${PROJECT_CONFIG}" --region "${REGION}" >/dev/null
  echo "  ✓ CodeBuild project updated: ${PROJECT_NAME}"
fi

# ── Summary ──
echo ""
echo "── Setup Complete ──"
echo "  Region:            ${REGION}"
echo "  CodeBuild project: ${PROJECT_NAME}"
echo "  S3 bucket:         ${BUCKET_NAME}"
echo "  IAM role:          ${ROLE_NAME}"
echo "  Log group:         ${LOG_GROUP}"
echo "  Account ID:        ${ACCOUNT_ID}"
echo ""
echo "── Encore Secrets to Set ──"
echo "  encore secret set ImageBuilderAwsAccessKeyId --type dev"
echo "  encore secret set ImageBuilderAwsSecretAccessKey --type dev"
echo "  encore secret set ImageBuilderAwsRegion --type dev        # ${REGION}"
echo "  encore secret set ImageBuilderCodeBuildProject --type dev  # ${PROJECT_NAME}"
echo ""
echo "── IAM permissions needed for the Encore service AWS user ──"
echo "  The AWS user whose credentials are in Encore secrets needs:"
echo "  - codebuild:StartBuild, codebuild:StopBuild, codebuild:BatchGetBuilds"
echo "  - s3:PutObject on arn:aws:s3:::${BUCKET_NAME}/*"
echo "  - sts:GetCallerIdentity"
