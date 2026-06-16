import type { DockerFix } from "./types.js";

/**
 * Parses Docker build error output and attempts to patch the Dockerfile.
 * Returns null if the error is not fixable automatically.
 */
export function patchDockerfile(buildOutput: string, currentDockerfile: string): DockerFix | null {
  const fixes: string[] = [];
  let df = currentDockerfile;

  // ── 1. Missing PHP extensions ──
  const missingExts = [...buildOutput.matchAll(/requires\s+ext-(\w+)\s+\*/g)].map(m => m[1]);
  const missingExts2 = [...buildOutput.matchAll(/enable PHP's (\w+) extension/g)].map(m => m[1]);
  const missingExts3 = [...buildOutput.matchAll(/requested PHP extension (\w+) is missing/g)].map(m => m[1]);
  const allMissingExts = [...new Set([...missingExts, ...missingExts2, ...missingExts3])];

  if (allMissingExts.length > 0) {
    const BUILTIN_EXTS = new Set([
      "ctype", "curl", "date", "dom", "fileinfo", "filter", "ftp", "hash",
      "iconv", "json", "libxml", "mbstring", "mysqlnd", "openssl", "pcre",
      "pdo", "phar", "posix", "readline", "reflection", "session", "simplexml",
      "sodium", "spl", "standard", "tokenizer", "xml", "xmlreader", "xmlwriter", "zlib",
    ]);
    const PECL_EXTS = new Set(["imagick", "redis", "xdebug", "apcu", "memcached", "swoole", "mongodb"]);
    const EXT_APT: Record<string, string[]> = {
      gd: ["libpng-dev", "libjpeg-dev", "libfreetype6-dev"],
      pgsql: ["libpq-dev"], pdo_pgsql: ["libpq-dev"],
      zip: ["libzip-dev"], intl: ["libicu-dev"],
      imagick: ["libmagickwand-dev"], soap: ["libxml2-dev"],
      xmlrpc: ["libxml2-dev"], ldap: ["libldap2-dev"],
      imap: ["libc-client-dev", "libkrb5-dev"],
      bz2: ["libbz2-dev"], enchant: ["libenchant-2-dev"],
      snmp: ["libsnmp-dev"], tidy: ["libtidy-dev"],
      xsl: ["libxslt1-dev"],
    };
    const EXT_RUNTIME_APT: Record<string, string[]> = {
      gd: ["libpng16-16", "libjpeg62-turbo", "libfreetype6"],
      pgsql: ["libpq5"], pdo_pgsql: ["libpq5"],
      zip: ["libzip4"], intl: ["libicu72"],
      imagick: ["libmagickwand-6.q16-7"],
      xsl: ["libxslt1.1"], ldap: ["libldap-2.5-0"],
      bz2: ["libbz2-1.0"], tidy: ["libtidy5deb1"],
      snmp: ["libsnmp40"],
    };

    const toInstall = allMissingExts.filter(e => !BUILTIN_EXTS.has(e));
    const newPecl = toInstall.filter(e => PECL_EXTS.has(e));
    const newDockerExt = toInstall.filter(e => !PECL_EXTS.has(e));

    if (toInstall.length > 0) {
      const lines = df.split("\n");
      const newLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes("apt-get install") && line.includes("apt-get update") && !line.includes("FROM")) {
          const newAptPkgs: string[] = [];
          for (const ext of toInstall) { if (EXT_APT[ext]) newAptPkgs.push(...EXT_APT[ext]); }
          if (newAptPkgs.length > 0) {
            newLines.push(line.replace(/&&\s*rm\s+-rf/, `${newAptPkgs.join(" ")} && rm -rf`));
            continue;
          }
        }

        if (line.startsWith("RUN docker-php-ext-install") && newDockerExt.length > 0) {
          const existing = line.replace("RUN docker-php-ext-install ", "").trim().split(/\s+/);
          const merged = [...new Set([...existing, ...newDockerExt])];
          if (newDockerExt.includes("gd") && !df.includes("docker-php-ext-configure gd")) {
            newLines.push("RUN docker-php-ext-configure gd --with-freetype --with-jpeg");
          }
          newLines.push(`RUN docker-php-ext-install ${merged.join(" ")}`);
          for (const ext of newPecl) {
            if (!df.includes(`pecl install ${ext}`)) newLines.push(`RUN pecl install ${ext} && docker-php-ext-enable ${ext}`);
          }
          newDockerExt.length = 0;
          newPecl.length = 0;
          continue;
        }

        newLines.push(line);

        if (line.includes("getcomposer.org") && newDockerExt.length > 0) {
          if (newDockerExt.includes("gd")) newLines.push("RUN docker-php-ext-configure gd --with-freetype --with-jpeg");
          newLines.push(`RUN docker-php-ext-install ${newDockerExt.join(" ")}`);
          for (const ext of newPecl) newLines.push(`RUN pecl install ${ext} && docker-php-ext-enable ${ext}`);
          newDockerExt.length = 0;
          newPecl.length = 0;
        }

        if (!line.match(/^FROM (?:public\.ecr\.aws\/docker\/library\/)?php:.+ AS\b/i) && line.match(/^FROM (?:public\.ecr\.aws\/docker\/library\/)?php:/i) && !line.includes("AS ")) {
          const nextLine = lines[i + 1];
          if (nextLine?.startsWith("WORKDIR")) {
            newLines.push(nextLine);
            i++;
            const runtimePkgs: string[] = [];
            for (const ext of toInstall) { if (EXT_RUNTIME_APT[ext]) runtimePkgs.push(...EXT_RUNTIME_APT[ext]); }
            if (runtimePkgs.length > 0) {
              const existingRuntimeApt = lines.slice(i + 1).find(l => l.includes("apt-get install") && l.includes("apt-get update"));
              if (!existingRuntimeApt) {
                newLines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...new Set(runtimePkgs)].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);
              }
            }
          }
        }

        if (line.includes("apt-get install") && line.includes("apt-get update") && i > lines.indexOf(lines.find(l => /^FROM (?:public\.ecr\.aws\/docker\/library\/)?php:/.test(l) && !l.includes("AS ")) || "")) {
          const runtimePkgs: string[] = [];
          for (const ext of toInstall) { if (EXT_RUNTIME_APT[ext]) runtimePkgs.push(...EXT_RUNTIME_APT[ext]); }
          if (runtimePkgs.length > 0) {
            newLines[newLines.length - 1] = newLines[newLines.length - 1].replace(/&&\s*rm\s+-rf/, `${runtimePkgs.join(" ")} && rm -rf`);
          }
        }
      }

      df = newLines.join("\n");
      fixes.push(`Added PHP extensions: ${toInstall.join(", ")}`);
    }

    if (!df.includes("--ignore-platform-reqs") && buildOutput.includes("composer install")) {
      df = df.replace(/RUN composer install([^\n]*)/g, "RUN composer install$1 --ignore-platform-reqs");
      fixes.push("Added --ignore-platform-reqs to composer install");
    }
  }

  // ── 2. Missing system packages ──
  const unlocatable = [...buildOutput.matchAll(/Unable to locate package (\S+)/g)].map(m => m[1]);
  if (unlocatable.length > 0) {
    const FALLBACK_MAP: Record<string, string[]> = {
      libicu72: ["libicu-dev"], libicu67: ["libicu-dev"],
      "libmagickwand-6.q16-7": ["libmagickwand-dev"], "libmagickwand-6.q16-6": ["libmagickwand-dev"],
    };
    for (const pkg of unlocatable) {
      const fallback = FALLBACK_MAP[pkg];
      if (fallback) {
        df = df.replace(new RegExp(pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), fallback.join(" "));
        fixes.push(`Replaced ${pkg} with ${fallback.join(", ")} (Debian version mismatch)`);
      } else {
        df = df.replace(new RegExp(`\\s*${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "");
        fixes.push(`Removed unavailable package: ${pkg}`);
      }
    }
  }

  const missingPkgConfig = [...buildOutput.matchAll(/No package '([^']+)' found/g)].map(m => m[1]);
  if (missingPkgConfig.length > 0) {
    const PKG_CONFIG_MAP: Record<string, string> = {
      libcurl: "libcurl4-openssl-dev", libpng: "libpng-dev", libjpeg: "libjpeg-dev",
      freetype2: "libfreetype6-dev", libwebp: "libwebp-dev", libzip: "libzip-dev",
      icu: "libicu-dev", "icu-uc": "libicu-dev", "icu-i18n": "libicu-dev",
      libpq: "libpq-dev", libxml: "libxml2-dev", "libxml-2.0": "libxml2-dev",
      libxslt: "libxslt1-dev", libffi: "libffi-dev", openssl: "libssl-dev",
      zlib: "zlib1g-dev", libsodium: "libsodium-dev", libyaml: "libyaml-dev",
      ImageMagick: "libmagickwand-dev", MagickWand: "libmagickwand-dev",
      vips: "libvips-dev", cairo: "libcairo2-dev",
      pango: "libpango1.0-dev", pangocairo: "libpango1.0-dev",
    };
    const aptToAdd: string[] = [];
    for (const pkg of missingPkgConfig) {
      const apt = PKG_CONFIG_MAP[pkg];
      if (apt && !df.includes(apt)) aptToAdd.push(apt);
    }
    if (aptToAdd.length > 0) {
      df = df.replace(/(apt-get install -y --no-install-recommends\s+)([^&]+)(&&\s*rm\s+-rf)/, `$1$2${aptToAdd.join(" ")} $3`);
      fixes.push(`Added system packages: ${aptToAdd.join(", ")}`);
    }
  }

  // ── 3. npm/pnpm/yarn install failures ──
  if (buildOutput.includes("npm ci` can only install") || buildOutput.includes("npm ci can only install")) {
    df = df.replace(/RUN npm ci \|\| npm install/g, "RUN npm install");
    df = df.replace(/RUN npm ci(?!\s*\|)/g, "RUN npm install");
    fixes.push("Replaced npm ci with npm install (no lockfile)");
  }
  if (buildOutput.includes("not found: python") || buildOutput.includes("gyp ERR") || buildOutput.includes("node-gyp")) {
    const nodeBuilderFrom = df.match(/FROM (?:public\.ecr\.aws\/docker\/library\/)?node:\S+ AS node-builder/);
    if (nodeBuilderFrom) {
      const fromLine = nodeBuilderFrom[0];
      if (!df.includes("python3") || !df.includes("make")) {
        df = df.replace(fromLine + "\nWORKDIR /app", fromLine + "\nWORKDIR /app\nRUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*");
        fixes.push("Added python3/make/g++ to node-builder for native modules");
      }
    }
  }
  if (buildOutput.includes("ERR_PNPM_FROZEN_LOCKFILE")) {
    df = df.replace(/pnpm install --frozen-lockfile/g, "pnpm install --no-frozen-lockfile");
    fixes.push("Relaxed pnpm frozen lockfile (lockfile out of sync)");
  }
  if (buildOutput.includes("Couldn't find an integrity file") || buildOutput.includes("--check-files")) {
    df = df.replace(/yarn install --immutable/g, "yarn install");
    fixes.push("Relaxed yarn immutable install");
  }
  if (buildOutput.includes("could not determine executable to run") || buildOutput.includes("COREPACK_ENABLE_STRICT")) {
    df = df.replace(/RUN corepack enable/g, "RUN corepack enable\nENV COREPACK_ENABLE_STRICT=0");
    fixes.push("Disabled corepack strict mode");
  }

  // ── 4. Python pip failures ──
  if (buildOutput.includes("Could not find a version") && df.includes("pip install")) {
    if (!df.includes("--pre")) {
      df = df.replace(/(pip install --no-cache-dir -r requirements\.txt)/g, "$1 || pip install --no-cache-dir --pre -r requirements.txt");
      fixes.push("Added pip --pre fallback for pre-release packages");
    }
  }

  // ── 5. Missing build script ──
  if (buildOutput.includes('Missing script: "build"') || buildOutput.includes("missing script: build")) {
    df = df.replace(/\nRUN (?:npm run|pnpm|yarn) build\n/g, "\n");
    fixes.push("Removed build step (no build script found)");
  }

  // ── 6. Go build failures ──
  const missingGoMod = buildOutput.match(/cannot find module providing package ([^\s]+)/);
  if (missingGoMod) {
    if (!df.includes("go mod tidy")) {
      df = df.replace(/RUN CGO_ENABLED=0 go build/g, "RUN go mod tidy\nRUN CGO_ENABLED=0 go build");
      fixes.push("Added go mod tidy before build");
    }
  }

  // ── 7. Permission errors ──
  if (buildOutput.includes("EACCES") || buildOutput.includes("permission denied")) {
    if (df.includes("npm ci") && !df.includes("--unsafe-perm")) {
      df = df.replace(/npm ci/g, "npm ci --unsafe-perm");
      fixes.push("Added --unsafe-perm to npm ci");
    }
  }

  // ── 8. Node.js too old for modern deps (undici 7+, Next.js SSR) ──
  const undiciOnOldNode =
    buildOutput.includes("undici") &&
    (buildOutput.includes("Node.js v18") || df.includes("node:18"));
  const nextBuildOnNode18 =
    df.includes("node:18") &&
    (buildOutput.includes("ELIFECYCLE") || buildOutput.includes("next build"));
  if (undiciOnOldNode || nextBuildOnNode18) {
    df = df.replace(/node:18(-slim)?/g, "node:20$1");
    fixes.push("Upgraded Node.js 18 → 20 (modern SSR deps require Node 20+)");
  }

  // ── 9. pnpm on Node 20 — node:sqlite requires Node 22+ ──
  if (buildOutput.includes("node:sqlite") || buildOutput.includes("ERR_UNKNOWN_BUILTIN_MODULE")) {
    df = df.replace(/node:20(-slim)?/g, "node:22$1");
    fixes.push("Upgraded Node.js 20 → 22 for pnpm (node:sqlite built-in)");
  }

  // ── 10. Memory issues ──
  if (buildOutput.includes("ENOMEM") || buildOutput.includes("JavaScript heap out of memory")) {
    if (!df.includes("NODE_OPTIONS")) {
      df = df.replace(/(RUN (?:npm run|pnpm|yarn) build)/g, 'ENV NODE_OPTIONS="--max-old-space-size=4096"\n$1');
      fixes.push("Increased Node.js memory limit to 4GB");
    }
  }

  if (fixes.length === 0) return null;
  return { patched: df, description: fixes.join("; ") };
}
