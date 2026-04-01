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
