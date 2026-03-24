// ─── Per-Stack Buildspec Generators ───
// Each function returns a CodeBuild buildspec.yml tailored to a specific tech stack.
// The buildspec assumes the Dockerfile is already present in the source (injected at bundle time).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Stack Detection ───

export type DetectedStack =
  | { runtime: "node"; framework: "nextjs" | "nuxt" | "generic"; packageManager: "npm" | "pnpm" | "yarn" | "bun"; hasStandalone: boolean; isStatic: boolean; subDir: string }
  | { runtime: "php"; framework: "laravel" | "generic"; hasNodeAssets: boolean; subDir: string }
  | { runtime: "python"; framework: "django" | "fastapi" | "flask" | "generic"; subDir: string }
  | { runtime: "go"; subDir: string }
  | { runtime: "unknown"; subDir: string };

export function detectStack(repoDir: string): DetectedStack {
  const subDir = detectSubDir(repoDir);
  const appDir = subDir ? join(repoDir, subDir) : repoDir;

  // PHP
  if (existsSync(join(appDir, "composer.json"))) {
    let isLaravel = false;
    try {
      const composer = JSON.parse(readFileSync(join(appDir, "composer.json"), "utf-8"));
      isLaravel = !!composer.require?.["laravel/framework"];
    } catch {}
    const hasNodeAssets = existsSync(join(appDir, "package.json"));
    return { runtime: "php", framework: isLaravel ? "laravel" : "generic", hasNodeAssets, subDir };
  }

  // Node.js
  if (existsSync(join(appDir, "package.json"))) {
    let framework: "nextjs" | "nuxt" | "generic" = "generic";
    let hasStandalone = false;
    let isStatic = false;
    try {
      const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps["next"]) {
        framework = "nextjs";
        for (const cfg of ["next.config.ts", "next.config.mjs", "next.config.js"]) {
          const cfgPath = join(appDir, cfg);
          if (existsSync(cfgPath)) {
            try { hasStandalone = readFileSync(cfgPath, "utf-8").includes("standalone"); } catch {}
            break;
          }
        }
      } else if (allDeps["nuxt"]) {
        framework = "nuxt";
        for (const cfg of ["nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.js"]) {
          const cfgPath = join(appDir, cfg);
          if (existsSync(cfgPath)) {
            try {
              const content = readFileSync(cfgPath, "utf-8");
              if (/nitro\s*:\s*\{[^}]*preset\s*:\s*['"]static['"]/.test(content)
                || /ssr\s*:\s*false/.test(content)
                || /preset\s*:\s*['"]static['"]/.test(content)) {
                isStatic = true;
              }
            } catch {}
            break;
          }
        }
      }
    } catch {}
    const pm = detectNodePM(appDir, repoDir);
    return { runtime: "node", framework, packageManager: pm, hasStandalone, isStatic, subDir };
  }

  // Python
  if (existsSync(join(appDir, "requirements.txt")) || existsSync(join(appDir, "pyproject.toml")) || existsSync(join(appDir, "Pipfile"))) {
    let framework: "django" | "fastapi" | "flask" | "generic" = "generic";
    for (const file of ["requirements.txt", "pyproject.toml", "Pipfile"]) {
      const p = join(appDir, file);
      if (!existsSync(p)) continue;
      try {
        const content = readFileSync(p, "utf-8").toLowerCase();
        if (content.includes("django")) { framework = "django"; break; }
        if (content.includes("fastapi")) { framework = "fastapi"; break; }
        if (content.includes("flask")) { framework = "flask"; break; }
      } catch {}
    }
    return { runtime: "python", framework, subDir };
  }

  // Go
  if (existsSync(join(appDir, "go.mod"))) {
    return { runtime: "go", subDir };
  }

  return { runtime: "unknown", subDir };
}

function detectNodePM(appDir: string, repoDir: string): "npm" | "pnpm" | "yarn" | "bun" {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
    if (pkg.packageManager) {
      const pm = pkg.packageManager.split("@")[0];
      if (pm === "pnpm" || pm === "yarn" || pm === "bun") return pm;
    }
  } catch {}
  if (existsSync(join(appDir, "pnpm-lock.yaml")) || existsSync(join(repoDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(appDir, "yarn.lock")) || existsSync(join(repoDir, "yarn.lock"))) return "yarn";
  if (existsSync(join(appDir, "bun.lockb"))) return "bun";
  return "npm";
}

function detectSubDir(repoDir: string): string {
  const rootFiles = readdirSync(repoDir);
  const frameworkConfigs = ["next.config.js", "next.config.ts", "next.config.mjs", "nuxt.config.ts", "vite.config.ts", "angular.json", "remix.config.js", "astro.config.mjs"];
  if (frameworkConfigs.some(f => rootFiles.includes(f))) return "";
  if (rootFiles.includes("package.json") || rootFiles.includes("composer.json") || rootFiles.includes("go.mod") || rootFiles.includes("requirements.txt")) {
    try {
      const pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf-8"));
      if (pkg.scripts?.build || pkg.scripts?.start) return "";
    } catch {}
    if (rootFiles.includes("composer.json") || rootFiles.includes("go.mod") || rootFiles.includes("requirements.txt")) return "";
  }
  const subdirs = ["app", "frontend", "web", "client", "packages/app", "packages/web", "apps/web", "apps/frontend", "src"];
  for (const sub of subdirs) {
    const subPath = join(repoDir, sub);
    if (existsSync(subPath) && (existsSync(join(subPath, "package.json")) || existsSync(join(subPath, "composer.json")))) {
      return sub;
    }
  }
  return "";
}

// ─── Dockerfile Generators ───
// Lightweight versions that produce a Dockerfile string to inject into the zip.
// These mirror deploy/repo-analyzer.ts logic but are self-contained for image-builder.

export function generateDockerfile(stack: DetectedStack, repoDir: string): string {
  switch (stack.runtime) {
    case "node": return nodeDockerfile(stack, repoDir);
    case "php": return phpDockerfile(stack, repoDir);
    case "python": return pythonDockerfile(stack);
    case "go": return goDockerfile(repoDir);
    default: return "";
  }
}

function nodeDockerfile(stack: Extract<DetectedStack, { runtime: "node" }>, repoDir: string): string {
  const appDir = stack.subDir ? join(repoDir, stack.subDir) : repoDir;
  let nodeVer = "20";
  for (const f of [".nvmrc", ".node-version"]) {
    try {
      const v = readFileSync(join(appDir, f), "utf-8").trim().replace(/^v/, "");
      if (/^\d+/.test(v)) { nodeVer = v.split(".")[0]; break; }
    } catch {}
  }
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
    if (pkg.engines?.node) {
      const m = pkg.engines.node.match(/(\d+)/);
      if (m) nodeVer = m[1];
    }
  } catch {}

  const pm = stack.packageManager;
  const copyPrefix = stack.subDir ? `${stack.subDir}/` : "";
  const lines: string[] = [];

  // Builder
  lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim AS builder`);
  lines.push("WORKDIR /app");
  if (pm === "pnpm") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}pnpm-lock.yaml* ./`);
    lines.push("RUN corepack enable && pnpm install --no-frozen-lockfile");
  } else if (pm === "yarn") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}yarn.lock* ./`);
    lines.push("RUN corepack enable && yarn install --immutable || yarn install");
  } else if (pm === "bun") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}bun.lockb* ./`);
    lines.push("RUN npm i -g bun && bun install");
  } else {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}package-lock.json* ./`);
    lines.push("RUN npm ci || npm install");
  }
  lines.push(`COPY ${copyPrefix}. .`);
  lines.push(`RUN ${pm === "npm" ? "npm run" : pm} build`);

  // Production
  lines.push("");
  lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim`);
  lines.push("WORKDIR /app");

  if (stack.framework === "nextjs" && stack.hasStandalone) {
    lines.push("COPY --from=builder /app/.next/standalone ./");
    lines.push("COPY --from=builder /app/.next/static ./.next/static");
    lines.push("COPY --from=builder /app/public ./public");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", "server.js"]');
  } else if (stack.framework === "nextjs") {
    lines.push("COPY --from=builder /app/node_modules ./node_modules");
    lines.push("COPY --from=builder /app/.next ./.next");
    lines.push("COPY --from=builder /app/public ./public");
    lines.push("COPY --from=builder /app/package.json ./");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node_modules/.bin/next", "start"]');
  } else if (stack.framework === "nuxt" && stack.isStatic) {
    // Nuxt static site — serve pre-rendered files with a minimal server
    lines.push("FROM public.ecr.aws/docker/library/node:" + nodeVer + "-slim");
    lines.push("WORKDIR /app");
    lines.push("RUN npm i -g serve");
    lines.push("COPY --from=builder /app/.output/public ./public");
    lines.push("ENV PORT=3000");
    lines.push("EXPOSE 3000");
    lines.push('CMD ["serve", "public", "-l", "3000", "-s"]');
  } else if (stack.framework === "nuxt") {
    // Nuxt SSR — self-contained Nitro server
    lines.push("COPY --from=builder /app/.output ./.output");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", ".output/server/index.mjs"]');
  } else {
    lines.push("COPY --from=builder /app .");
    if (pm === "pnpm" || pm === "yarn") {
      lines.push("RUN corepack enable");
    }
    lines.push("ENV PORT=3000");
    lines.push("EXPOSE 3000");
    lines.push(`CMD ["${pm === "npm" ? "npm" : pm}", "start"]`);
  }

  return lines.join("\n") + "\n";
}

function phpDockerfile(stack: Extract<DetectedStack, { runtime: "php" }>, repoDir: string): string {
  const appDir = stack.subDir ? join(repoDir, stack.subDir) : repoDir;
  let phpVer = "8.3";
  try {
    const composer = JSON.parse(readFileSync(join(appDir, "composer.json"), "utf-8"));
    const req = composer?.require?.["php"];
    if (typeof req === "string") {
      const m = req.match(/(\d+\.\d+)/);
      if (m) phpVer = m[1];
    }
  } catch {}

  const lines: string[] = [];

  if (stack.framework === "laravel") {
    // Multi-stage Laravel build
    lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-fpm-bookworm AS base`);
    lines.push("RUN apt-get update && apt-get install -y \\");
    lines.push("    git unzip curl libpng-dev libjpeg-dev libfreetype6-dev \\");
    lines.push("    libzip-dev libonig-dev libxml2-dev libpq-dev nginx supervisor \\");
    lines.push("    && docker-php-ext-configure gd --with-freetype --with-jpeg \\");
    lines.push("    && docker-php-ext-install pdo pdo_mysql pdo_pgsql mbstring xml zip gd bcmath opcache pcntl \\");
    lines.push("    && pecl install redis && docker-php-ext-enable redis \\");
    lines.push("    && apt-get clean && rm -rf /var/lib/apt/lists/*");
    lines.push("COPY --from=public.ecr.aws/docker/library/composer:2 /usr/bin/composer /usr/bin/composer");
    lines.push("WORKDIR /var/www/html");
    lines.push("");
    lines.push("FROM base AS deps");
    lines.push("COPY composer.json composer.lock* ./");
    lines.push("RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist");

    if (stack.hasNodeAssets) {
      lines.push("");
      lines.push("FROM public.ecr.aws/docker/library/node:20-slim AS frontend");
      lines.push("WORKDIR /app");
      lines.push("COPY package*.json yarn.lock* pnpm-lock.yaml* bun.lockb* ./");
      lines.push('RUN if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --no-frozen-lockfile; \\');
      lines.push('    elif [ -f yarn.lock ]; then corepack enable && yarn install --immutable || yarn install; \\');
      lines.push("    else npm ci || npm install; fi");
      lines.push("COPY . .");
      lines.push('RUN if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm run build; \\');
      lines.push('    elif [ -f yarn.lock ]; then yarn build; \\');
      lines.push("    else npm run build; fi");
    }

    lines.push("");
    lines.push("FROM base AS runner");
    lines.push("COPY . .");
    lines.push("COPY --from=deps /var/www/html/vendor ./vendor");
    if (stack.hasNodeAssets) {
      lines.push("COPY --from=frontend /app/public/build ./public/build");
    }
    lines.push("RUN composer dump-autoload --optimize \\");
    lines.push('    && if [ ! -f .env ]; then cp .env.example .env 2>/dev/null || touch .env; fi \\');
    lines.push("    && php artisan key:generate --force 2>/dev/null || true \\");
    lines.push("    && php artisan config:clear 2>/dev/null || true \\");
    lines.push("    && php artisan route:clear 2>/dev/null || true \\");
    lines.push("    && php artisan view:clear 2>/dev/null || true \\");
    lines.push("    && chown -R www-data:www-data storage bootstrap/cache");
    lines.push("");
    lines.push("# Nginx + Supervisor");
    lines.push(`RUN echo 'server { listen 80; server_name _; root /var/www/html/public; index index.php; client_max_body_size 100M; location / { try_files \\$uri \\$uri/ /index.php?\\$query_string; } location ~ \\.php$ { fastcgi_pass 127.0.0.1:9000; fastcgi_param SCRIPT_FILENAME \\$realpath_root\\$fastcgi_script_name; include fastcgi_params; } location ~ /\\.(?!well-known).* { deny all; } }' > /etc/nginx/sites-available/default`);
    lines.push(`RUN echo '[supervisord]\\nnodaemon=true\\n[program:php-fpm]\\ncommand=php-fpm -F\\nautostart=true\\nautorestart=true\\n[program:nginx]\\ncommand=nginx -g "daemon off;"\\nautostart=true\\nautorestart=true' > /etc/supervisor/conf.d/app.conf`);
    lines.push("EXPOSE 80");
    lines.push('CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/app.conf"]');
  } else {
    // Generic PHP
    lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-cli-bookworm`);
    lines.push("RUN apt-get update && apt-get install -y git unzip libzip-dev \\");
    lines.push("    && docker-php-ext-install zip pdo pdo_mysql \\");
    lines.push("    && apt-get clean && rm -rf /var/lib/apt/lists/*");
    lines.push("COPY --from=public.ecr.aws/docker/library/composer:2 /usr/bin/composer /usr/bin/composer");
    lines.push("WORKDIR /app");
    lines.push("COPY composer.json composer.lock* ./");
    lines.push("RUN composer install --no-dev --prefer-dist");
    lines.push("COPY . .");
    lines.push("EXPOSE 8000");
    lines.push('CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]');
  }

  return lines.join("\n") + "\n";
}

function pythonDockerfile(stack: Extract<DetectedStack, { runtime: "python" }>): string {
  const lines: string[] = [];
  lines.push("FROM public.ecr.aws/docker/library/python:3.12-slim");
  lines.push("WORKDIR /app");
  lines.push("RUN pip install --no-cache-dir --upgrade pip");
  lines.push("COPY requirements.txt* pyproject.toml* Pipfile* ./");
  lines.push('RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; elif [ -f Pipfile ]; then pip install pipenv && pipenv install --system --deploy; fi');
  lines.push("COPY . .");
  lines.push("ENV PORT=8000");
  lines.push("EXPOSE 8000");

  if (stack.framework === "django") {
    lines.push('CMD ["gunicorn", "--bind", "0.0.0.0:8000", "config.wsgi:application"]');
  } else if (stack.framework === "fastapi") {
    lines.push('CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]');
  } else if (stack.framework === "flask") {
    lines.push('CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]');
  } else {
    lines.push('CMD ["python", "main.py"]');
  }

  return lines.join("\n") + "\n";
}

function goDockerfile(repoDir: string): string {
  let goVer = "1.22";
  try {
    const goMod = readFileSync(join(repoDir, "go.mod"), "utf-8");
    const m = goMod.match(/^go\s+(\d+\.\d+)/m);
    if (m) goVer = m[1];
  } catch {}

  return [
    `FROM public.ecr.aws/docker/library/golang:${goVer}-alpine AS builder`,
    "WORKDIR /app",
    "COPY go.mod go.sum* ./",
    "RUN go mod download",
    "COPY . .",
    "RUN CGO_ENABLED=0 go build -o app .",
    "",
    "FROM public.ecr.aws/docker/library/alpine:3.19",
    "RUN apk --no-cache add ca-certificates",
    "WORKDIR /app",
    "COPY --from=builder /app/app .",
    "ENV PORT=8080",
    "EXPOSE 8080",
    'CMD ["./app"]',
    "",
  ].join("\n");
}

// ─── Buildspec Generators ───
// Each returns a CodeBuild buildspec.yml string. The Dockerfile is already in the source.

const COMMON_INSTALL = `  install:
    commands:
      - set -euo pipefail`;

function commonPreBuild(): string {
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

function buildAndPush(): string {
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

function commonPostBuild(): string {
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

const COMMON_FOOTER = `
artifacts:
  files:
    - imageDetail.json

cache:
  paths:
    - '/root/.cache/**/*'`;

export function generateBuildspec(stack: DetectedStack): string {
  const header = `version: 0.2

env:
  shell: bash
  variables:
    AWS_ACCOUNT_ID: "123456789012"
    AWS_DEFAULT_REGION: "us-east-1"
    IMAGE_REPO_NAME: "my-app"
    CACHE_REPO_NAME: "my-app-cache"

phases:
`;

  let buildPhase: string;

  switch (stack.runtime) {
    case "node":
      buildPhase = nodeBuildPhase(stack);
      break;
    case "php":
      buildPhase = phpBuildPhase(stack);
      break;
    case "python":
      buildPhase = pythonBuildPhase(stack);
      break;
    case "go":
      buildPhase = goBuildPhase();
      break;
    default:
      buildPhase = fallbackBuildPhase();
      break;
  }

  return [
    header.trimEnd(),
    COMMON_INSTALL,
    "",
    commonPreBuild(),
    "",
    buildPhase,
    "",
    commonPostBuild(),
    COMMON_FOOTER,
  ].join("\n");
}

// ─── Per-Stack Build Phases ───
// These only contain the `build:` phase. The Dockerfile is already present.

function nodeBuildPhase(stack: Extract<DetectedStack, { runtime: "node" }>): string {
  return `  build:
    commands:
      - echo "Building Node.js (${stack.framework}) with ${stack.packageManager}"
${buildAndPush()}`;
}

function phpBuildPhase(stack: Extract<DetectedStack, { runtime: "php" }>): string {
  return `  build:
    commands:
      - echo "Building PHP (${stack.framework})${stack.hasNodeAssets ? " with frontend assets" : ""}"
${buildAndPush()}`;
}

function pythonBuildPhase(stack: Extract<DetectedStack, { runtime: "python" }>): string {
  return `  build:
    commands:
      - echo "Building Python (${stack.framework})"
${buildAndPush()}`;
}

function goBuildPhase(): string {
  return `  build:
    commands:
      - echo "Building Go"
${buildAndPush()}`;
}

function fallbackBuildPhase(): string {
  return `  build:
    commands:
      - echo "Unknown stack — building with Dockerfile"
${buildAndPush()}`;
}
