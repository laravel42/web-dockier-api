// ─── PHP Stack Detection & Dockerfile Generator ───

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DetectedStack } from "./types";

export function detectPhp(appDir: string, subDir: string): Extract<DetectedStack, { runtime: "php" }> | null {
  if (!existsSync(join(appDir, "composer.json"))) return null;

  let isLaravel = false;
  try {
    const composer = JSON.parse(readFileSync(join(appDir, "composer.json"), "utf-8"));
    isLaravel = !!composer.require?.["laravel/framework"];
  } catch {}
  const hasNodeAssets = existsSync(join(appDir, "package.json"));
  return { runtime: "php", framework: isLaravel ? "laravel" : "generic", hasNodeAssets, subDir };
}

// Extensions already compiled into the official PHP Docker images — no need to install these
const BUILTIN_EXTS = new Set([
  "ctype", "curl", "date", "dom", "fileinfo", "filter", "ftp", "hash",
  "iconv", "json", "libxml", "mbstring", "mysqlnd", "openssl", "pcre",
  "pdo", "phar", "posix", "readline", "reflection", "session", "simplexml",
  "sodium", "spl", "standard", "tokenizer", "xml", "xmlreader", "xmlwriter", "zlib",
]);

// Extensions that need pecl install instead of docker-php-ext-install
const PECL_EXTS = new Set(["redis", "imagick", "xdebug", "apcu", "memcached", "swoole", "mongodb"]);

// Map extensions to the apt packages they need at build time
const EXT_APT_DEPS: Record<string, string[]> = {
  gd: ["libpng-dev", "libjpeg-dev", "libfreetype6-dev"],
  intl: ["libicu-dev"],
  zip: ["libzip-dev"],
  pgsql: ["libpq-dev"],
  pdo_pgsql: ["libpq-dev"],
  pdo_mysql: [],
  soap: ["libxml2-dev"],
  xmlrpc: ["libxml2-dev"],
  imagick: ["libmagickwand-dev"],
  mbstring: ["libonig-dev"],
  xml: ["libxml2-dev"],
};

/** Scan composer.json (require + require-dev ext-* keys) to find required PHP extensions */
function detectRequiredExtensions(appDir: string): Set<string> {
  const extensions = new Set<string>();
  try {
    const composer = JSON.parse(readFileSync(join(appDir, "composer.json"), "utf-8"));
    for (const section of [composer.require, composer["require-dev"]]) {
      if (!section) continue;
      for (const key of Object.keys(section)) {
        if (key.startsWith("ext-")) {
          extensions.add(key.slice(4));
        }
      }
    }
    // Also scan composer.lock platform requirements for transitive ext dependencies
    try {
      const lockPath = join(appDir, "composer.lock");
      if (existsSync(lockPath)) {
        const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
        for (const pkg of [...(lock.packages || []), ...(lock["packages-dev"] || [])]) {
          if (!pkg.require) continue;
          for (const key of Object.keys(pkg.require)) {
            if (key.startsWith("ext-")) {
              extensions.add(key.slice(4));
            }
          }
        }
      }
    } catch {}
  } catch {}
  return extensions;
}

export function phpDockerfile(stack: Extract<DetectedStack, { runtime: "php" }>, repoDir: string): string {
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
    // Detect all required extensions from composer.json + composer.lock
    const requiredExts = detectRequiredExtensions(appDir);
    // Always include common Laravel extensions
    for (const ext of ["pdo", "pdo_mysql", "pdo_pgsql", "mbstring", "xml", "zip", "gd", "bcmath", "opcache", "pcntl"]) {
      requiredExts.add(ext);
    }

    // Separate into installable vs pecl vs builtin
    const installable = [...requiredExts].filter(e => !BUILTIN_EXTS.has(e) && !PECL_EXTS.has(e));
    const pecl = [...requiredExts].filter(e => PECL_EXTS.has(e));
    // Always include redis via pecl for Laravel
    if (!pecl.includes("redis")) pecl.push("redis");

    // Collect all apt dependencies
    const aptPkgs = new Set(["git", "unzip", "curl", "nginx", "supervisor"]);
    for (const ext of [...installable, ...pecl]) {
      for (const pkg of (EXT_APT_DEPS[ext] || [])) aptPkgs.add(pkg);
    }

    lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-fpm-bookworm AS base`);
    lines.push(`RUN apt-get update && apt-get install -y \\`);
    lines.push(`    ${[...aptPkgs].sort().join(" ")} \\`);

    // Configure extensions that need it (gd, intl don't need special config besides gd)
    if (installable.includes("gd")) {
      lines.push("    && docker-php-ext-configure gd --with-freetype --with-jpeg \\");
    }
    if (installable.length > 0) {
      lines.push(`    && docker-php-ext-install ${installable.sort().join(" ")} \\`);
    }
    for (const ext of pecl) {
      lines.push(`    && pecl install ${ext} && docker-php-ext-enable ${ext} \\`);
    }
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
      lines.push("# Build frontend assets — create output dir so COPY never fails even if build is skipped");
      lines.push("RUN mkdir -p public/build && \\");
      lines.push('    (if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm run build; \\');
      lines.push('    elif [ -f yarn.lock ]; then yarn build; \\');
      lines.push("    else npm run build; fi)");
    }

    lines.push("");
    lines.push("FROM base AS runner");
    lines.push("COPY . .");
    lines.push("COPY --from=deps /var/www/html/vendor ./vendor");
    if (stack.hasNodeAssets) {
      lines.push("COPY --from=frontend /app/public ./public");
    }
    lines.push("RUN composer dump-autoload --optimize \\");
    lines.push('    && if [ ! -f .env ]; then cp .env.example .env 2>/dev/null || touch .env; fi \\');
    lines.push("    && php artisan key:generate --force 2>/dev/null || true \\");
    lines.push("    && php artisan config:clear 2>/dev/null || true \\");
    lines.push("    && php artisan route:clear 2>/dev/null || true \\");
    lines.push("    && php artisan view:clear 2>/dev/null || true \\");
    lines.push("    && chown -R www-data:www-data storage bootstrap/cache");
    lines.push("");
    lines.push("# Nginx config");
    lines.push("RUN cat > /etc/nginx/sites-available/default <<'NGINXCONF'\nserver {\n  listen 80;\n  server_name _;\n  root /var/www/html/public;\n  index index.php;\n  client_max_body_size 100M;\n  location / { try_files $uri $uri/ /index.php?$query_string; }\n  location ~ \\.php$ { fastcgi_pass 127.0.0.1:9000; fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name; include fastcgi_params; }\n  location ~ /\\.(?!well-known).* { deny all; }\n}\nNGINXCONF");
    lines.push("# Supervisor config");
    lines.push(`RUN echo '[supervisord]\\nnodaemon=true\\n[program:php-fpm]\\ncommand=php-fpm -F\\nautostart=true\\nautorestart=true\\n[program:nginx]\\ncommand=nginx -g "daemon off;"\\nautostart=true\\nautorestart=true' > /etc/supervisor/conf.d/app.conf`);
    lines.push("EXPOSE 80");
    lines.push('CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/app.conf"]');
  } else {
    // Generic PHP — also detect extensions
    const requiredExts = detectRequiredExtensions(appDir);
    for (const ext of ["zip", "pdo", "pdo_mysql"]) requiredExts.add(ext);

    const installable = [...requiredExts].filter(e => !BUILTIN_EXTS.has(e) && !PECL_EXTS.has(e));
    const pecl = [...requiredExts].filter(e => PECL_EXTS.has(e));

    const aptPkgs = new Set(["git", "unzip"]);
    for (const ext of [...installable, ...pecl]) {
      for (const pkg of (EXT_APT_DEPS[ext] || [])) aptPkgs.add(pkg);
    }

    lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-cli-bookworm`);
    lines.push(`RUN apt-get update && apt-get install -y ${[...aptPkgs].sort().join(" ")} \\`);
    if (installable.includes("gd")) {
      lines.push("    && docker-php-ext-configure gd --with-freetype --with-jpeg \\");
    }
    if (installable.length > 0) {
      lines.push(`    && docker-php-ext-install ${installable.sort().join(" ")} \\`);
    }
    for (const ext of pecl) {
      lines.push(`    && pecl install ${ext} && docker-php-ext-enable ${ext} \\`);
    }
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
