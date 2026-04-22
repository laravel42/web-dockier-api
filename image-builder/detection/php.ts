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
  imap: ["libc-client-dev", "libkrb5-dev"],
  ldap: ["libldap2-dev"],
  snmp: ["libsnmp-dev"],
  tidy: ["libtidy-dev"],
  xsl: ["libxslt1-dev"],
  bz2: ["libbz2-dev"],
  enchant: ["libenchant-2-dev"],
  gmp: ["libgmp-dev"],
  readline: ["libreadline-dev"],
};

/** Parse "major.minor" into [major, minor]; returns null on bad input */
function parseMajorMinor(phpVer: string): [number, number] | null {
  const [majStr, minStr] = phpVer.split(".");
  const maj = parseInt(majStr, 10);
  const min = parseInt(minStr, 10);
  if (isNaN(maj) || isNaN(min)) return null;
  return [maj, min];
}

/**
 * Map a PHP version to the correct Debian variant for the official Docker image.
 * - PHP 7.x  → bullseye (last Debian release with official 7.x images)
 * - PHP 8.0  → bullseye (bookworm images were never published for 8.0)
 * - PHP 8.1+ → bookworm
 */
function debianVariant(phpVer: string): string {
  const parsed = parseMajorMinor(phpVer);
  if (!parsed) return "bookworm";
  const [major, minor] = parsed;
  if (major < 8 || (major === 8 && minor < 1)) return "bullseye";
  return "bookworm";
}

/**
 * Pick the right Composer Docker image tag.
 * Composer 2.8+ requires PHP ≥ 8.1 at runtime, so older PHP versions
 * must use the 2.2 LTS line which supports PHP ≥ 7.2.
 */
function composerImageTag(phpVer: string): string {
  const parsed = parseMajorMinor(phpVer);
  if (!parsed) return "2";
  const [major, minor] = parsed;
  if (major < 8 || (major === 8 && minor < 1)) return "2.2";
  return "2";
}

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

  // Check composer.lock for the actual minimum PHP version required by locked packages.
  // The lock file may contain packages that need a higher PHP version than composer.json declares
  // (e.g. composer.json says ^8.0 but locked deps require ^8.1).
  try {
    const lockPath = join(appDir, "composer.lock");
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
      let highest = parseMajorMinor(phpVer);
      for (const pkg of [...(lock.packages || []), ...(lock["packages-dev"] || [])]) {
        const phpReq = pkg?.require?.["php"];
        if (typeof phpReq !== "string") continue;
        // Only extract lower-bound versions from constraints like ^8.1, >=8.1, ~8.1
        // Skip upper-bound markers like <9.0, !=8.2, etc.
        const lowerBounds = phpReq.matchAll(/(?:[\^~>=]*\s*)(\d+)\.(\d+)/g);
        for (const m of lowerBounds) {
          const maj = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          if (isNaN(maj) || isNaN(min)) continue;
          // Skip if this looks like an upper bound (preceded by < or !)
          const prefix = phpReq.slice(0, m.index).trim();
          if (prefix.endsWith("<") || prefix.endsWith("!") || prefix.endsWith("!=")) continue;
          if (!highest || maj > highest[0] || (maj === highest[0] && min > highest[1])) {
            highest = [maj, min];
          }
        }
      }
      if (highest) {
        // Cap to the latest released PHP major.minor to avoid picking up future versions
        const maxReleased: [number, number] = [8, 4];
        if (highest[0] > maxReleased[0] || (highest[0] === maxReleased[0] && highest[1] > maxReleased[1])) {
          highest = maxReleased;
        }
        phpVer = `${highest[0]}.${highest[1]}`;
      }
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

    const variant = debianVariant(phpVer);
    lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-fpm-${variant} AS base`);
    // For older Debian variants whose repos may have expired Release files, disable date checks
    if (variant === "bullseye" || variant === "buster") {
      lines.push('RUN echo "Acquire::Check-Valid-Until false;" > /etc/apt/apt.conf.d/99no-check-valid-until');
    }
    // Install system packages
    lines.push(`RUN apt-get update && apt-get install -y \\`);
    lines.push(`    ${[...aptPkgs].sort().join(" ")} \\`);
    lines.push("    && apt-get clean && rm -rf /var/lib/apt/lists/*");

    // Configure and install PHP extensions
    const configCmds: string[] = [];
    if (installable.includes("gd")) {
      configCmds.push("docker-php-ext-configure gd --with-freetype --with-jpeg");
    }
    if (installable.includes("imap")) {
      configCmds.push("docker-php-ext-configure imap --with-kerberos --with-imap-ssl");
    }
    if (installable.length > 0) {
      configCmds.push(`docker-php-ext-install ${installable.sort().join(" ")}`);
    }
    if (configCmds.length > 0) {
      lines.push(`RUN ${configCmds.join(" \\\n    && ")}`);
    }

    // Install PECL extensions
    if (pecl.length > 0) {
      const peclCmds = pecl.map(ext => `pecl install ${ext} && docker-php-ext-enable ${ext}`);
      lines.push(`RUN ${peclCmds.join(" \\\n    && ")}`);
    }

    const composerTag = composerImageTag(phpVer);
    lines.push(`COPY --from=public.ecr.aws/docker/library/composer:${composerTag} /usr/bin/composer /usr/bin/composer`);
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
    lines.push("    && mkdir -p storage/framework/{sessions,views,cache} storage/logs bootstrap/cache \\");
    lines.push("    && chown -R www-data:www-data storage bootstrap/cache \\");
    lines.push("    && chmod -R 775 storage bootstrap/cache");
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

    const variant = debianVariant(phpVer);
    lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-cli-${variant}`);
    if (variant === "bullseye" || variant === "buster") {
      lines.push('RUN echo "Acquire::Check-Valid-Until false;" > /etc/apt/apt.conf.d/99no-check-valid-until');
    }
    lines.push(`RUN apt-get update && apt-get install -y ${[...aptPkgs].sort().join(" ")} \\`);
    lines.push("    && apt-get clean && rm -rf /var/lib/apt/lists/*");

    const configCmds: string[] = [];
    if (installable.includes("gd")) {
      configCmds.push("docker-php-ext-configure gd --with-freetype --with-jpeg");
    }
    if (installable.includes("imap")) {
      configCmds.push("docker-php-ext-configure imap --with-kerberos --with-imap-ssl");
    }
    if (installable.length > 0) {
      configCmds.push(`docker-php-ext-install ${installable.sort().join(" ")}`);
    }
    if (configCmds.length > 0) {
      lines.push(`RUN ${configCmds.join(" \\\n    && ")}`);
    }
    if (pecl.length > 0) {
      const peclCmds = pecl.map(ext => `pecl install ${ext} && docker-php-ext-enable ${ext}`);
      lines.push(`RUN ${peclCmds.join(" \\\n    && ")}`);
    }
    const composerTag = composerImageTag(phpVer);
    lines.push(`COPY --from=public.ecr.aws/docker/library/composer:${composerTag} /usr/bin/composer /usr/bin/composer`);
    lines.push("WORKDIR /app");
    lines.push("COPY composer.json composer.lock* ./");
    lines.push("RUN composer install --no-dev --prefer-dist");
    lines.push("COPY . .");
    lines.push("EXPOSE 8000");
    lines.push('CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]');
  }

  return lines.join("\n") + "\n";
}
