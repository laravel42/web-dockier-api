import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "../types";

// ─── Constants ───

/** Extensions already compiled into the official PHP Docker images — no need to install */
const BUILTIN_EXTS = new Set([
  "ctype", "curl", "date", "dom", "fileinfo", "filter", "ftp", "hash",
  "iconv", "json", "libxml", "mbstring", "mysqlnd", "openssl", "pcre",
  "pdo", "phar", "posix", "readline", "reflection", "session", "simplexml",
  "sodium", "spl", "standard", "tokenizer", "xml", "xmlreader", "xmlwriter", "zlib",
]);

/** Extensions that always need pecl install instead of docker-php-ext-install */
const PECL_EXTS = new Set(["redis", "imagick", "xdebug", "apcu", "memcached", "swoole", "mongodb"]);

/** Extensions removed from PHP core in specific versions — must use PECL on those versions */
const PECL_SINCE: Record<string, [number, number]> = {
  imap: [8, 4], // removed from core in PHP 8.4
};

/** Map extensions to the apt packages they need at build time */
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

// ─── Helpers ───

/** Parse "major.minor" into [major, minor]; returns null on bad input */
export function parseMajorMinor(phpVer: string): [number, number] | null {
  const [majStr, minStr] = phpVer.split(".");
  const maj = parseInt(majStr, 10);
  const min = parseInt(minStr, 10);
  if (isNaN(maj) || isNaN(min)) return null;
  return [maj, min];
}

/** Check if an extension needs PECL install for the given PHP version */
export function isPeclExt(ext: string, phpVer: string): boolean {
  if (PECL_EXTS.has(ext)) return true;
  const since = PECL_SINCE[ext];
  if (!since) return false;
  const parsed = parseMajorMinor(phpVer);
  if (!parsed) return false;
  return parsed[0] > since[0] || (parsed[0] === since[0] && parsed[1] >= since[1]);
}

/**
 * Map a PHP version to the correct Debian variant for the official Docker image.
 * - PHP 7.x  → bullseye (last Debian release with official 7.x images)
 * - PHP 8.0  → bullseye (bookworm images were never published for 8.0)
 * - PHP 8.1+ → bookworm
 */
export function debianVariant(phpVer: string): string {
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
export function composerImageTag(phpVer: string): string {
  const parsed = parseMajorMinor(phpVer);
  if (!parsed) return "2";
  const [major, minor] = parsed;
  if (major < 8 || (major === 8 && minor < 1)) return "2.2";
  return "2";
}

/**
 * Scan composer.json and composer.lock for required PHP extensions.
 * Reads ext-* keys from require + require-dev in composer.json,
 * and transitive ext-* dependencies from composer.lock packages.
 */
export function detectRequiredExtensions(appDir: string): Set<string> {
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

/**
 * Resolve the PHP version from composer.json and composer.lock.
 * Uses the same logic as the image-builder: reads the php constraint from
 * composer.json, then checks composer.lock for the highest minimum PHP
 * version required by any locked package.
 */
function resolvePhpVersion(appDir: string, fallback: string): string {
  let phpVer = fallback;

  try {
    const composer = JSON.parse(readFileSync(join(appDir, "composer.json"), "utf-8"));
    const req = composer?.require?.["php"];
    if (typeof req === "string") {
      const m = req.match(/(\d+\.\d+)/);
      if (m) phpVer = m[1];
    }
  } catch {}

  // Check composer.lock for the actual minimum PHP version required by locked packages
  try {
    const lockPath = join(appDir, "composer.lock");
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
      let highest = parseMajorMinor(phpVer);
      for (const pkg of [...(lock.packages || []), ...(lock["packages-dev"] || [])]) {
        const phpReq = pkg?.require?.["php"];
        if (typeof phpReq !== "string") continue;
        let pkgMin: [number, number] | null = null;
        const bounds = phpReq.matchAll(/(\d+)\.(\d+)/g);
        for (const m of bounds) {
          const maj = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          if (isNaN(maj) || isNaN(min)) continue;
          const prefix = phpReq.slice(0, m.index).trim();
          if (prefix.endsWith("<") || prefix.endsWith("!") || prefix.endsWith("!=")) continue;
          if (!pkgMin || maj < pkgMin[0] || (maj === pkgMin[0] && min < pkgMin[1])) {
            pkgMin = [maj, min];
          }
        }
        if (pkgMin && (!highest || pkgMin[0] > highest[0] || (pkgMin[0] === highest[0] && pkgMin[1] > highest[1]))) {
          highest = pkgMin;
        }
      }
      if (highest) {
        const maxReleased: [number, number] = [8, 4];
        if (highest[0] > maxReleased[0] || (highest[0] === maxReleased[0] && highest[1] > maxReleased[1])) {
          highest = maxReleased;
        }
        phpVer = `${highest[0]}.${highest[1]}`;
      }
    }
  } catch {}

  return phpVer;
}

// ─── Dockerfile Generators ───

/**
 * Generate a production-ready PHP Dockerfile.
 *
 * For Laravel projects: uses php-fpm + nginx + supervisord with a multi-stage build
 * (base → deps → frontend → runner). This is the production-ready pattern ported from
 * image-builder/detection/php.ts.
 *
 * For generic PHP projects: uses php-cli with the built-in development server.
 *
 * Accepts the legacy RepoConfig type for backward compatibility with the deploy pipeline.
 * The function reads composer.json/composer.lock from disk (via config.subDir) to detect
 * transitive extension dependencies beyond what the analyzer already populated.
 */
export function generatePhpDockerfile(config: RepoConfig, repoDir?: string): string {
  const phpVer = config.phpVersion || "8.4";
  const appDir = repoDir
    ? (config.subDir ? join(repoDir, config.subDir) : repoDir)
    : undefined;

  // If we have access to the repo directory, resolve the PHP version from lock files
  // for more accurate version detection (transitive deps may require higher versions)
  const resolvedPhpVer = appDir ? resolvePhpVersion(appDir, phpVer) : phpVer;

  const isLaravel = config.framework === "Laravel" || config.framework === "laravel";
  const hasNodeAssets = config.features.has("node-assets");

  if (isLaravel) {
    return generateLaravelDockerfile(config, resolvedPhpVer, hasNodeAssets, appDir);
  }
  return generateGenericPhpDockerfile(config, resolvedPhpVer, appDir);
}

/**
 * Generate a production-ready Laravel Dockerfile using php-fpm + nginx + supervisord.
 * Multi-stage build: base → deps → frontend (optional) → runner.
 */
function generateLaravelDockerfile(
  config: RepoConfig,
  phpVer: string,
  hasNodeAssets: boolean,
  appDir: string | undefined,
): string {
  const lines: string[] = [];

  // Collect all required extensions: from config + transitive deps from disk
  const requiredExts = new Set<string>(config.phpExtensions);
  if (appDir) {
    for (const ext of detectRequiredExtensions(appDir)) {
      requiredExts.add(ext);
    }
  }
  // Always include common Laravel extensions
  for (const ext of ["pdo", "pdo_mysql", "pdo_pgsql", "mbstring", "xml", "zip", "gd", "bcmath", "opcache", "pcntl"]) {
    requiredExts.add(ext);
  }

  // Separate into installable vs pecl vs builtin
  const installable = [...requiredExts].filter(e => !BUILTIN_EXTS.has(e) && !isPeclExt(e, phpVer));
  const pecl = [...requiredExts].filter(e => isPeclExt(e, phpVer));
  // Always include redis via pecl for Laravel
  if (!pecl.includes("redis")) pecl.push("redis");

  // Collect all apt dependencies for extensions + system packages
  const aptPkgs = new Set(["git", "unzip", "curl", "nginx", "supervisor"]);
  for (const ext of [...installable, ...pecl]) {
    for (const pkg of (EXT_APT_DEPS[ext] || [])) aptPkgs.add(pkg);
  }

  // ── Stage 1: base ──
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

  // ── Stage 2: deps ──
  lines.push("");
  lines.push("FROM base AS deps");
  lines.push("COPY composer.json composer.lock* ./");
  lines.push("RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist");

  // ── Stage 3: frontend (only when Node assets present) ──
  if (hasNodeAssets) {
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

  // ── Stage 4: runner ──
  lines.push("");
  lines.push("FROM base AS runner");
  lines.push("COPY . .");
  lines.push("COPY --from=deps /var/www/html/vendor ./vendor");
  if (hasNodeAssets) {
    lines.push("COPY --from=frontend /app/public ./public");
  }

  // Laravel setup: autoload, .env, key generation, cache clearing, storage permissions
  lines.push("RUN composer dump-autoload --optimize \\");
  lines.push('    && if [ ! -f .env ]; then cp .env.example .env 2>/dev/null || touch .env; fi \\');
  lines.push("    && php artisan key:generate --force 2>/dev/null || true \\");
  lines.push("    && php artisan config:clear 2>/dev/null || true \\");
  lines.push("    && php artisan route:clear 2>/dev/null || true \\");
  lines.push("    && php artisan view:clear 2>/dev/null || true \\");
  lines.push("    && mkdir -p storage/framework/{sessions,views,cache} storage/logs bootstrap/cache \\");
  lines.push("    && chown -R www-data:www-data storage bootstrap/cache \\");
  lines.push("    && chmod -R 777 storage bootstrap/cache");

  // Nginx config — serve Laravel's public/ directory via php-fpm
  lines.push("");
  lines.push("# Nginx config");
  lines.push("RUN cat > /etc/nginx/sites-available/default <<'NGINXCONF'\nserver {\n  listen 80;\n  server_name _;\n  root /var/www/html/public;\n  index index.php;\n  client_max_body_size 100M;\n  location / { try_files $uri $uri/ /index.php?$query_string; }\n  location ~ \\.php$ { fastcgi_pass 127.0.0.1:9000; fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name; include fastcgi_params; }\n  location ~ /\\.(?!well-known).* { deny all; }\n}\nNGINXCONF");

  // Supervisor config — run php-fpm and nginx together
  lines.push("# Supervisor config");
  lines.push(`RUN echo '[supervisord]\\nnodaemon=true\\n[program:php-fpm]\\ncommand=php-fpm -F\\nautostart=true\\nautorestart=true\\n[program:nginx]\\ncommand=nginx -g "daemon off;"\\nautostart=true\\nautorestart=true' > /etc/supervisor/conf.d/app.conf`);

  lines.push("EXPOSE 80");
  lines.push('CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/app.conf"]');

  return lines.join("\n") + "\n";
}

/**
 * Generate a Dockerfile for generic (non-Laravel) PHP projects.
 * Uses php-cli with the built-in development server.
 */
function generateGenericPhpDockerfile(
  config: RepoConfig,
  phpVer: string,
  appDir: string | undefined,
): string {
  const lines: string[] = [];

  // Collect required extensions from config + transitive deps from disk
  const requiredExts = new Set<string>(config.phpExtensions);
  if (appDir) {
    for (const ext of detectRequiredExtensions(appDir)) {
      requiredExts.add(ext);
    }
  }
  for (const ext of ["zip", "pdo", "pdo_mysql"]) requiredExts.add(ext);

  const installable = [...requiredExts].filter(e => !BUILTIN_EXTS.has(e) && !isPeclExt(e, phpVer));
  const pecl = [...requiredExts].filter(e => isPeclExt(e, phpVer));

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

  return lines.join("\n") + "\n";
}
