import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "../types.js";

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
  imap: [8, 4],
};

/**
 * Packages that require native compilation via node-gyp and are incompatible
 * with modern Node versions.
 */
const LEGACY_NATIVE_PACKAGES = new Set(["node-sass", "fibers", "fsevents"]);

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

export function debianVariant(phpVer: string): string {
  const parsed = parseMajorMinor(phpVer);
  if (!parsed) return "bookworm";
  const [major, minor] = parsed;
  if (major < 8 || (major === 8 && minor < 1)) return "bullseye";
  return "bookworm";
}

export function composerImageTag(phpVer: string): string {
  const parsed = parseMajorMinor(phpVer);
  if (!parsed) return "2";
  const [major, minor] = parsed;
  if (major < 8 || (major === 8 && minor < 1)) return "2.2";
  return "2";
}

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

export function hasLegacyNativeNodeDeps(appDir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const dep of Object.keys(allDeps)) {
      if (LEGACY_NATIVE_PACKAGES.has(dep)) return true;
    }
  } catch {}
  return false;
}

function readPackageManagerField(appDir: string): { name: string; version: string } | null {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
    const raw = pkg.packageManager as string | undefined;
    if (!raw) return null;
    const [name, ver] = raw.split("@");
    if (!name) return null;
    return { name, version: ver?.split("+")[0] || "" };
  } catch {
    return null;
  }
}

/** Node image for Laravel/Vite frontend asset builds inside PHP Dockerfiles. */
export function resolveFrontendNodeImage(appDir: string | undefined): string {
  if (appDir && hasLegacyNativeNodeDeps(appDir)) {
    return "public.ecr.aws/docker/library/node:16";
  }
  // pnpm 10+ requires node:sqlite (Node 22+). Default to 22 for modern frontend tooling.
  return "public.ecr.aws/docker/library/node:22-slim";
}

function pnpmCorepackSetup(appDir: string | undefined): string {
  const pm = appDir ? readPackageManagerField(appDir) : null;
  if (pm?.name === "pnpm" && pm.version) {
    return `corepack enable && corepack prepare pnpm@${pm.version} --activate && `;
  }
  return "corepack enable && ";
}

/**
 * Resolve the PHP version from composer.json and composer.lock.
 *
 * The project's `composer.json` declares the intended PHP version, but the
 * `composer.lock` may contain packages that require a higher minimum (e.g.,
 * the lock was generated on PHP 8.1 while composer.json says "^8.0").
 *
 * Strategy:
 * 1. Start with the version from composer.json as the baseline.
 * 2. Scan composer.lock for the highest *lower-bound* PHP requirement across
 *    all locked packages. This tells us the true minimum PHP version needed
 *    to install the lock file.
 * 3. Use whichever is higher — the project's declared version or the lock
 *    file's effective minimum.
 * 4. Cap at the highest officially released PHP Docker image version.
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

  // Scan composer.lock for the effective minimum PHP version required by locked packages.
  // A package with "^8.1" means it needs at least 8.1. We find the highest such lower bound.
  try {
    const lockPath = join(appDir, "composer.lock");
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
      let highest = parseMajorMinor(phpVer);

      for (const pkg of [...(lock.packages || []), ...(lock["packages-dev"] || [])]) {
        const phpReq = pkg?.require?.["php"];
        if (typeof phpReq !== "string") continue;

        // Extract the effective lower bound from the constraint.
        // For "^8.1" → 8.1, for ">=8.1" → 8.1, for ">=8.1 <8.4" → 8.1
        // For "^8.0|^8.1" or "8.0|8.1" → 8.0 (OR means any of them works, so min is lowest)
        // For "~8.1.0" → 8.1
        const isOrConstraint = phpReq.includes("|") || phpReq.includes(" || ");

        let pkgLowerBound: [number, number] | null = null;
        const bounds = phpReq.matchAll(/(\d+)\.(\d+)/g);
        for (const m of bounds) {
          const maj = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          if (isNaN(maj) || isNaN(min)) continue;
          // Skip versions that appear after < or != operators (upper bounds / exclusions)
          const prefix = phpReq.slice(0, m.index).trim();
          if (prefix.endsWith("<") || prefix.endsWith("!") || prefix.endsWith("!=")) continue;

          if (isOrConstraint) {
            // OR constraint: the effective minimum is the LOWEST alternative
            if (!pkgLowerBound || maj < pkgLowerBound[0] || (maj === pkgLowerBound[0] && min < pkgLowerBound[1])) {
              pkgLowerBound = [maj, min];
            }
          } else {
            // AND constraint or single constraint: take the first (lowest) lower bound found
            if (!pkgLowerBound) {
              pkgLowerBound = [maj, min];
            }
          }
        }

        // If this package's lower bound is higher than our current highest, bump up
        if (pkgLowerBound && (!highest || pkgLowerBound[0] > highest[0] || (pkgLowerBound[0] === highest[0] && pkgLowerBound[1] > highest[1]))) {
          highest = pkgLowerBound;
        }
      }

      if (highest) {
        // Cap at the highest released PHP Docker image version
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

export function generatePhpDockerfile(config: RepoConfig, repoDir?: string): string {
  const phpVer = config.phpVersion || "8.4";
  const appDir = repoDir
    ? (config.subDir ? join(repoDir, config.subDir) : repoDir)
    : undefined;

  const resolvedPhpVer = appDir ? resolvePhpVersion(appDir, phpVer) : phpVer;

  const isLaravel = config.framework === "Laravel" || config.framework === "laravel";
  const hasNodeAssets = config.features.has("node-assets");

  if (isLaravel) {
    return generateLaravelDockerfile(config, resolvedPhpVer, hasNodeAssets, appDir);
  }
  return generateGenericPhpDockerfile(config, resolvedPhpVer, appDir);
}

function generateLaravelDockerfile(
  config: RepoConfig,
  phpVer: string,
  hasNodeAssets: boolean,
  appDir: string | undefined,
): string {
  const lines: string[] = [];

  const requiredExts = new Set<string>(config.phpExtensions);
  if (appDir) {
    for (const ext of detectRequiredExtensions(appDir)) {
      requiredExts.add(ext);
    }
  }
  for (const ext of ["pdo", "pdo_mysql", "pdo_pgsql", "mbstring", "xml", "zip", "gd", "bcmath", "opcache", "pcntl"]) {
    requiredExts.add(ext);
  }

  const installable = [...requiredExts].filter(e => !BUILTIN_EXTS.has(e) && !isPeclExt(e, phpVer));
  const pecl = [...requiredExts].filter(e => isPeclExt(e, phpVer));
  if (!pecl.includes("redis")) pecl.push("redis");

  const variant = debianVariant(phpVer);
  lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-fpm-${variant} AS base`);
  if (variant === "bullseye" || variant === "buster") {
    lines.push('RUN echo "Acquire::Check-Valid-Until false;" > /etc/apt/apt.conf.d/99no-check-valid-until');
  }

  lines.push("ADD --chmod=0755 https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/");

  const systemPkgs = new Set(["git", "unzip", "curl", "nginx", "supervisor"]);
  lines.push(`RUN apt-get update && apt-get install -y \\`);
  lines.push(`    ${[...systemPkgs].sort().join(" ")} \\`);
  lines.push("    && apt-get clean && rm -rf /var/lib/apt/lists/*");

  const allExts = [...new Set([...installable, ...pecl])].sort();
  if (allExts.length > 0) {
    lines.push(`RUN install-php-extensions ${allExts.join(" ")}`);
  }

  const composerTag = composerImageTag(phpVer);
  lines.push(`COPY --from=public.ecr.aws/docker/library/composer:${composerTag} /usr/bin/composer /usr/bin/composer`);
  lines.push("WORKDIR /var/www/html");

  lines.push("");
  lines.push("FROM base AS deps");
  lines.push("COPY composer.json composer.lock* ./");
  lines.push("RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist");

  if (hasNodeAssets) {
    const nodeImage = resolveFrontendNodeImage(appDir);
    const pnpmSetup = pnpmCorepackSetup(appDir);

    lines.push("");
    lines.push(`FROM ${nodeImage} AS frontend`);
    lines.push("WORKDIR /app");
    lines.push("COPY package*.json yarn.lock* pnpm-lock.yaml* bun.lockb* ./");
    lines.push(`RUN if [ -f pnpm-lock.yaml ]; then ${pnpmSetup}pnpm install --no-frozen-lockfile; \\`);
    lines.push('    elif [ -f yarn.lock ]; then corepack enable && yarn install --immutable || yarn install; \\');
    lines.push("    else npm ci || npm install; fi");
    lines.push("COPY . .");
    // Vite/Filament imports CSS from vendor/ — available from deps stage, not build context (.dockerignore)
    lines.push("COPY --from=deps /var/www/html/vendor ./vendor");
    lines.push("RUN mkdir -p public/build && \\");
    lines.push(`    (if [ -f pnpm-lock.yaml ]; then ${pnpmSetup}pnpm run build; \\`);
    lines.push('    elif [ -f yarn.lock ]; then yarn build; \\');
    lines.push("    else npm run build; fi)");
  }

  lines.push("");
  lines.push("FROM base AS runner");
  lines.push("COPY . .");
  lines.push("COPY --from=deps /var/www/html/vendor ./vendor");
  if (hasNodeAssets) {
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
  lines.push("    && chmod -R 777 storage bootstrap/cache");

  lines.push("");
  lines.push("# Nginx config");
  lines.push("RUN cat > /etc/nginx/sites-available/default <<'NGINXCONF'\nserver {\n  listen 80;\n  server_name _;\n  root /var/www/html/public;\n  index index.php;\n  client_max_body_size 100M;\n  location / { try_files $uri $uri/ /index.php?$query_string; }\n  location ~ \\.php$ { fastcgi_pass 127.0.0.1:9000; fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name; include fastcgi_params; }\n  location ~ /\\.(?!well-known).* { deny all; }\n}\nNGINXCONF");

  lines.push("# Supervisor config");
  lines.push(`RUN echo '[supervisord]\\nnodaemon=true\\n[program:php-fpm]\\ncommand=php-fpm -F\\nautostart=true\\nautorestart=true\\n[program:nginx]\\ncommand=nginx -g "daemon off;"\\nautostart=true\\nautorestart=true' > /etc/supervisor/conf.d/app.conf`);

  lines.push("");
  lines.push("# Startup script");
  lines.push("RUN printf '#!/bin/sh\\nchown -R www-data:www-data /var/www/html/storage\\nchmod -R 775 /var/www/html/storage\\nexec /usr/bin/supervisord -c /etc/supervisor/conf.d/app.conf\\n' > /usr/local/bin/start.sh \\");
  lines.push("    && chmod +x /usr/local/bin/start.sh");

  lines.push("EXPOSE 80");
  lines.push('CMD ["/usr/local/bin/start.sh"]');

  return lines.join("\n") + "\n";
}

function generateGenericPhpDockerfile(
  config: RepoConfig,
  phpVer: string,
  appDir: string | undefined,
): string {
  const lines: string[] = [];

  const requiredExts = new Set<string>(config.phpExtensions);
  if (appDir) {
    for (const ext of detectRequiredExtensions(appDir)) {
      requiredExts.add(ext);
    }
  }
  for (const ext of ["zip", "pdo", "pdo_mysql"]) requiredExts.add(ext);

  const installable = [...requiredExts].filter(e => !BUILTIN_EXTS.has(e) && !isPeclExt(e, phpVer));
  const pecl = [...requiredExts].filter(e => isPeclExt(e, phpVer));

  const variant = debianVariant(phpVer);
  lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-cli-${variant}`);
  if (variant === "bullseye" || variant === "buster") {
    lines.push('RUN echo "Acquire::Check-Valid-Until false;" > /etc/apt/apt.conf.d/99no-check-valid-until');
  }

  lines.push("ADD --chmod=0755 https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/");

  lines.push(`RUN apt-get update && apt-get install -y git unzip \\`);
  lines.push("    && apt-get clean && rm -rf /var/lib/apt/lists/*");

  const allExts = [...new Set([...installable, ...pecl])].sort();
  if (allExts.length > 0) {
    lines.push(`RUN install-php-extensions ${allExts.join(" ")}`);
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
