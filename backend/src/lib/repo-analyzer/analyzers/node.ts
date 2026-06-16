import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "../types.js";
import { NATIVE_DEPS_MAP } from "../constants.js";
import { cleanVersion } from "../utils.js";

export function analyzeNodeProject(appDir: string, repoDir: string, config: RepoConfig) {
  let pkg: Record<string, any>;
  try {
    pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
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
  const allDeps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

  const hasPayload = Object.keys(allDeps).some(
    (dep) => dep === "payload" || dep.startsWith("@payloadcms/"),
  );
  if (hasPayload) config.features.add("payload");

  if (allDeps["next"]) {
    config.framework = "Next.js";
    config.frameworkVersion = cleanVersion(allDeps["next"]);
    config.port = 3000;
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
    if (existsSync(join(appDir, "app/api")) || existsSync(join(appDir, "pages/api"))) {
      config.features.add("api-routes");
    }
    config.features.add("ssr");
  } else if (allDeps["nuxt"]) {
    config.framework = "Nuxt";
    config.frameworkVersion = cleanVersion(allDeps["nuxt"]);
    config.port = 3000;
    let isStatic = false;
    for (const cfgName of ["nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.js"]) {
      const cfgPath = join(appDir, cfgName);
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
    if (isStatic) {
      config.features.add("static-export");
    } else {
      config.features.add("ssr");
    }
  } else if (allDeps["@angular/core"]) {
    config.framework = "Angular";
    config.frameworkVersion = cleanVersion(allDeps["@angular/core"]);
    config.port = 3000;
    config.features.add("static-export");
  } else if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) {
    config.framework = "SvelteKit";
    config.frameworkVersion = cleanVersion(allDeps["@sveltejs/kit"] || allDeps["svelte"]);
    config.port = 3000;
  } else if (allDeps["astro"]) {
    config.framework = "Astro";
    config.frameworkVersion = cleanVersion(allDeps["astro"]);
    config.port = 3000;
    const hasAdapter = allDeps["@astrojs/node"] || allDeps["@astrojs/vercel"] || allDeps["@astrojs/netlify"] || allDeps["@astrojs/cloudflare"];
    if (hasAdapter || pkg.scripts?.start) {
      config.features.add("ssr");
    } else {
      config.features.add("static-export");
    }
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

  if (!config.framework && !pkg.scripts?.start) {
    const isSpa = (allDeps["react"] || allDeps["vue"] || allDeps["vite"] || allDeps["@vitejs/plugin-react"]);
    if (isSpa && pkg.scripts?.build) {
      config.framework = "SPA";
      config.frameworkVersion = cleanVersion(allDeps["react"] || allDeps["vue"] || allDeps["vite"] || "");
      config.port = 3000;
      config.features.add("static-export");
    }
  }

  if (pkg.scripts?.build) config.buildCommand = `${config.packageManager === "npm" ? "npm run" : config.packageManager} build`;

  if (config.framework === "Astro") {
    const astroVer = parseInt((allDeps["astro"] || "0").replace(/[\^~>=<]/g, "")) || 0;
    if (astroVer >= 5 && parseInt(config.runtimeVersion) < 22) {
      config.nodeVersion = "22";
      config.runtimeVersion = "22";
    }
  }

  if (pkg.scripts?.start) config.startCommand = `${config.packageManager === "npm" ? "npm" : config.packageManager} start`;
  else if (pkg.scripts?.serve) config.startCommand = `${config.packageManager === "npm" ? "npm run" : config.packageManager} serve`;
  else if (pkg.main) config.startCommand = `node ${pkg.main}`;

  for (const [depName, depInfo] of Object.entries(NATIVE_DEPS_MAP)) {
    if (allDeps[depName]) {
      config.nativeDeps.push({ name: depName, ...depInfo });
    }
  }

  if (allDeps["socket.io"] || allDeps["ws"] || allDeps["@socket.io/redis-adapter"]) {
    config.features.add("websockets");
  }
}
