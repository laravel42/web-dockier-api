import type { RepoConfig } from "../types";

export function generatePhpDockerfile(config: RepoConfig): string {
  const phpVer = config.phpVersion || "8.4";
  const copyPrefix = config.subDir ? `${config.subDir}/` : "";
  const lines: string[] = [];

  lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-cli AS composer`);
  lines.push("WORKDIR /app");

  const aptPkgs = new Set(["curl", "git", "unzip"]);
  for (const dep of config.nativeDeps) {
    for (const pkg of dep.aptPackages) aptPkgs.add(pkg);
  }
  for (const ext of config.phpExtensions) {
    if (ext === "gd") { aptPkgs.add("libpng-dev"); aptPkgs.add("libjpeg-dev"); aptPkgs.add("libfreetype6-dev"); }
    if (ext === "pgsql" || ext === "pdo_pgsql") aptPkgs.add("libpq-dev");
    if (ext === "zip") aptPkgs.add("libzip-dev");
    if (ext === "intl") aptPkgs.add("libicu-dev");
    if (ext === "imagick") aptPkgs.add("libmagickwand-dev");
    if (ext === "soap" || ext === "xmlrpc") aptPkgs.add("libxml2-dev");
  }
  lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...aptPkgs].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);

  if (config.phpExtensions.length > 0) {
    const BUILTIN_EXTS = new Set([
      "ctype", "curl", "date", "dom", "fileinfo", "filter", "ftp", "hash",
      "iconv", "json", "libxml", "mbstring", "mysqlnd", "openssl", "pcre",
      "pdo", "phar", "posix", "readline", "reflection", "session", "simplexml",
      "sodium", "spl", "standard", "tokenizer", "xml", "xmlreader", "xmlwriter", "zlib",
    ]);
    const PECL_EXTS = new Set(["imagick", "redis", "xdebug", "apcu", "memcached", "swoole", "mongodb"]);
    const installable = config.phpExtensions.filter(e => !BUILTIN_EXTS.has(e) && !PECL_EXTS.has(e));
    const pecl = config.phpExtensions.filter(e => PECL_EXTS.has(e));
    if (installable.includes("gd")) lines.push("RUN docker-php-ext-configure gd --with-freetype --with-jpeg");
    if (installable.length > 0) lines.push(`RUN docker-php-ext-install ${installable.join(" ")}`);
    for (const ext of pecl) lines.push(`RUN pecl install ${ext} && docker-php-ext-enable ${ext}`);
  }

  lines.push("RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer");
  lines.push(`COPY ${copyPrefix}composer.json ${copyPrefix}composer.lock* ./`);
  lines.push("RUN composer install --no-interaction --optimize-autoloader --no-dev --prefer-dist --no-scripts --ignore-platform-reqs");

  const hasNodeAssets = config.features.has("node-assets");
  if (hasNodeAssets) {
    const nodePm = config.features.has("node-pm-pnpm") ? "pnpm" : config.features.has("node-pm-yarn") ? "yarn" : "npm";
    let nodeInstallCmd = "npm ci || npm install";
    if (nodePm === "pnpm") nodeInstallCmd = "corepack enable && pnpm install --no-frozen-lockfile";
    else if (nodePm === "yarn") nodeInstallCmd = "corepack enable && yarn install --immutable || yarn install";
    lines.push("");
    lines.push("FROM public.ecr.aws/docker/library/node:20-slim AS node-builder");
    lines.push("WORKDIR /app");
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}package-lock.json* ${copyPrefix}pnpm-lock.yaml* ${copyPrefix}yarn.lock* ./`);
    lines.push(`RUN ${nodeInstallCmd}`);
    lines.push(`COPY ${copyPrefix}. .`);
    lines.push(`RUN ${nodePm} run build`);
  }

  lines.push("");
  lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-cli`);
  lines.push("WORKDIR /app");

  const phpMajMin = parseFloat(phpVer) || 8.4;
  const isBullseye = phpMajMin < 8.2;
  const isTrixie = phpMajMin >= 8.4;
  const runtimeAptPkgs = new Set<string>();
  for (const ext of config.phpExtensions) {
    if (ext === "gd") { runtimeAptPkgs.add(isTrixie ? "libpng16-16t64" : "libpng16-16"); runtimeAptPkgs.add("libjpeg62-turbo"); runtimeAptPkgs.add("libfreetype6"); }
    if (ext === "pgsql" || ext === "pdo_pgsql") runtimeAptPkgs.add("libpq5");
    if (ext === "zip") runtimeAptPkgs.add("libzip-dev");
    if (ext === "intl") runtimeAptPkgs.add(isBullseye ? "libicu67" : isTrixie ? "libicu76" : "libicu72");
    if (ext === "imagick") runtimeAptPkgs.add(isBullseye ? "libmagickwand-6.q16-6" : "libmagickwand-6.q16-7");
  }
  if (runtimeAptPkgs.size > 0) {
    lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...runtimeAptPkgs].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);
  }

  lines.push("COPY --from=composer /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/");
  lines.push("COPY --from=composer /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/");
  lines.push("COPY --from=composer /app/vendor ./vendor");
  if (hasNodeAssets) lines.push("COPY --from=node-builder /app/public ./public");
  lines.push(`COPY ${copyPrefix}. .`);
  // Laravel requires writable storage and bootstrap/cache directories
  lines.push("RUN mkdir -p storage/logs storage/framework/sessions storage/framework/views storage/framework/cache bootstrap/cache && chmod -R 777 storage bootstrap/cache");
  // Ensure .env exists — Laravel crashes without it. If the repo ships .env.example,
  // copy it as a base; runtime env vars (APP_KEY, DB_*, etc.) injected via docker run
  // will override values in the file.
  if (config.framework === "Laravel") {
    lines.push("RUN cp -n .env.example .env 2>/dev/null || touch .env");
  }
  lines.push(`ENV PORT=${config.port}`);
  lines.push(`EXPOSE ${config.port}`);
  lines.push(`CMD ${JSON.stringify((config.startCommand || "php artisan serve --host=0.0.0.0 --port=8080").split(" "))}`);

  return lines.join("\n") + "\n";
}
