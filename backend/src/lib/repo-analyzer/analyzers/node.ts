import type { RepoConfig } from "../types.js";
import type { RepoFiles } from "../repo-files.js";
import { joinPath } from "../repo-files.js";
import { NATIVE_DEPS_MAP } from "../constants.js";
import { cleanVersion } from "../utils.js";

interface NodePackageJson {
  engines?: { node?: string };
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: { start?: string; build?: string; serve?: string };
  main?: string;
  workspaces?: string[] | { packages: string[] };
}

/**
 * Analyze a Node.js project. `appDir` is the app subdirectory relative to the
 * repo root ("" when at root); lockfiles are additionally checked at the repo
 * root to support monorepos whose lockfile lives above the app.
 */
export function analyzeNodeProject(files: RepoFiles, appDir: string, config: RepoConfig) {
  const inApp = (name: string) => joinPath(appDir, name);
  const readApp = (name: string) => files.read(inApp(name));
  const existsApp = (name: string) => files.exists(inApp(name));
  const existsRoot = (name: string) => files.exists(name);

  let pkg: NodePackageJson;
  const pkgRaw = readApp("package.json");
  if (pkgRaw === null) return;
  try {
    pkg = JSON.parse(pkgRaw);
  } catch { return; }

  config.runtime = "node";

  // Node version from engines
  if (pkg.engines?.node) {
    const match = (pkg.engines.node as string).match(/(\d+)/);
    if (match) config.nodeVersion = match[1];
  }
  config.runtimeVersion = config.nodeVersion || "20";

  // Package manager
  if (pkg.packageManager) {
    const [pm, ver] = (pkg.packageManager as string).split("@");
    config.packageManager = pm as RepoConfig["packageManager"];
    config.packageManagerVersion = ver?.split("+")[0] || "";
  } else if (existsApp("pnpm-lock.yaml") || existsRoot("pnpm-lock.yaml")) {
    config.packageManager = "pnpm";
    config.packageManagerVersion = "10.14.0";
  } else if (existsApp("yarn.lock") || existsRoot("yarn.lock")) {
    config.packageManager = "yarn";
    config.packageManagerVersion = "4.5.0";
  } else if (existsApp("bun.lockb")) {
    config.packageManager = "bun";
  } else {
    config.packageManager = "npm";
  }

  // Detect workspace (pnpm-workspace.yaml or yarn workspaces in package.json)
  if (existsApp("pnpm-workspace.yaml") || existsRoot("pnpm-workspace.yaml")) {
    config.features.add("workspace");
  } else if (pkg.workspaces) {
    config.features.add("workspace");
  }

  // Framework detection from dependencies
  const allDeps: Record<string, string> = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  const hasPayload = Object.keys(allDeps).some(
    (dep) => dep === "payload" || dep.startsWith("@payloadcms/"),
  );
  if (hasPayload) config.features.add("payload");

  if (allDeps["next"]) {
    config.framework = "nextjs";
    config.frameworkVersion = cleanVersion(allDeps["next"]);
    config.port = 3000;
    for (const cfgName of ["next.config.ts", "next.config.mjs", "next.config.js"]) {
      const content = readApp(cfgName);
      if (content !== null) {
        config.hasStandalone = content.includes("standalone");
        if (content.includes("output:") && content.includes("export")) config.features.add("static-export");
        if (content.includes("serverActions") || content.includes("server actions")) config.features.add("server-actions");
        break;
      }
    }
    if (existsApp("app/api") || existsApp("pages/api")) {
      config.features.add("api-routes");
    }
    config.features.add("ssr");
  } else if (allDeps["nuxt"]) {
    config.framework = "nuxt";
    config.frameworkVersion = cleanVersion(allDeps["nuxt"]);
    config.port = 3000;
    let isStatic = false;
    for (const cfgName of ["nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.js"]) {
      const content = readApp(cfgName);
      if (content !== null) {
        if (/nitro\s*:\s*\{[^}]*preset\s*:\s*['"]static['"]/.test(content)
          || /ssr\s*:\s*false/.test(content)
          || /preset\s*:\s*['"]static['"]/.test(content)) {
          isStatic = true;
        }
        break;
      }
    }
    if (isStatic) {
      config.features.add("static-export");
    } else {
      config.features.add("ssr");
    }
  } else if (allDeps["@angular/core"]) {
    config.framework = "angular";
    config.frameworkVersion = cleanVersion(allDeps["@angular/core"]);
    config.port = 3000;
    config.features.add("static-export");
  } else if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) {
    config.framework = "sveltekit";
    config.frameworkVersion = cleanVersion(allDeps["@sveltejs/kit"] || allDeps["svelte"]);
    config.port = 3000;
  } else if (allDeps["astro"]) {
    config.framework = "astro";
    config.frameworkVersion = cleanVersion(allDeps["astro"]);
    config.port = 3000;

    // Read astro.config.* once: it carries BOTH the output mode and the adapter.
    // The adapter must be detected from the config as well as from
    // package.json, because in a monorepo the adapter dependency often lives in
    // a workspace package rather than the app's own manifest — checking deps
    // alone misses it and we'd wrongly treat an SSR app as static.
    let astroConfig = "";
    for (const cfgName of ["astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.mts", "astro.config.cjs"]) {
      const content = readApp(cfgName);
      if (content !== null) {
        astroConfig = content;
        break;
      }
    }

    const configSaysServer = /output\s*:\s*['"](server|hybrid)['"]/.test(astroConfig);
    const nodeAdapter = Boolean(allDeps["@astrojs/node"]) || /@astrojs\/node/.test(astroConfig);
    // Platform adapters build for a host-specific runtime (a serverless handler),
    // NOT a self-runnable Node server — so we must never synthesize a node entry
    // for them.
    const platformAdapter =
      Boolean(allDeps["@astrojs/vercel"] || allDeps["@astrojs/netlify"] || allDeps["@astrojs/cloudflare"]) ||
      /@astrojs\/(vercel|netlify|cloudflare)/.test(astroConfig);

    if (nodeAdapter || platformAdapter || pkg.scripts?.start || configSaysServer) {
      config.features.add("ssr");
      if (nodeAdapter) {
        // The @astrojs/node standalone adapter emits a runnable server at this
        // path. Record it so downstream builders (and the Railpack start-command
        // override) can launch it when the repo declares no `start` script.
        if (!pkg.scripts?.start) config.startCommand = "node ./dist/server/entry.mjs";
      } else if (platformAdapter) {
        // Buildable, but its output targets Vercel/Netlify/Cloudflare — there is
        // no Node server to start. Flag it so the deploy can explain that
        // clearly instead of failing with a vague gateway error.
        config.features.add("astro-platform-adapter");
      }
    } else {
      config.features.add("static-export");
    }
  } else if (allDeps["remix"] || allDeps["@remix-run/node"]) {
    config.framework = "remix";
    config.frameworkVersion = cleanVersion(allDeps["@remix-run/node"] || allDeps["remix"]);
    config.port = 3000;
  } else if (allDeps["express"]) {
    config.framework = "express";
    config.frameworkVersion = cleanVersion(allDeps["express"]);
    config.port = 3000;
  } else if (allDeps["fastify"]) {
    config.framework = "fastify";
    config.frameworkVersion = cleanVersion(allDeps["fastify"]);
    config.port = 3000;
  } else if (allDeps["hono"]) {
    config.framework = "hono";
    config.frameworkVersion = cleanVersion(allDeps["hono"]);
    config.port = 3000;
  }

  if (!config.framework && !pkg.scripts?.start) {
    const isSpa = (allDeps["react"] || allDeps["vue"] || allDeps["vite"] || allDeps["@vitejs/plugin-react"]);
    if (isSpa && pkg.scripts?.build) {
      config.framework = "spa";
      config.frameworkVersion = cleanVersion(allDeps["react"] || allDeps["vue"] || allDeps["vite"] || "");
      config.port = 3000;
      config.features.add("static-export");
    }
  }

  if (pkg.scripts?.build) config.buildCommand = `${config.packageManager === "npm" ? "npm run" : config.packageManager} build`;

  if (config.framework === "astro") {
    const astroVer = parseInt((allDeps["astro"] || "0").replace(/[\^~>=<]/g, "")) || 0;
    if (astroVer >= 5 && parseInt(config.runtimeVersion) < 22) {
      config.nodeVersion = "22";
      config.runtimeVersion = "22";
    }
  }

  // A repo `start` script wins over any framework default we set above.
  if (pkg.scripts?.start) config.startCommand = `${config.packageManager === "npm" ? "npm" : config.packageManager} start`;
  else if (!config.startCommand && pkg.scripts?.serve) config.startCommand = `${config.packageManager === "npm" ? "npm run" : config.packageManager} serve`;
  else if (!config.startCommand && pkg.main) config.startCommand = `node ${pkg.main}`;

  for (const [depName, depInfo] of Object.entries(NATIVE_DEPS_MAP)) {
    if (allDeps[depName]) {
      config.nativeDeps.push({ name: depName, ...depInfo });
    }
  }

  if (allDeps["socket.io"] || allDeps["ws"] || allDeps["@socket.io/redis-adapter"]) {
    config.features.add("websockets");
  }
}
