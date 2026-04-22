// ─── Common Buildspec Sections ───

export function commonPreBuild(): string {
  return `  pre_build:
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
      - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com"`;
}

export function buildAndPush(): string {
  return `      - |
        set -euo pipefail
        source /tmp/build_env.sh
        echo "Building \${IMAGE_URI}:\${SHORT_TAG}"
        # Only use --cache-from when the image already exists in the registry
        CACHE_FLAG=""
        if docker manifest inspect \${IMAGE_URI}:latest >/dev/null 2>&1; then
          CACHE_FLAG="--cache-from \${IMAGE_URI}:latest"
          echo "Cache image found — using --cache-from"
        else
          echo "No cache image found — building without cache"
        fi
        # Capture all build output to a file so we can display it even on failure
        set +e
        DOCKER_BUILDKIT=1 docker build \\
          --progress=plain \\
          --build-arg BUILDKIT_INLINE_CACHE=1 \\
          \${CACHE_FLAG} \\
          --tag \${IMAGE_URI}:\${SHORT_TAG} \\
          --tag \${IMAGE_URI}:latest \\
          . > /tmp/docker_build.log 2>&1
        BUILD_EXIT=\$?
        set -e
        echo "=== Docker Build Output ==="
        cat /tmp/docker_build.log
        echo "=== End Docker Build Output (exit code: \$BUILD_EXIT) ==="
        if [ \$BUILD_EXIT -ne 0 ]; then
          exit \$BUILD_EXIT
        fi
      - |
        source /tmp/build_env.sh
        echo "Pushing \${IMAGE_URI}:\${SHORT_TAG}"
        docker push \${IMAGE_URI}:\${SHORT_TAG}
        docker push \${IMAGE_URI}:latest`;
}

export function commonPostBuild(): string {
  return `  post_build:
    commands:
      - |
        source /tmp/build_env.sh
        CALLBACK_URL="\${CALLBACK_URL:-}"
        BUILD_ID="\${BUILD_ID:-}"

        if [ "\${CODEBUILD_BUILD_SUCCEEDING:-1}" = "0" ]; then
          echo "Build FAILED"
          if [ -n "$CALLBACK_URL" ] && [ -n "$BUILD_ID" ]; then
            python3 << 'PYEOF'
        import json, os, urllib.request
        callback = os.environ.get('CALLBACK_URL', '')
        build_id = os.environ.get('BUILD_ID', '')
        if callback and build_id:
            data = json.dumps({'buildId': build_id, 'status': 'failed', 'statusReason': 'Docker build failed'}).encode()
            req = urllib.request.Request(callback, data=data, headers={'Content-Type': 'application/json'}, method='POST')
            try: urllib.request.urlopen(req, timeout=10)
            except: pass
        PYEOF
          fi
          exit 0
        fi

        printf '{"imageUri":"%s"}\\n' "\${IMAGE_URI}:\${SHORT_TAG}" > imageDetail.json
        cat imageDetail.json

        if [ -n "$CALLBACK_URL" ] && [ -n "$BUILD_ID" ]; then
          python3 << 'PYEOF'
        import json, os, urllib.request
        callback = os.environ.get('CALLBACK_URL', '')
        build_id = os.environ.get('BUILD_ID', '')
        image_uri = os.environ.get('IMAGE_URI', '')
        short_tag = os.environ.get('SHORT_TAG', 'latest')
        if callback and build_id:
            data = json.dumps({'buildId': build_id, 'status': 'success', 'imageUri': f'{image_uri}:{short_tag}'}).encode()
            req = urllib.request.Request(callback, data=data, headers={'Content-Type': 'application/json'}, method='POST')
            try: urllib.request.urlopen(req, timeout=10)
            except: pass
        PYEOF
        fi

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
        fi`;
}


export function staticBuildAndSync(): string {
  return `      - |
        set -euo pipefail
        # Ensure Node 20 is active (nvm resets between phases)
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20 2>/dev/null || true
        # Remove CodeBuild cache symlink that conflicts with pnpm
        if [ -L node_modules ]; then rm -f node_modules; fi
        echo "Building static site..."
        echo "Node: $(node --version), npm: $(npm --version)"
        # Detect package manager and build
        if [ -f pnpm-lock.yaml ]; then
          corepack enable && pnpm install --no-frozen-lockfile && pnpm run build
        elif [ -f yarn.lock ]; then
          corepack enable && yarn install && yarn build
        elif [ -f bun.lockb ]; then
          npm i -g bun && bun install && bun run build
        else
          npm ci || npm install
          npm run build
        fi
      - |
        set -euo pipefail
        echo "Determining build output directory..."
        # Find the build output (dist, build, .output/public, out)
        if [ -d ".output/public" ]; then BUILD_DIR=".output/public";
        elif [ -d "dist" ]; then BUILD_DIR="dist";
        elif [ -d "build" ]; then BUILD_DIR="build";
        elif [ -d "out" ]; then BUILD_DIR="out";
        elif [ -d "public" ]; then BUILD_DIR="public";
        else echo "ERROR: No build output directory found"; exit 1; fi
        echo "Build output: $BUILD_DIR"
        echo "$BUILD_DIR" > /tmp/build_dir.txt
      - |
        set -euo pipefail
        BUILD_DIR=$(cat /tmp/build_dir.txt)
        WEBSITE_BUCKET="\${DEPLOY_PARAMS_APP_NAME:-\${IMAGE_REPO_NAME}}-static-site"
        echo "Creating S3 bucket if needed..."
        aws s3api head-bucket --bucket "$WEBSITE_BUCKET" 2>/dev/null || aws s3 mb "s3://$WEBSITE_BUCKET" --region "\${AWS_DEFAULT_REGION}"
        echo "Syncing to s3://$WEBSITE_BUCKET..."
        aws s3 sync "$BUILD_DIR" "s3://$WEBSITE_BUCKET" --delete --cache-control "public, max-age=31536000, immutable" --exclude "*.html"
        aws s3 sync "$BUILD_DIR" "s3://$WEBSITE_BUCKET" --delete --cache-control "no-cache" --include "*.html"
        echo "Static site deployed to S3"`;
}

export function staticPostBuild(): string {
  return `  post_build:
    commands:
      - |
        CALLBACK_URL="\${CALLBACK_URL:-}"
        BUILD_ID="\${BUILD_ID:-}"

        if [ "\${CODEBUILD_BUILD_SUCCEEDING:-1}" = "0" ]; then
          echo "Build FAILED"
          if [ -n "$CALLBACK_URL" ] && [ -n "$BUILD_ID" ]; then
            python3 << 'PYEOF'
        import json, os, urllib.request
        callback = os.environ.get('CALLBACK_URL', '')
        build_id = os.environ.get('BUILD_ID', '')
        if callback and build_id:
            data = json.dumps({'buildId': build_id, 'status': 'failed', 'statusReason': 'Static build failed'}).encode()
            req = urllib.request.Request(callback, data=data, headers={'Content-Type': 'application/json'}, method='POST')
            try: urllib.request.urlopen(req, timeout=10)
            except: pass
        PYEOF
          fi
          exit 0
        fi

        printf '{"staticSite":true}\\n' > imageDetail.json

        if [ -n "\${SNS_TOPIC_ARN:-}" ] && [ -n "\${DEPLOY_TARGET:-}" ]; then
          python3 << 'PYEOF'
        import json, os, subprocess
        dp_raw = os.environ.get('DEPLOY_PARAMS', '{}')
        try: dp = json.loads(dp_raw)
        except: dp = {}
        msg = json.dumps({
            'buildId': os.environ.get('BUILD_ID', ''),
            'imageUri': '',
            's3Bucket': os.environ.get('S3_WEBSITE_BUCKET', ''),
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
        fi`;
}
