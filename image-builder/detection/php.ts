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
    lines.push("# Nginx config");
    lines.push("RUN cat > /etc/nginx/sites-available/default <<'NGINXCONF'\nserver {\n  listen 80;\n  server_name _;\n  root /var/www/html/public;\n  index index.php;\n  client_max_body_size 100M;\n  location / { try_files $uri $uri/ /index.php?$query_string; }\n  location ~ \\.php$ { fastcgi_pass 127.0.0.1:9000; fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name; include fastcgi_params; }\n  location ~ /\\.(?!well-known).* { deny all; }\n}\nNGINXCONF");
    lines.push("# Supervisor config");
    lines.push(`RUN echo '[supervisord]\\nnodaemon=true\\n[program:php-fpm]\\ncommand=php-fpm -F\\nautostart=true\\nautorestart=true\\n[program:nginx]\\ncommand=nginx -g "daemon off;"\\nautostart=true\\nautorestart=true' > /etc/supervisor/conf.d/app.conf`);
    lines.push("EXPOSE 80");
    lines.push('CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/app.conf"]');
  } else {
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
