import { db } from "../shared";

export function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export async function appendLog(deploymentId: string, line: string) {
  await db.exec`UPDATE deployments SET logs = logs || ${line + "\n"} WHERE id = ${deploymentId}`;
}

export function generateAppUrl(provider: string, repoName: string, shortId: string, region: string, deployStrategy?: string): string {
  const slug = `${repoName}-${shortId}`;
  switch (provider) {
    case "digitalocean": return `https://${slug}.ondigitalocean.app`;
    case "hetzner": return `https://${slug}.${region}.hetzner.app`;
    case "vultr": return `https://${slug}.vultr.app`;
    case "linode": return `https://${slug}.linodeobjects.com`;
    case "aws":
      if (deployStrategy === "vps") return `http://ec2-${slug}.compute-1.amazonaws.com`;
      if (deployStrategy === "managed") return `https://${slug}.${region}.elb.amazonaws.com`;
      return `https://${slug}.${region}.awsapprunner.com`;
    case "upcloud": return `https://${slug}.upcloud.app`;
    case "katapult": return `https://${slug}.katapult.io`;
    case "hostinger": return `https://${slug}.hostinger.app`;
    case "vercel": return `https://${slug}.vercel.app`;
    case "netlify": return `https://${slug}.netlify.app`;
    case "cloudflare": return `https://${slug}.pages.dev`;
    case "railway": return `https://${slug}.up.railway.app`;
    case "render": return `https://${slug}.onrender.com`;
    case "flyio": return `https://${slug}.fly.dev`;
    case "gcp":
      if (deployStrategy === "managed") return `https://${slug}-${region}.run.app`;
      return `http://${slug}.${region}.compute.gcp`;
    case "encore": return `https://${slug}.encr.app`;
    default: return `https://${slug}.deploy.app`;
  }
}

export function generateAwsBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  variables:
    AWS_ACCOUNT_ID: "123456789012"
    AWS_DEFAULT_REGION: "us-east-1"
    IMAGE_REPO_NAME: "my-app"
    CACHE_REPO_NAME: "my-app-cache"

phases:
  install:
    commands:
      - set -euo pipefail

  pre_build:
    commands:
      - set -euo pipefail
      - |
        IMAGE_URI="\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com/\${IMAGE_REPO_NAME}"
        CACHE_URI="\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com/\${CACHE_REPO_NAME}"
        IMAGE_TAG="\${CODEBUILD_RESOLVED_SOURCE_VERSION:-latest}"
        SHORT_TAG="\${IMAGE_TAG:0:12}"
        echo "export IMAGE_URI=\${IMAGE_URI}" > /tmp/build_env.sh
        echo "export CACHE_URI=\${CACHE_URI}" >> /tmp/build_env.sh
        echo "export IMAGE_TAG=\${IMAGE_TAG}" >> /tmp/build_env.sh
        echo "export SHORT_TAG=\${SHORT_TAG}" >> /tmp/build_env.sh
      - |
        aws ecr describe-repositories --repository-names "$IMAGE_REPO_NAME" >/dev/null 2>&1 \\
          || aws ecr create-repository --repository-name "$IMAGE_REPO_NAME"
        aws ecr describe-repositories --repository-names "$CACHE_REPO_NAME" >/dev/null 2>&1 \\
          || aws ecr create-repository --repository-name "$CACHE_REPO_NAME"
      - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com"

  build:
    commands:
      - echo "Building Docker image"
      - |
        set -euo pipefail
        source /tmp/build_env.sh
        echo "Building \${IMAGE_URI}:\${SHORT_TAG}"
        DOCKER_BUILDKIT=1 docker build \\
          --progress=plain \\
          --build-arg BUILDKIT_INLINE_CACHE=1 \\
          --cache-from \${IMAGE_URI}:latest \\
          --tag \${IMAGE_URI}:\${SHORT_TAG} \\
          --tag \${IMAGE_URI}:latest \\
          .
      - |
        source /tmp/build_env.sh
        echo "Pushing \${IMAGE_URI}:\${SHORT_TAG}"
        docker push \${IMAGE_URI}:\${SHORT_TAG}
        docker push \${IMAGE_URI}:latest

  post_build:
    commands:
      - |
        source /tmp/build_env.sh
        CALLBACK_URL="\${CALLBACK_URL:-}"
        BUILD_ID="\${BUILD_ID:-}"

        if [ "\${CODEBUILD_BUILD_SUCCEEDING:-1}" = "0" ]; then
          echo "Build FAILED"
          exit 0
        fi

        printf '{"imageUri":"%s"}\\n' "\${IMAGE_URI}:\${SHORT_TAG}" > imageDetail.json
        cat imageDetail.json

        if [ -n "\${SNS_TOPIC_ARN:-}" ] && [ -n "\${DEPLOY_TARGET:-}" ]; then
          python3 << 'PYEOF'
        import json, os, subprocess
        dp_raw = os.environ.get('DEPLOY_PARAMS', '{}')
        try: dp = json.loads(dp_raw)
        except: dp = {}
        image_uri = os.environ.get('IMAGE_URI', '')
        short_tag = os.environ.get('SHORT_TAG', 'latest')
        msg = json.dumps({
            'buildId': os.environ.get('BUILD_ID', ''),
            'imageUri': f'{image_uri}:{short_tag}',
            'deployTarget': os.environ.get('DEPLOY_TARGET', ''),
            'deployParams': dp,
            'callbackUrl': os.environ.get('CALLBACK_URL', '')
        })
        subprocess.run([
            'aws', 'sns', 'publish',
            '--topic-arn', os.environ['SNS_TOPIC_ARN'],
            '--subject', 'build-complete',
            '--message', msg
        ], check=True)
        print('SNS published for deploy')
        PYEOF
        fi

artifacts:
  files:
    - imageDetail.json

cache:
  paths:
    - '/root/.cache/**/*'
`;
}
