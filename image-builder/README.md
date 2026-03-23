# Image Builder Service

Builds Docker images for user projects on demand using AWS CodeBuild, pushes them to Amazon ECR, and exposes a typed API through Encore.

## Architecture

```
┌─────────────────┐     startBuild()     ┌──────────────┐
│  Encore API     │ ──────────────────▶  │  AWS CodeBuild│
│  image-builder  │                      │  (on-demand)  │
│                 │  ◀── getBuildStatus   │               │
└────────┬────────┘                      └──────┬────────┘
         │                                      │
         │  DB (builds table)                   │ docker buildx build
         ▼                                      │   --cache-from ECR
   ┌───────────┐                                │   --cache-to ECR
   │ PostgreSQL │                                │   --push
   └───────────┘                                ▼
                                          ┌───────────┐
                                          │ Amazon ECR │
                                          │  (images)  │
                                          │  (cache)   │
                                          └───────────┘
```

No always-on compute. CodeBuild containers spin up per build and terminate when done.

## Build Optimizations

All of these are active:

1. **CodeBuild local caches** — `LOCAL_DOCKER_LAYER_CACHE`, `LOCAL_SOURCE_CACHE`, `LOCAL_CUSTOM_CACHE` enabled on the project. Helps on warm hosts (same underlying EC2 instance).
2. **BuildKit remote cache in ECR** — `--cache-from type=registry` / `--cache-to type=registry,mode=max` against a dedicated `<repo>-cache` ECR repository. This is the primary cache and works across cold hosts.
3. **docker buildx build** — BuildKit is always used, never plain `docker build`.
4. **Dependency directory caching** — `/root/.cache`, `/root/.npm`, `/root/.pnpm-store` etc. are cached via CodeBuild custom cache paths.
5. **Deterministic tagging** — images tagged with short commit SHA (`abc1234`), branch name, and `latest` on main/master.
6. **OCI labels** — `org.opencontainers.image.revision`, `.source`, `.ref.name`, `.created` embedded in every image.
7. **Machine-readable artifact** — `imageDetail.json` emitted with full build metadata.

### Cache Limitations

- CodeBuild local cache is host-local. If your build lands on a different EC2 instance, the local cache is cold. This is normal.
- The remote ECR cache (`--cache-from`/`--cache-to`) mitigates cold hosts — it's the reliable cache layer.
- Concurrent builds may land on different hosts and won't share local cache, but they all share the ECR remote cache.

## AWS Resources

Created by the setup script or CloudFormation template:

| Resource | Name | Purpose |
|----------|------|---------|
| CodeBuild Project | `image-builder` | Runs Docker builds |
| IAM Role | `image-builder-codebuild-role` | Least-privilege role for CodeBuild |
| CloudWatch Log Group | `/aws/codebuild/image-builder` | Build logs (30-day retention) |
| ECR Repository | `<app-name>` | Final images (created on-demand by buildspec) |
| ECR Repository | `<app-name>-cache` | BuildKit cache layers (created on-demand by buildspec) |

## Setup

### Option A: CloudFormation (recommended)

```bash
aws cloudformation deploy \
  --template-file image-builder/infra/cloudformation.yml \
  --stack-name image-builder \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Option B: Shell script

```bash
./image-builder/infra/setup-codebuild.sh us-east-1 image-builder
```

### Set Encore Secrets

The Encore service needs AWS credentials that can call `codebuild:StartBuild`, `codebuild:BatchGetBuilds`, `codebuild:StopBuild`, and `sts:GetCallerIdentity`.

```bash
encore secret set ImageBuilderAwsAccessKeyId --type dev
encore secret set ImageBuilderAwsSecretAccessKey --type dev
encore secret set ImageBuilderAwsRegion --type dev          # e.g. us-east-1
encore secret set ImageBuilderCodeBuildProject --type dev    # e.g. image-builder
```


### Required IAM Permissions for the Encore App

The AWS credentials used by the Encore service (the secrets above) need:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "codebuild:StartBuild",
        "codebuild:BatchGetBuilds",
        "codebuild:StopBuild"
      ],
      "Resource": "arn:aws:codebuild:*:*:project/image-builder"
    },
    {
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    }
  ]
}
```

These are separate from the CodeBuild role (which has ECR/CloudWatch permissions).

## API

### Start a Build

```bash
curl -X POST http://localhost:4000/image-builder/builds \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceRepo": "myorg/my-app",
    "sourceRef": "main",
    "commitSha": "abc1234def5678",
    "dockerfilePath": "Dockerfile",
    "buildContext": ".",
    "tags": ["v1.2.3"],
    "projectId": "optional-project-uuid"
  }'
```

Response:
```json
{
  "id": "build-uuid",
  "codebuildId": "image-builder:cb-uuid",
  "status": "submitted",
  "sourceRepo": "myorg/my-app",
  "sourceRef": "main",
  "imageRepo": "my-app",
  "logsUrl": "https://us-east-1.console.aws.amazon.com/cloudwatch/...",
  "createdAt": "2026-03-21T12:00:00Z"
}
```

### Get Build Status

```bash
curl http://localhost:4000/image-builder/builds/<build-id> \
  -H "Authorization: Bearer <token>"
```

Refreshes status from CodeBuild if the build is still in progress.

### List Builds

```bash
# All builds
curl "http://localhost:4000/image-builder/builds" -H "Authorization: Bearer <token>"

# Filter by repo
curl "http://localhost:4000/image-builder/builds?sourceRepo=myorg/my-app" -H "Authorization: Bearer <token>"

# Filter by status
curl "http://localhost:4000/image-builder/builds?status=succeeded" -H "Authorization: Bearer <token>"
```

### Get Image for Revision

```bash
# By commit SHA (full or short)
curl http://localhost:4000/image-builder/images/abc1234 \
  -H "Authorization: Bearer <token>"

# By branch name
curl http://localhost:4000/image-builder/images/main \
  -H "Authorization: Bearer <token>"
```

Response:
```json
{
  "imageUri": "123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:abc1234",
  "buildId": "build-uuid",
  "commitSha": "abc1234def5678...",
  "status": "succeeded",
  "createdAt": "2026-03-21T12:00:00Z"
}
```

### Cancel a Build

```bash
curl -X POST http://localhost:4000/image-builder/builds/<build-id>/cancel \
  -H "Authorization: Bearer <token>"
```

## Environment Variables (in CodeBuild)

These are set automatically by `startBuild()` — you don't configure them manually:

| Variable | Description |
|----------|-------------|
| `SOURCE_REPO` | GitHub repo path (e.g. `org/app`) |
| `SOURCE_REF` | Branch, tag, or SHA |
| `COMMIT_SHA` | Explicit commit SHA |
| `IMAGE_REPO_URI` | Full ECR URI for the image |
| `CACHE_REPO_URI` | Full ECR URI for BuildKit cache |
| `DOCKERFILE_PATH` | Path to Dockerfile |
| `BUILD_CONTEXT` | Docker build context directory |
| `EXTRA_TAGS` | Comma-separated additional tags |
| `BUILD_ID` | Internal build tracking ID |
| `AWS_ACCOUNT_ID` | AWS account ID |
| `AWS_DEFAULT_REGION` | AWS region |

## Troubleshooting

### Build stuck in "submitted"
CodeBuild may queue builds if concurrency limits are hit. Check the CodeBuild console or increase the concurrent build limit.

### ECR auth failures
The CodeBuild IAM role needs `ecr:GetAuthorizationToken` (global) and push/pull permissions on the ECR repos. The setup script/CloudFormation grants these.

### Cache misses on every build
- First build always misses (cold cache). Subsequent builds should hit the ECR remote cache.
- If local cache keeps missing, builds are landing on different hosts. The ECR remote cache handles this.
- Check that the `<repo>-cache` ECR repository exists and has images.

### Build timeout
Default is 30 minutes. Increase `BuildTimeoutMinutes` in CloudFormation or update the CodeBuild project.

### Logs
All build output goes to CloudWatch at `/aws/codebuild/image-builder`. The `logsUrl` in the API response links directly to the build's log stream.
