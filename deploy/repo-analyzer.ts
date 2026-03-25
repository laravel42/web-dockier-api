// ─── Repo Analyzer ───
// Parses config files from a cloned repo to extract precise info for Dockerfile generation.
// No tree-sitter needed — we parse JSON/TOML/YAML/text configs directly.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ───

export interface RepoConfig {
  // Runtime
  runtime: "node" | "php" | "python" | "go" | "ruby" | "java" | "rust" | "dotnet" | "unknown";
  runtimeVersion: string; // e.g. "20", "8.3", "3.12"

  // Package manager
  packageManager: "pnpm" | "yarn" | "npm" | "bun" | "composer" | "pip" | "go" | "cargo" | "bundle" | "unknown";
  packageManagerVersion: string; // e.g. "10.14.0"

  // Framework
  framework: string; // e.g. "Next.js", "Laravel", "Django"
  frameworkVersion: string;

  // Build info
  buildCommand: string;
  startCommand: string;
  port: number;

  // Node.js specific
  nodeVersion: string; // from engines.node or .nvmrc
  hasStandalone: boolean; // Next.js standalone output
  nativeDeps: NativeDep[]; // deps requiring system packages
  nextConfig: { output?: string; experimental?: Record<string, unknown> };

  // PHP specific
  phpVersion: string;
  phpExtensions: string[];
  composerScripts: string[];

  // Python specific
  pythonVersion: string;

  // Go specific
  goVersion: string;

  // Subdirectory (if app is in a subfolder)
  subDir: string;

  // Detected features
  features: Set<string>; // e.g. "ssr", "static-export", "api-routes", "websockets", "queue-worker"
}

export interface NativeDep {
  name: string;
  aptPackages: string[]; // Debian/Ubuntu packages needed
  alpinePackages: string[]; // Alpine packages needed
  reason: string;
}

// ─── Native dependency map ───
// Maps npm/composer packages to system-level dependencies they need

const NATIVE_DEPS_MAP: Record<string, Omit<NativeDep, "name">> = {
  // Node.js native deps
  "sharp": { aptPackages: ["libvips-dev"], alpinePackages: ["vips-dev"], reason: "Image processing (libvips)" },
  "canvas": { aptPackages: ["libcairo2-dev", "libjpeg-dev", "libpango1.0-dev", "libgif-dev", "librsvg2-dev"], alpinePackages: ["cairo-dev", "jpeg-dev", "pango-dev", "giflib-dev", "librsvg-dev"], reason: "Canvas rendering (Cairo)" },
  "bcrypt": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "Native bcrypt hashing" },
  "argon2": { aptPackages: ["make", "g++"], alpinePackages: ["make", "g++"], reason: "Argon2 password hashing" },
  "better-sqlite3": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "SQLite native bindings" },
  "sqlite3": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "SQLite native bindings" },
  "pg-native": { aptPackages: ["libpq-dev"], alpinePackages: ["postgresql-dev"], reason: "PostgreSQL native client" },
  "node-gyp": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "Native addon compilation" },
  "puppeteer": { aptPackages: ["chromium", "libx11-xcb1", "libxcomposite1", "libxdamage1", "libxi6", "libxtst6", "libnss3", "libcups2", "libxss1", "libxrandr2", "libasound2", "libpangocairo-1.0-0", "libatk1.0-0", "libatk-bridge2.0-0", "libgtk-3-0"], alpinePackages: ["chromium", "nss", "freetype", "harfbuzz", "ca-certificates", "ttf-freefont"], reason: "Headless Chrome" },
  "playwright": { aptPackages: ["libnss3", "libnspr4", "libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libdrm2", "libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2", "libgbm1", "libpango-1.0-0", "libcairo2", "libasound2"], alpinePackages: [], reason: "Browser automation" },
  "libsql": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "LibSQL native bindings" },
  "@mapbox/node-pre-gyp": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "Native addon pre-built binaries" },
  "esbuild": { aptPackages: [], alpinePackages: [], reason: "Go-based bundler (ships prebuilt)" },
  "lightningcss": { aptPackages: [], alpinePackages: [], reason: "Rust-based CSS (ships prebuilt)" },
  // PHP native deps (composer packages → PHP extensions)
  "ext-gd": { aptPackages: ["libpng-dev", "libjpeg-dev", "libfreetype6-dev"], alpinePackages: ["libpng-dev", "libjpeg-turbo-dev", "freetype-dev"], reason: "GD image library" },
  "ext-imagick": { aptPackages: ["libmagickwand-dev"], alpinePackages: ["imagemagick-dev"], reason: "ImageMagick" },
  "ext-pgsql": { aptPackages: ["libpq-dev"], alpinePackages: ["postgresql-dev"], reason: "PostgreSQL extension" },
  "ext-redis": { aptPackages: [], alpinePackages: [], reason: "Redis extension (PECL)" },
  "ext-zip": { aptPackages: ["libzip-dev"], alpinePackages: ["libzip-dev"], reason: "ZIP extension" },
  "ext-intl": { aptPackages: ["libicu-dev"], alpinePackages: ["icu-dev"], reason: "Internationalization" },
  "ext-soap": { aptPackages: ["libxml2-dev"], alpinePackages: ["libxml2-dev"], reason: "SOAP extension" },
  "ext-bcmath": { aptPackages: [], alpinePackages: [], reason: "BCMath (built-in)" },
  "ext-pcntl": { aptPackages: [], alpinePackages: [], reason: "Process control (built-in)" },
};

// ─── Main analyzer ───

export function analyzeRepoConfig(repoDir: string): RepoConfig {
  const config: RepoConfig = {
    runtime: "unknown",
    runtimeVersion: "",
    packageManager: "unknown",
    packageManagerVersion: "",
    framework: "",
    frameworkVersion: "",
    buildCommand: "",
    startCommand: "",
    port: 3000,
    nodeVersion: "",
    hasStandalone: false,
    nativeDeps: [],
    nextConfig: {},
    phpVersion: "",
    phpExtensions: [],
    composerScripts: [],
    pythonVersion: "",
    goVersion: "",
    subDir: "",
    features: new Set(),
  };

  // Detect subdirectory
  const subDir = detectSubDir(repoDir);
  config.subDir = subDir;
  const appDir = subDir ? join(repoDir, subDir) : repoDir;

  // Try each runtime detector
  if (existsSync(join(appDir, "package.json"))) {
    analyzeNodeProject(appDir, repoDir, config);
  }
  if (existsSync(join(appDir, "composer.json"))) {
    analyzePhpProject(appDir, config);
  }
  if (existsSync(join(appDir, "requirements.txt")) || existsSync(join(appDir, "pyproject.toml")) || existsSync(join(appDir, "Pipfile"))) {
    analyzePythonProject(appDir, config);
  }
  if (existsSync(join(appDir, "go.mod"))) {
    analyzeGoProject(appDir, config);
  }

  // Read .nvmrc / .node-version for Node version override
  for (const f of [".nvmrc", ".node-version"]) {
    const p = join(appDir, f);
    if (!existsSync(p)) continue;
    try {
      const v = readFileSync(p, "utf-8").trim().replace(/^v/, "");
      if (v && /^\d+/.test(v)) config.nodeVersion = v.split(".")[0];
    } catch {}
  }

  return config;
}


// ─── Subdirectory detection ───

function detectSubDir(repoDir: string): string {
  const rootFiles = readdirSync(repoDir);
  const frameworkConfigs = ["next.config.js", "next.config.ts", "next.config.mjs", "nuxt.config.ts", "vite.config.ts", "angular.json", "remix.config.js", "astro.config.mjs"];
  if (frameworkConfigs.some(f => rootFiles.includes(f))) return "";
  if (rootFiles.includes("package.json")) {
    // Check if root package.json has a build script (monorepo root usually doesn't)
    try {
      const pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf-8"));
      if (pkg.scripts?.build || pkg.scripts?.start) return "";
    } catch {}
  }

  const subdirs = ["app", "frontend", "web", "client", "packages/app", "packages/web", "apps/web", "apps/frontend", "src"];
  for (const sub of subdirs) {
    const subPath = join(repoDir, sub);
    if (existsSync(subPath) && existsSync(join(subPath, "package.json"))) {
      const subFiles = readdirSync(subPath);
      if (frameworkConfigs.some(f => subFiles.includes(f))) return sub;
    }
  }
  return "";
}

// ─── Node.js analyzer ───

function analyzeNodeProject(appDir: string, repoDir: string, config: RepoConfig) {
  let pkg: any;
  try {
    pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
  } catch { return; }

  config.runtime = "node";

  // Node version from engines
  if (pkg.engines?.node) {
    const match = pkg.engines.node.match(/(\d+)/);
    if (match) config.nodeVersion = match[1];
  }
  config.runtimeVersion = config.nodeVersion || "20";

  // Package manager
  if (pkg.packageManager) {
    const [pm, ver] = pkg.packageManager.split("@");
    config.packageManager = pm as any;
    config.packageManagerVersion = ver?.split("+")[0] || "";
  } else if (existsSync(join(appDir, "pnpm-lock.yaml")) || existsSync(join(repoDir, "pnpm-lock.yaml"))) {
    config.packageManager = "pnpm";
    config.packageManagerVersion = "10.14.0";
  } else if (existsSync(join(appDir, "yarn.lock")) || existsSync(join(repoDir, "yarn.lock"))) {
    config.packageManager = "yarn";
    config.packageManagerVersion = "4.5.0";
  } else if (existsSync(join(appDir, "bun.lockb"))) {
    config.packageManager = "bun";
  } else {
    config.packageManager = "npm";
  }

  // Framework detection from dependencies
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (allDeps["next"]) {
    config.framework = "Next.js";
    config.frameworkVersion = cleanVersion(allDeps["next"]);
    config.port = 3000;
    // Check for standalone output
    for (const cfgName of ["next.config.ts", "next.config.mjs", "next.config.js"]) {
      const cfgPath = join(appDir, cfgName);
      if (existsSync(cfgPath)) {
        try {
          const content = readFileSync(cfgPath, "utf-8");
          config.hasStandalone = content.includes("standalone");
          if (content.includes("output:") && content.includes("export")) config.features.add("static-export");
          if (content.includes("serverActions") || content.includes("server actions")) config.features.add("server-actions");
        } catch {}
        break;
      }
    }
    // Detect API routes
    if (existsSync(join(appDir, "app/api")) || existsSync(join(appDir, "pages/api"))) {
      config.features.add("api-routes");
    }
    config.features.add("ssr");
  } else if (allDeps["nuxt"]) {
    config.framework = "Nuxt";
    config.frameworkVersion = cleanVersion(allDeps["nuxt"]);
    config.port = 3000;
    // Detect static vs SSR from nuxt.config
    let isStatic = false;
    for (const cfgName of ["nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.js"]) {
      const cfgPath = join(appDir, cfgName);
      if (existsSync(cfgPath)) {
        try {
          const content = readFileSync(cfgPath, "utf-8");
          // Check for static preset or SSR disabled
          if (/nitro\s*:\s*\{[^}]*preset\s*:\s*['"]static['"]/.test(content)
            || /ssr\s*:\s*false/.test(content)
            || /preset\s*:\s*['"]static['"]/.test(content)) {
            isStatic = true;
          }
        } catch {}
        break;
      }
    }
    if (isStatic) {
      config.features.add("static-export");
    } else {
      config.features.add("ssr");
    }
  } else if (allDeps["@angular/core"]) {
    config.framework = "Angular";
    config.frameworkVersion = cleanVersion(allDeps["@angular/core"]);
    config.port = 4200;
  } else if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) {
    config.framework = "SvelteKit";
    config.frameworkVersion = cleanVersion(allDeps["@sveltejs/kit"] || allDeps["svelte"]);
    config.port = 3000;
  } else if (allDeps["astro"]) {
    config.framework = "Astro";
    config.frameworkVersion = cleanVersion(allDeps["astro"]);
    config.port = 4321;
  } else if (allDeps["remix"] || allDeps["@remix-run/node"]) {
    config.framework = "Remix";
    config.frameworkVersion = cleanVersion(allDeps["@remix-run/node"] || allDeps["remix"]);
    config.port = 3000;
  } else if (allDeps["express"]) {
    config.framework = "Express";
    config.frameworkVersion = cleanVersion(allDeps["express"]);
    config.port = 3000;
  } else if (allDeps["fastify"]) {
    config.framework = "Fastify";
    config.frameworkVersion = cleanVersion(allDeps["fastify"]);
    config.port = 3000;
  } else if (allDeps["hono"]) {
    config.framework = "Hono";
    config.frameworkVersion = cleanVersion(allDeps["hono"]);
    config.port = 3000;
  }

  // Detect client-only SPAs (React/Vue/Vite without a server framework)
  // These produce static files and have no start script
  if (!config.framework && !pkg.scripts?.start) {
    const isSpa = (allDeps["react"] || allDeps["vue"] || allDeps["vite"] || allDeps["@vitejs/plugin-react"]);
    if (isSpa && pkg.scripts?.build) {
      config.framework = "SPA";
      config.frameworkVersion = cleanVersion(allDeps["react"] || allDeps["vue"] || allDeps["vite"] || "");
      config.port = 3000;
      config.features.add("static-export");
    }
  }

  // Build & start commands from scripts
  if (pkg.scripts?.build) config.buildCommand = `${config.packageManager === "npm" ? "npm run" : config.packageManager} build`;
  if (pkg.scripts?.start) config.startCommand = `${config.packageManager === "npm" ? "npm" : config.packageManager} start`;
  else if (pkg.scripts?.serve) config.startCommand = `${config.packageManager === "npm" ? "npm run" : config.packageManager} serve`;
  else if (pkg.main) config.startCommand = `node ${pkg.main}`;

  // Detect native dependencies
  for (const [depName, depInfo] of Object.entries(NATIVE_DEPS_MAP)) {
    if (allDeps[depName]) {
      config.nativeDeps.push({ name: depName, ...depInfo });
    }
  }

  // Check for websocket usage
  if (allDeps["socket.io"] || allDeps["ws"] || allDeps["@socket.io/redis-adapter"]) {
    config.features.add("websockets");
  }
}

// ─── PHP analyzer ───

function analyzePhpProject(appDir: string, config: RepoConfig) {
  let composer: any;
  try {
    composer = JSON.parse(readFileSync(join(appDir, "composer.json"), "utf-8"));
  } catch { return; }

  config.runtime = "php";
  config.packageManager = "composer";

  // PHP version from require.php
  const phpReq = composer?.require?.["php"];
  if (typeof phpReq === "string") {
    const matches = [...phpReq.matchAll(/(\d+)\.(\d+)/g)];
    if (matches.length > 0) {
      // Take the minimum version mentioned
      const versions = matches.map(m => ({ major: parseInt(m[1]), minor: parseInt(m[2]) }));
      const min = versions.reduce((a, b) => (a.major * 100 + a.minor < b.major * 100 + b.minor ? a : b));
      config.phpVersion = `${min.major}.${min.minor}`;
      config.runtimeVersion = config.phpVersion;
    }
  }
  if (!config.phpVersion) {
    config.phpVersion = "8.4";
    config.runtimeVersion = "8.4";
  }

  // Detect PHP extensions from require AND require-dev
  const extensions = new Set<string>();
  for (const section of [composer.require, composer["require-dev"]]) {
    if (!section) continue;
    for (const key of Object.keys(section)) {
      if (key.startsWith("ext-")) {
        const ext = key.replace("ext-", "");
        extensions.add(ext);
        if (NATIVE_DEPS_MAP[key]) {
          config.nativeDeps.push({ name: key, ...NATIVE_DEPS_MAP[key] });
        }
      }
    }
  }

  // Scan composer.lock for transitive extension requirements (e.g. box/spout → ext-zip)
  try {
    const lock = JSON.parse(readFileSync(join(appDir, "composer.lock"), "utf-8"));
    for (const pkg of [...(lock.packages || []), ...(lock["packages-dev"] || [])]) {
      if (!pkg.require) continue;
      for (const dep of Object.keys(pkg.require)) {
        if (dep.startsWith("ext-")) {
          const ext = dep.replace("ext-", "");
          if (!extensions.has(ext)) {
            extensions.add(ext);
            if (NATIVE_DEPS_MAP[`ext-${ext}`] && !config.nativeDeps.some(d => d.name === `ext-${ext}`)) {
              config.nativeDeps.push({ name: `ext-${ext}`, ...NATIVE_DEPS_MAP[`ext-${ext}`] });
            }
          }
        }
      }
    }
  } catch { /* no composer.lock — fall through to defaults */ }

  // For Laravel projects, ensure commonly-needed extensions are always present
  if (composer.require?.["laravel/framework"]) {
    for (const ext of ["zip", "intl", "bcmath", "pcntl", "pdo_mysql", "pdo_pgsql", "gd"]) {
      extensions.add(ext);
    }
  }

  config.phpExtensions = [...extensions];

  // Framework detection
  if (composer.require?.["laravel/framework"]) {
    config.framework = "Laravel";
    config.frameworkVersion = cleanVersion(composer.require["laravel/framework"]);
    config.port = 8080;
    config.buildCommand = "composer install --no-dev --optimize-autoloader && php artisan config:cache && php artisan route:cache && php artisan view:cache";
    config.startCommand = "php artisan serve --host=0.0.0.0 --port=8080";

    // Detect Laravel features
    if (composer.require?.["laravel/horizon"]) config.features.add("queue-worker");
    if (composer.require?.["laravel/reverb"] || composer.require?.["beyondcode/laravel-websockets"]) config.features.add("websockets");
    if (composer.require?.["laravel/octane"]) {
      config.features.add("octane");
      config.startCommand = "php artisan octane:start --host=0.0.0.0 --port=8080";
    }
    if (existsSync(join(appDir, "app/Console/Kernel.php"))) config.features.add("scheduler");
  } else if (composer.require?.["symfony/framework-bundle"]) {
    config.framework = "Symfony";
    config.frameworkVersion = cleanVersion(composer.require["symfony/framework-bundle"]);
    config.port = 8080;
  } else if (composer.require?.["craftcms/cms"]) {
    config.framework = "Craft CMS";
    config.port = 8080;
  }

  // Composer scripts
  if (composer.scripts) {
    config.composerScripts = Object.keys(composer.scripts);
  }

  // Check if there's a package.json for frontend asset building (Vite/Webpack/Mix)
  if (existsSync(join(appDir, "package.json"))) {
    config.features.add("node-assets");
    // Detect which node package manager the frontend uses
    if (existsSync(join(appDir, "pnpm-lock.yaml"))) config.features.add("node-pm-pnpm");
    else if (existsSync(join(appDir, "yarn.lock"))) config.features.add("node-pm-yarn");
  }
}

// ─── Python analyzer ───

function analyzePythonProject(appDir: string, config: RepoConfig) {
  config.runtime = "python";
  config.packageManager = "pip";

  // Try pyproject.toml first
  const pyprojectPath = join(appDir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, "utf-8");
      // Simple TOML parsing for python version
      const pyVerMatch = content.match(/requires-python\s*=\s*["']>=?(\d+\.\d+)/);
      if (pyVerMatch) config.pythonVersion = pyVerMatch[1];

      // Detect framework from dependencies
      if (content.includes("django")) { config.framework = "Django"; config.port = 8000; }
      else if (content.includes("fastapi")) { config.framework = "FastAPI"; config.port = 8000; }
      else if (content.includes("flask")) { config.framework = "Flask"; config.port = 5000; }
    } catch {}
  }

  // Try requirements.txt
  const reqPath = join(appDir, "requirements.txt");
  if (existsSync(reqPath)) {
    try {
      const content = readFileSync(reqPath, "utf-8");
      if (content.includes("Django")) { config.framework = "Django"; config.port = 8000; }
      else if (content.includes("fastapi")) { config.framework = "FastAPI"; config.port = 8000; }
      else if (content.includes("flask") || content.includes("Flask")) { config.framework = "Flask"; config.port = 5000; }

      // Detect gunicorn/uvicorn
      if (content.includes("gunicorn")) config.startCommand = "gunicorn";
      if (content.includes("uvicorn")) config.startCommand = "uvicorn";
    } catch {}
  }

  // Try runtime.txt for Python version
  const runtimePath = join(appDir, "runtime.txt");
  if (existsSync(runtimePath)) {
    try {
      const v = readFileSync(runtimePath, "utf-8").trim();
      const match = v.match(/python-(\d+\.\d+)/);
      if (match) config.pythonVersion = match[1];
    } catch {}
  }

  config.runtimeVersion = config.pythonVersion || "3.12";
  if (!config.pythonVersion) config.pythonVersion = "3.12";
}

// ─── Go analyzer ───

function analyzeGoProject(appDir: string, config: RepoConfig) {
  config.runtime = "go";
  config.packageManager = "go";

  try {
    const goMod = readFileSync(join(appDir, "go.mod"), "utf-8");
    const verMatch = goMod.match(/^go\s+(\d+\.\d+)/m);
    if (verMatch) {
      config.goVersion = verMatch[1];
      config.runtimeVersion = verMatch[1];
    }
  } catch {}

  if (!config.goVersion) {
    config.goVersion = "1.22";
    config.runtimeVersion = "1.22";
  }

  config.port = 8080;
  config.buildCommand = "go build -o app .";
  config.startCommand = "./app";
}

// ─── Dockerfile generator ───

export function generateDockerfile(config: RepoConfig): string {
  switch (config.runtime) {
    case "node": return generateNodeDockerfile(config);
    case "php": return generatePhpDockerfile(config);
    case "python": return generatePythonDockerfile(config);
    case "go": return generateGoDockerfile(config);
    default: return generateNodeDockerfile(config); // fallback
  }
}

function generateNodeDockerfile(config: RepoConfig): string {
  const nodeVer = config.nodeVersion || config.runtimeVersion || "20";
  const pm = config.packageManager === "unknown" ? "npm" : config.packageManager;
  const pmVer = config.packageManagerVersion;
  const copyPrefix = config.subDir ? `${config.subDir}/` : "";
  const lines: string[] = [];

  // ── Builder stage ──
  lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim AS builder`);
  lines.push("WORKDIR /app");

  // Install system deps for native modules (build stage only)
  const buildAptPkgs = new Set<string>();
  for (const dep of config.nativeDeps) {
    for (const pkg of dep.aptPackages) buildAptPkgs.add(pkg);
  }
  if (buildAptPkgs.size > 0) {
    lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...buildAptPkgs].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);
  }

  // Copy lockfile + package.json, install deps
  if (pm === "pnpm") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}pnpm-lock.yaml* ./`);
    lines.push(`RUN corepack enable && corepack prepare pnpm@${pmVer || "9.15.0"} --activate`);
    lines.push("RUN pnpm install --no-frozen-lockfile");
  } else if (pm === "yarn") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}yarn.lock* ./`);
    lines.push("RUN corepack enable");
    lines.push("RUN yarn install --immutable || yarn install");
  } else if (pm === "bun") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}bun.lockb* ./`);
    lines.push("RUN npm i -g bun && bun install");
  } else {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}package-lock.json* ./`);
    lines.push("RUN npm ci || npm install");
  }

  lines.push(`COPY ${copyPrefix}. .`);
  lines.push(`RUN ${pm === "npm" ? "npm run" : pm} build`);

  // ── Production stage ──
  lines.push("");
  lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim`);
  lines.push("WORKDIR /app");

  // Install runtime system deps (only the ones needed at runtime, not build tools)
  const runtimeAptPkgs = new Set<string>();
  for (const dep of config.nativeDeps) {
    // Skip build-only deps (make, g++, python3)
    for (const pkg of dep.aptPackages.filter(p => !["make", "g++", "python3"].includes(p))) {
      runtimeAptPkgs.add(pkg);
    }
  }
  if (runtimeAptPkgs.size > 0) {
    lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...runtimeAptPkgs].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);
  }

  // Copy built app
  if (config.framework === "Next.js" && config.hasStandalone) {
    lines.push("COPY --from=builder /app/.next/standalone ./");
    lines.push("COPY --from=builder /app/.next/static ./.next/static");
    lines.push("COPY --from=builder /app/public ./public");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", "server.js"]');
  } else if (config.framework === "Next.js") {
    lines.push("COPY --from=builder /app/node_modules ./node_modules");
    lines.push("COPY --from=builder /app/.next ./.next");
    lines.push("COPY --from=builder /app/public ./public");
    lines.push("COPY --from=builder /app/package.json ./");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    // Use next directly from node_modules — pnpm/yarn aren't installed in production stage
    lines.push('CMD ["node_modules/.bin/next", "start"]');
  } else if (config.framework === "Nuxt" && config.features.has("static-export")) {
    // Nuxt static site — serve pre-rendered files with a minimal server
    lines.push("FROM public.ecr.aws/docker/library/node:${nodeVer}-slim".replace("${nodeVer}", nodeVer));
    lines.push("WORKDIR /app");
    lines.push("RUN npm i -g serve");
    lines.push("COPY --from=builder /app/.output/public ./public");
    lines.push('ENV PORT=3000');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["serve", "public", "-l", "3000", "-s"]');
  } else if (config.framework === "Nuxt") {
    // Nuxt SSR — self-contained Nitro server
    lines.push("COPY --from=builder /app/.output ./.output");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", ".output/server/index.mjs"]');
  } else if (config.framework === "SPA") {
    // Client-only SPA (React/Vue/Vite) — serve static build output
    lines.push("RUN npm i -g serve");
    // Copy whichever build output dir exists (Vite→dist, CRA→build)
    lines.push("COPY --from=builder /app/package.json ./");
    lines.push("RUN --mount=from=builder,source=/app,target=/builder \\\n    if [ -d /builder/dist ]; then cp -r /builder/dist ./dist; elif [ -d /builder/build ]; then cp -r /builder/build ./build; fi");
    lines.push("ENV PORT=3000");
    lines.push("EXPOSE 3000");
    lines.push('CMD ["sh", "-c", "if [ -d dist ]; then serve dist -l 3000 -s; else serve build -l 3000 -s; fi"]');
  } else {
    lines.push("COPY --from=builder /app .");
    lines.push(`ENV PORT=${config.port}`);
    lines.push(`EXPOSE ${config.port}`);
    if (config.startCommand) {
      lines.push(`CMD ${JSON.stringify(config.startCommand.split(" "))}`);
    } else if (pm === "pnpm" || pm === "yarn") {
      // pnpm/yarn aren't in the slim production image — enable via corepack
      lines.push("RUN corepack enable");
      lines.push(`CMD ["${pm}", "start"]`);
    } else {
      lines.push('CMD ["npm", "start"]');
    }
  }

  return lines.join("\n") + "\n";
}

function generatePhpDockerfile(config: RepoConfig): string {
  const phpVer = config.phpVersion || "8.4";
  const copyPrefix = config.subDir ? `${config.subDir}/` : "";
  const lines: string[] = [];

  // ── Composer stage ──
  lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-cli AS composer`);
  lines.push("WORKDIR /app");

  // Install system deps for PHP extensions
  const aptPkgs = new Set(["curl", "git", "unzip"]);
  for (const dep of config.nativeDeps) {
    for (const pkg of dep.aptPackages) aptPkgs.add(pkg);
  }
  // Common PHP extension deps
  for (const ext of config.phpExtensions) {
    if (ext === "gd") { aptPkgs.add("libpng-dev"); aptPkgs.add("libjpeg-dev"); aptPkgs.add("libfreetype6-dev"); }
    if (ext === "pgsql" || ext === "pdo_pgsql") aptPkgs.add("libpq-dev");
    if (ext === "zip") aptPkgs.add("libzip-dev");
    if (ext === "intl") aptPkgs.add("libicu-dev");
    if (ext === "imagick") aptPkgs.add("libmagickwand-dev");
    if (ext === "soap" || ext === "xmlrpc") aptPkgs.add("libxml2-dev");
  }

  lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...aptPkgs].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);

  // Install PHP extensions
  if (config.phpExtensions.length > 0) {
    // Extensions already bundled in the official php Docker image — skip these
    const BUILTIN_EXTS = new Set([
      "ctype", "curl", "date", "dom", "fileinfo", "filter", "ftp", "hash",
      "iconv", "json", "libxml", "mbstring", "mysqlnd", "openssl", "pcre",
      "pdo", "phar", "posix", "readline", "reflection", "session", "simplexml",
      "sodium", "spl", "standard", "tokenizer", "xml", "xmlreader", "xmlwriter",
      "zlib",
    ]);
    // PECL extensions need pecl install instead of docker-php-ext-install
    const PECL_EXTS = new Set(["imagick", "redis", "xdebug", "apcu", "memcached", "swoole", "mongodb"]);

    const installable = config.phpExtensions.filter(e => !BUILTIN_EXTS.has(e) && !PECL_EXTS.has(e));
    const pecl = config.phpExtensions.filter(e => PECL_EXTS.has(e));

    // Configure gd with freetype/jpeg support before installing
    if (installable.includes("gd")) {
      lines.push("RUN docker-php-ext-configure gd --with-freetype --with-jpeg");
    }
    if (installable.length > 0) {
      lines.push(`RUN docker-php-ext-install ${installable.join(" ")}`);
    }
    for (const ext of pecl) {
      lines.push(`RUN pecl install ${ext} && docker-php-ext-enable ${ext}`);
    }
  }

  lines.push("RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer");
  lines.push(`COPY ${copyPrefix}composer.json ${copyPrefix}composer.lock* ./`);
  lines.push("RUN composer install --no-interaction --optimize-autoloader --no-dev --prefer-dist --no-scripts --ignore-platform-reqs");

  // ── Node build stage (if package.json exists for frontend assets) ──
  // If the PHP project also has Node.js features (e.g. Vite/Webpack for asset building)
  const hasNodeAssets = config.features.has("node-assets");
  if (hasNodeAssets) {
    // Use the node package manager detected during analysis (stored in features)
    const nodePm = config.features.has("node-pm-pnpm") ? "pnpm"
      : config.features.has("node-pm-yarn") ? "yarn" : "npm";
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

  // ── Production stage ──
  lines.push("");
  lines.push(`FROM public.ecr.aws/docker/library/php:${phpVer}-cli`);
  lines.push("WORKDIR /app");

  // Re-install system libs and PHP extensions in production stage
  // PHP Docker image Debian versions: 7.x/8.0/8.1 → Bullseye, 8.2/8.3 → Bookworm, 8.4+ → Trixie
  const phpMajMin = parseFloat(phpVer) || 8.4;
  const isBullseye = phpMajMin < 8.2;
  const isTrixie = phpMajMin >= 8.4;
  const runtimeAptPkgs = new Set<string>();
  // Only runtime libs (not -dev packages, not build tools)
  for (const ext of config.phpExtensions) {
    if (ext === "gd") {
      runtimeAptPkgs.add(isTrixie ? "libpng16-16t64" : "libpng16-16");
      runtimeAptPkgs.add("libjpeg62-turbo");
      runtimeAptPkgs.add("libfreetype6");
    }
    if (ext === "pgsql" || ext === "pdo_pgsql") runtimeAptPkgs.add("libpq5");
    if (ext === "zip") runtimeAptPkgs.add(isTrixie ? "libzip5" : "libzip4");
    if (ext === "intl") runtimeAptPkgs.add(isBullseye ? "libicu67" : isTrixie ? "libicu76" : "libicu72");
    if (ext === "imagick") runtimeAptPkgs.add(isBullseye ? "libmagickwand-6.q16-6" : "libmagickwand-6.q16-7");
  }
  if (runtimeAptPkgs.size > 0) {
    lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...runtimeAptPkgs].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);
  }

  // Copy compiled extensions from composer stage
  lines.push("COPY --from=composer /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/");
  lines.push("COPY --from=composer /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/");

  lines.push("COPY --from=composer /app/vendor ./vendor");
  if (hasNodeAssets) {
    lines.push("COPY --from=node-builder /app/public ./public");
  }
  lines.push(`COPY ${copyPrefix}. .`);
  lines.push(`ENV PORT=${config.port}`);
  lines.push(`EXPOSE ${config.port}`);
  lines.push(`CMD ${JSON.stringify((config.startCommand || "php artisan serve --host=0.0.0.0 --port=8080").split(" "))}`);

  return lines.join("\n") + "\n";
}

function generatePythonDockerfile(config: RepoConfig): string {
  const pyVer = config.pythonVersion || "3.12";
  const lines: string[] = [];

  lines.push(`FROM public.ecr.aws/docker/library/python:${pyVer}-slim`);
  lines.push("WORKDIR /app");
  lines.push("RUN pip install --no-cache-dir --upgrade pip");

  // The analyzer already detected the project type; generate appropriate install commands
  lines.push("COPY requirements.txt* pyproject.toml* Pipfile* ./");
  lines.push("RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; elif [ -f Pipfile ]; then pip install pipenv && pipenv install --system --deploy; fi");

  lines.push("COPY . .");
  lines.push(`ENV PORT=${config.port}`);
  lines.push(`EXPOSE ${config.port}`);

  if (config.framework === "Django") {
    lines.push(`CMD ["gunicorn", "--bind", "0.0.0.0:${config.port}", "config.wsgi:application"]`);
  } else if (config.framework === "FastAPI") {
    lines.push(`CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${config.port}"]`);
  } else if (config.framework === "Flask") {
    lines.push(`CMD ["gunicorn", "--bind", "0.0.0.0:${config.port}", "app:app"]`);
  } else {
    lines.push(`CMD ["python", "main.py"]`);
  }

  return lines.join("\n") + "\n";
}

function generateGoDockerfile(config: RepoConfig): string {
  const goVer = config.goVersion || "1.22";
  const lines: string[] = [];

  lines.push(`FROM public.ecr.aws/docker/library/golang:${goVer}-alpine AS builder`);
  lines.push("WORKDIR /app");
  lines.push("COPY go.mod go.sum* ./");
  lines.push("RUN go mod download");
  lines.push("COPY . .");
  lines.push("RUN CGO_ENABLED=0 go build -o app .");

  lines.push("");
  lines.push("FROM public.ecr.aws/docker/library/alpine:latest");
  lines.push("RUN apk --no-cache add ca-certificates");
  lines.push("WORKDIR /app");
  lines.push("COPY --from=builder /app/app .");
  lines.push(`ENV PORT=${config.port}`);
  lines.push(`EXPOSE ${config.port}`);
  lines.push('CMD ["./app"]');

  return lines.join("\n") + "\n";
}

// ─── Helpers ───

function cleanVersion(v: string): string {
  if (!v) return "";
  return v.replace(/^[\^~>=<]+/, "").split(" ")[0];
}

// ─── Summary for logging ───

export function configSummary(config: RepoConfig): string[] {
  const lines: string[] = [];
  lines.push(`Runtime: ${config.runtime} ${config.runtimeVersion}`);
  if (config.framework) lines.push(`Framework: ${config.framework} ${config.frameworkVersion}`);
  lines.push(`Package manager: ${config.packageManager}${config.packageManagerVersion ? ` v${config.packageManagerVersion}` : ""}`);
  if (config.subDir) lines.push(`App directory: ${config.subDir}/`);
  if (config.nodeVersion) lines.push(`Node.js version: ${config.nodeVersion}`);
  if (config.phpVersion) lines.push(`PHP version: ${config.phpVersion}`);
  if (config.phpExtensions.length > 0) lines.push(`PHP extensions: ${config.phpExtensions.join(", ")}`);
  if (config.nativeDeps.length > 0) lines.push(`Native deps: ${config.nativeDeps.map(d => `${d.name} (${d.reason})`).join(", ")}`);
  if (config.hasStandalone) lines.push("Next.js standalone output: yes");
  if (config.features.size > 0) lines.push(`Features: ${[...config.features].join(", ")}`);
  return lines;
}

// ─── Docker build error parser & auto-fixer ───

export interface DockerFix {
  patched: string;       // The patched Dockerfile content
  description: string;   // Human-readable description of what was fixed
}

/**
 * Parses Docker build error output and attempts to patch the Dockerfile.
 * Returns null if the error is not fixable automatically.
 */
export function patchDockerfile(buildOutput: string, currentDockerfile: string): DockerFix | null {
  const fixes: string[] = [];
  let df = currentDockerfile;

  // ── 1. Missing PHP extensions (composer install / runtime errors) ──
  // Pattern: "requires ext-XYZ * -> it is missing from your system"
  const missingExts = [...buildOutput.matchAll(/requires\s+ext-(\w+)\s+\*/g)].map(m => m[1]);
  // Pattern: "Install or enable PHP's XYZ extension"
  const missingExts2 = [...buildOutput.matchAll(/enable PHP's (\w+) extension/g)].map(m => m[1]);
  // Pattern: "the requested PHP extension XYZ is missing"
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

    // Map extensions to their -dev apt packages
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
    // Runtime lib equivalents (for production stage)
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

        // Inject apt packages for new extensions into the existing apt-get line (composer stage)
        if (line.includes("apt-get install") && line.includes("apt-get update") && !line.includes("FROM")) {
          const newAptPkgs: string[] = [];
          for (const ext of toInstall) {
            if (EXT_APT[ext]) newAptPkgs.push(...EXT_APT[ext]);
          }
          if (newAptPkgs.length > 0) {
            // Insert new packages before "&& rm -rf"
            const patched = line.replace(
              /&&\s*rm\s+-rf/,
              `${newAptPkgs.join(" ")} && rm -rf`
            );
            newLines.push(patched);
            continue;
          }
        }

        // Inject new docker-php-ext-install after existing one
        if (line.startsWith("RUN docker-php-ext-install") && newDockerExt.length > 0) {
          // Append new extensions to the existing install line
          const existing = line.replace("RUN docker-php-ext-install ", "").trim().split(/\s+/);
          const merged = [...new Set([...existing, ...newDockerExt])];
          // Add configure for gd if newly added
          if (newDockerExt.includes("gd") && !df.includes("docker-php-ext-configure gd")) {
            newLines.push("RUN docker-php-ext-configure gd --with-freetype --with-jpeg");
          }
          newLines.push(`RUN docker-php-ext-install ${merged.join(" ")}`);
          // Add pecl installs right after
          for (const ext of newPecl) {
            if (!df.includes(`pecl install ${ext}`)) {
              newLines.push(`RUN pecl install ${ext} && docker-php-ext-enable ${ext}`);
            }
          }
          newDockerExt.length = 0; // consumed
          newPecl.length = 0;
          continue;
        }

        newLines.push(line);

        // If we reach composer install and haven't injected extensions yet (no existing docker-php-ext-install line)
        if (line.includes("getcomposer.org") && newDockerExt.length > 0) {
          if (newDockerExt.includes("gd")) {
            newLines.push("RUN docker-php-ext-configure gd --with-freetype --with-jpeg");
          }
          newLines.push(`RUN docker-php-ext-install ${newDockerExt.join(" ")}`);
          for (const ext of newPecl) {
            newLines.push(`RUN pecl install ${ext} && docker-php-ext-enable ${ext}`);
          }
          newDockerExt.length = 0;
          newPecl.length = 0;
        }

        // Inject runtime apt packages in production stage
        if (!line.match(/^FROM (?:public\.ecr\.aws\/docker\/library\/)?php:.+ AS\b/i) && line.match(/^FROM (?:public\.ecr\.aws\/docker\/library\/)?php:/i) && !line.includes("AS ")) {
          // This is the production FROM line — inject runtime libs after WORKDIR
          const nextLine = lines[i + 1];
          if (nextLine?.startsWith("WORKDIR")) {
            newLines.push(nextLine);
            i++; // skip WORKDIR, we already pushed it
            const runtimePkgs: string[] = [];
            for (const ext of toInstall) {
              if (EXT_RUNTIME_APT[ext]) runtimePkgs.push(...EXT_RUNTIME_APT[ext]);
            }
            if (runtimePkgs.length > 0) {
              // Check if there's already a runtime apt-get line
              const existingRuntimeApt = lines.slice(i + 1).find(l => l.includes("apt-get install") && l.includes("apt-get update"));
              if (existingRuntimeApt) {
                // We'll patch it when we encounter it
              } else {
                newLines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...new Set(runtimePkgs)].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);
              }
            }
          }
        }

        // Patch existing runtime apt-get line
        if (line.includes("apt-get install") && line.includes("apt-get update") && i > lines.indexOf(lines.find(l => /^FROM (?:public\.ecr\.aws\/docker\/library\/)?php:/.test(l) && !l.includes("AS ")) || "")) {
          const runtimePkgs: string[] = [];
          for (const ext of toInstall) {
            if (EXT_RUNTIME_APT[ext]) runtimePkgs.push(...EXT_RUNTIME_APT[ext]);
          }
          if (runtimePkgs.length > 0) {
            const patched = newLines[newLines.length - 1].replace(
              /&&\s*rm\s+-rf/,
              `${runtimePkgs.join(" ")} && rm -rf`
            );
            newLines[newLines.length - 1] = patched;
          }
        }
      }

      df = newLines.join("\n");
      fixes.push(`Added PHP extensions: ${toInstall.join(", ")}`);
    }

    // If composer install failed and we don't have --ignore-platform-reqs, add it
    if (!df.includes("--ignore-platform-reqs") && buildOutput.includes("composer install")) {
      df = df.replace(
        /RUN composer install([^\n]*)/g,
        "RUN composer install$1 --ignore-platform-reqs"
      );
      fixes.push("Added --ignore-platform-reqs to composer install");
    }
  }

  // ── 2. Missing system packages (apt/apk) ──
  // Pattern: "Unable to locate package XYZ" — wrong package name for this Debian version
  const unlocatable = [...buildOutput.matchAll(/Unable to locate package (\S+)/g)].map(m => m[1]);
  if (unlocatable.length > 0) {
    // Try to map to the correct package name or remove it
    // Common version-dependent packages: libicu67 (Bullseye) vs libicu72 (Bookworm)
    const FALLBACK_MAP: Record<string, string[]> = {
      libicu72: ["libicu-dev"],   // -dev works on all versions
      libicu67: ["libicu-dev"],
      "libmagickwand-6.q16-7": ["libmagickwand-dev"],
      "libmagickwand-6.q16-6": ["libmagickwand-dev"],
    };
    for (const pkg of unlocatable) {
      const fallback = FALLBACK_MAP[pkg];
      if (fallback) {
        df = df.replace(new RegExp(pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), fallback.join(" "));
        fixes.push(`Replaced ${pkg} with ${fallback.join(", ")} (Debian version mismatch)`);
      } else {
        // Remove the package entirely — better to succeed without it than fail
        df = df.replace(new RegExp(`\\s*${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "");
        fixes.push(`Removed unavailable package: ${pkg}`);
      }
    }
  }

  // Pattern: "No package 'libXYZ' found" (pkg-config)
  const missingPkgConfig = [...buildOutput.matchAll(/No package '([^']+)' found/g)].map(m => m[1]);
  if (missingPkgConfig.length > 0) {
    // Map pkg-config names to apt packages
    const PKG_CONFIG_MAP: Record<string, string> = {
      libcurl: "libcurl4-openssl-dev",
      libpng: "libpng-dev", libjpeg: "libjpeg-dev",
      freetype2: "libfreetype6-dev", libwebp: "libwebp-dev",
      libzip: "libzip-dev", icu: "libicu-dev", "icu-uc": "libicu-dev", "icu-i18n": "libicu-dev",
      libpq: "libpq-dev", libxml: "libxml2-dev", "libxml-2.0": "libxml2-dev",
      libxslt: "libxslt1-dev", libffi: "libffi-dev",
      openssl: "libssl-dev", zlib: "zlib1g-dev",
      libsodium: "libsodium-dev", libyaml: "libyaml-dev",
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
      // Add to the first apt-get install line
      df = df.replace(
        /(apt-get install -y --no-install-recommends\s+)([^&]+)(&&\s*rm\s+-rf)/,
        `$1$2${aptToAdd.join(" ")} $3`
      );
      fixes.push(`Added system packages: ${aptToAdd.join(", ")}`);
    }
  }

  // ── 3. npm/pnpm/yarn install failures ──
  // Pattern: npm ci fails when no package-lock.json exists
  if (buildOutput.includes("npm ci` can only install") || buildOutput.includes("npm ci can only install")) {
    df = df.replace(/RUN npm ci \|\| npm install/g, "RUN npm install");
    df = df.replace(/RUN npm ci(?!\s*\|)/g, "RUN npm install");
    fixes.push("Replaced npm ci with npm install (no lockfile)");
  }
  // Pattern: node-gyp fails because python/make/g++ are missing
  if (buildOutput.includes("not found: python") || buildOutput.includes("gyp ERR") || buildOutput.includes("node-gyp")) {
    // Add python3, make, g++ to the node-builder stage
    const nodeBuilderFrom = df.match(/FROM (?:public\.ecr\.aws\/docker\/library\/)?node:\S+ AS node-builder/);
    if (nodeBuilderFrom) {
      const fromLine = nodeBuilderFrom[0];
      if (!df.includes("python3") || !df.includes("make")) {
        df = df.replace(
          fromLine + "\nWORKDIR /app",
          fromLine + "\nWORKDIR /app\nRUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*"
        );
        fixes.push("Added python3/make/g++ to node-builder for native modules");
      }
    }
  }
  // Pattern: "ERR_PNPM_FROZEN_LOCKFILE" — lockfile out of sync
  if (buildOutput.includes("ERR_PNPM_FROZEN_LOCKFILE")) {
    df = df.replace(/pnpm install --frozen-lockfile/g, "pnpm install --no-frozen-lockfile");
    fixes.push("Relaxed pnpm frozen lockfile (lockfile out of sync)");
  }
  // Pattern: "error Couldn't find an integrity file" (yarn)
  if (buildOutput.includes("Couldn't find an integrity file") || buildOutput.includes("--check-files")) {
    df = df.replace(/yarn install --immutable/g, "yarn install");
    fixes.push("Relaxed yarn immutable install");
  }
  // Pattern: "npm ERR! could not determine executable to run" — corepack issue
  if (buildOutput.includes("could not determine executable to run") || buildOutput.includes("COREPACK_ENABLE_STRICT")) {
    df = df.replace(/RUN corepack enable/g, "RUN corepack enable\nENV COREPACK_ENABLE_STRICT=0");
    fixes.push("Disabled corepack strict mode");
  }

  // ── 4. Python pip failures ──
  // Pattern: "Could not find a version that satisfies the requirement"
  if (buildOutput.includes("Could not find a version") && df.includes("pip install")) {
    // Try adding --pre flag for pre-release packages
    if (!df.includes("--pre")) {
      df = df.replace(/(pip install --no-cache-dir -r requirements\.txt)/g, "$1 || pip install --no-cache-dir --pre -r requirements.txt");
      fixes.push("Added pip --pre fallback for pre-release packages");
    }
  }

  // ── 5. Node.js build failures — missing build script ──
  if (buildOutput.includes('Missing script: "build"') || buildOutput.includes("missing script: build")) {
    // Remove the build step entirely — app doesn't need building
    df = df.replace(/\nRUN (?:npm run|pnpm|yarn) build\n/g, "\n");
    fixes.push("Removed build step (no build script found)");
  }

  // ── 6. Go build failures ──
  // Pattern: "cannot find module providing package"
  const missingGoMod = buildOutput.match(/cannot find module providing package ([^\s]+)/);
  if (missingGoMod) {
    // Ensure go mod tidy runs before build
    if (!df.includes("go mod tidy")) {
      df = df.replace(/RUN CGO_ENABLED=0 go build/g, "RUN go mod tidy\nRUN CGO_ENABLED=0 go build");
      fixes.push("Added go mod tidy before build");
    }
  }

  // ── 7. Permission errors ──
  if (buildOutput.includes("EACCES") || buildOutput.includes("permission denied")) {
    // Add --unsafe-perm for npm or run as root explicitly
    if (df.includes("npm ci") && !df.includes("--unsafe-perm")) {
      df = df.replace(/npm ci/g, "npm ci --unsafe-perm");
      fixes.push("Added --unsafe-perm to npm ci");
    }
  }

  // ── 8. Memory issues ──
  if (buildOutput.includes("ENOMEM") || buildOutput.includes("JavaScript heap out of memory")) {
    if (!df.includes("NODE_OPTIONS")) {
      df = df.replace(/(RUN (?:npm run|pnpm|yarn) build)/g, 'ENV NODE_OPTIONS="--max-old-space-size=4096"\n$1');
      fixes.push("Increased Node.js memory limit to 4GB");
    }
  }

  if (fixes.length === 0) return null;
  return { patched: df, description: fixes.join("; ") };
}

// ─── Railpack image builder ───

export interface RailpackBuildResult {
  success: boolean;
  imageName: string;
  output: string;
}

/**
 * Builds a container image using Railpack (zero-config builder by Railway).
 * Falls back to Dockerfile generation if Railpack is not installed or fails.
 */
export async function buildWithRailpack(
  repoDir: string,
  imageName: string,
  opts?: { env?: Record<string, string> }
): Promise<RailpackBuildResult> {
  const { spawn } = await import("node:child_process");

  const runCmd = (cmd: string, args: string[], cwd: string): Promise<{ code: number; output: string }> =>
    new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...opts?.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
      proc.on("close", (code) => resolve({ code: code ?? 1, output }));
      proc.on("error", (err) => resolve({ code: 1, output: err.message }));
    });

  // Check if railpack CLI is available
  const check = await runCmd("railpack", ["--version"], repoDir);
  if (check.code !== 0) {
    return { success: false, imageName, output: "Railpack CLI not found. Install it with: cargo install railpack" };
  }

  // Build the image
  const result = await runCmd("railpack", ["build", "--name", imageName, "."], repoDir);
  return {
    success: result.code === 0,
    imageName,
    output: result.output,
  };
}

/**
 * Returns true if the Railpack CLI is available on the system.
 */
export async function isRailpackAvailable(): Promise<boolean> {
  const { execSync } = await import("node:child_process");
  try {
    execSync("railpack --version", { timeout: 5_000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ─── Nixpacks image builder ───

export interface NixpacksBuildResult {
  success: boolean;
  imageName: string;
  output: string;
}

/**
 * Builds a container image using Nixpacks (zero-config builder by Railway).
 * Falls back to Dockerfile generation if Nixpacks is not installed or fails.
 */
export async function buildWithNixpacks(
  repoDir: string,
  imageName: string,
  opts?: { env?: Record<string, string> }
): Promise<NixpacksBuildResult> {
  const { spawn } = await import("node:child_process");

  const runCmd = (cmd: string, args: string[], cwd: string): Promise<{ code: number; output: string }> =>
    new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...opts?.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
      proc.on("close", (code) => resolve({ code: code ?? 1, output }));
      proc.on("error", (err) => resolve({ code: 1, output: err.message }));
    });

  // Check if nixpacks CLI is available
  const check = await runCmd("nixpacks", ["--version"], repoDir);
  if (check.code !== 0) {
    return { success: false, imageName, output: "Nixpacks CLI not found. Install it with: curl -sSL https://nixpacks.com/install.sh | bash" };
  }

  // Build the image
  const result = await runCmd("nixpacks", ["build", "--name", imageName, "."], repoDir);
  return {
    success: result.code === 0,
    imageName,
    output: result.output,
  };
}

/**
 * Returns true if the Nixpacks CLI is available on the system.
 */
export async function isNixpacksAvailable(): Promise<boolean> {
  const { execSync } = await import("node:child_process");
  try {
    execSync("nixpacks --version", { timeout: 5_000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
