// ─── Node.js Stack Detection & Dockerfile Generator ───

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DetectedStack } from "./types";
import { detectNodePM } from "./helpers";

export function detectNode(appDir: string, repoDir: string, subDir: string): Extract<DetectedStack, { runtime: "node" }> | null {
  if (!existsSync(join(appDir, "package.json"))) return null;

  let framework: "nextjs" | "nuxt" | "sveltekit" | "spa" | "generic" = "generic";
  let hasStandalone = false;
  let isStatic = false;
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps["next"]) {
      framework = "nextjs";
      for (const cfg of ["next.config.ts", "next.config.mjs", "next.config.js"]) {
        const cfgPath = join(appDir, cfg);
        if (existsSync(cfgPath)) {
          try { hasStandalone = readFileSync(cfgPath, "utf-8").includes("standalone"); } catch {}
          break;
        }
      }
    } else if (allDeps["nuxt"]) {
      framework = "nuxt";
      for (const cfg of ["nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.js"]) {
        const cfgPath = join(appDir, cfg);
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
    } else if (allDeps["@sveltejs/kit"]) {
      framework = "sveltekit";
      isStatic = false;
    } else if (allDeps["@angular/core"]) {
      framework = "spa";
      isStatic = true;
    } else if ((allDeps["react"] || allDeps["vue"] || allDeps["vite"] || allDeps["@vitejs/plugin-react"]) && !pkg.scripts?.start && pkg.scripts?.build) {
      framework = "spa";
      isStatic = true;
    } else if (allDeps["astro"]) {
      const hasAdapter = allDeps["@astrojs/node"] || allDeps["@astrojs/vercel"] || allDeps["@astrojs/netlify"] || allDeps["@astrojs/cloudflare"];
      if (hasAdapter || pkg.scripts?.start) {
        framework = "generic";
      } else {
        framework = "spa";
        isStatic = true;
      }
    }
  } catch {}
  const pm = detectNodePM(appDir, repoDir);
  return { runtime: "node", framework, packageManager: pm, hasStandalone, isStatic, subDir };
}

export function nodeDockerfile(stack: Extract<DetectedStack, { runtime: "node" }>, repoDir: string): string {
  const appDir = stack.subDir ? join(repoDir, stack.subDir) : repoDir;
  let nodeVer = "20";
  for (const f of [".nvmrc", ".node-version"]) {
    try {
      const v = readFileSync(join(appDir, f), "utf-8").trim().replace(/^v/, "");
      if (/^\d+/.test(v)) { nodeVer = v.split(".")[0]; break; }
    } catch {}
  }
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
    if (pkg.engines?.node) {
      const m = pkg.engines.node.match(/(\d+)/);
      if (m) nodeVer = m[1];
    }
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps["astro"]) {
      const astroVer = parseInt((allDeps["astro"] || "0").replace(/[\^~>=<]/g, "")) || 0;
      if (astroVer >= 5 && parseInt(nodeVer) < 22) nodeVer = "22";
    }
  } catch {}

  const pm = stack.packageManager;
  const copyPrefix = stack.subDir ? `${stack.subDir}/` : "";
  const lines: string[] = [];

  // Builder
  lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim AS builder`);
  lines.push("WORKDIR /app");
  if (pm === "pnpm") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}pnpm-lock.yaml* ./`);
    lines.push("RUN corepack enable && pnpm install --no-frozen-lockfile");
  } else if (pm === "yarn") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}yarn.lock* ./`);
    lines.push("RUN corepack enable && yarn install --immutable || yarn install");
  } else if (pm === "bun") {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}bun.lockb* ./`);
    lines.push("RUN npm i -g bun && bun install");
  } else {
    lines.push(`COPY ${copyPrefix}package.json ${copyPrefix}package-lock.json* ./`);
    lines.push("RUN npm ci || npm install");
  }
  lines.push(`COPY ${copyPrefix}. .`);

  if (stack.framework === "sveltekit") {
    const installCmd = pm === "pnpm" ? "pnpm add -D" : pm === "yarn" ? "yarn add -D" : pm === "bun" ? "bun add -D" : "npm install --save-dev";
    lines.push(`RUN ${installCmd} @sveltejs/adapter-node`);
    lines.push("RUN if grep -q 'adapter-auto' svelte.config.js 2>/dev/null; then \\\n" +
      "    sed -i \"s/@sveltejs\\/adapter-auto/@sveltejs\\/adapter-node/g\" svelte.config.js; \\\n" +
      "    fi");
  }

  lines.push(`RUN ${pm === "npm" ? "npm run" : pm} build`);

  // Production
  lines.push("");
  lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim`);
  lines.push("WORKDIR /app");

  if (stack.framework === "nextjs" && stack.hasStandalone) {
    lines.push("COPY --from=builder /app/.next/standalone ./");
    lines.push("COPY --from=builder /app/.next/static ./.next/static");
    lines.push("COPY --from=builder /app/public ./public");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", "server.js"]');
  } else if (stack.framework === "nextjs") {
    lines.push("COPY --from=builder /app/node_modules ./node_modules");
    lines.push("COPY --from=builder /app/.next ./.next");
    lines.push("COPY --from=builder /app/public ./public");
    lines.push("COPY --from=builder /app/package.json ./");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node_modules/.bin/next", "start"]');
  } else if (stack.framework === "nuxt" && stack.isStatic) {
    lines.push("FROM public.ecr.aws/docker/library/node:" + nodeVer + "-slim");
    lines.push("WORKDIR /app");
    lines.push("RUN npm i -g serve");
    lines.push("COPY --from=builder /app/.output/public ./public");
    lines.push("ENV PORT=3000");
    lines.push("EXPOSE 3000");
    lines.push('CMD ["serve", "public", "-l", "3000", "-s"]');
  } else if (stack.framework === "nuxt") {
    lines.push("COPY --from=builder /app/.output ./.output");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", ".output/server/index.mjs"]');
  } else if (stack.framework === "sveltekit") {
    lines.push("RUN --mount=from=builder,source=/app,target=/builder \\\n" +
      "    if [ -d /builder/build ]; then cp -r /builder/build ./build; \\\n" +
      "    elif [ -d /builder/.svelte-kit/output ]; then cp -r /builder/.svelte-kit/output ./build; fi");
    lines.push("COPY --from=builder /app/package.json ./");
    lines.push("COPY --from=builder /app/node_modules ./node_modules");
    lines.push('ENV PORT=3000 HOST="0.0.0.0" ORIGIN="http://localhost:3000"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", "build"]');
  } else if (stack.framework === "spa") {
    lines.push("RUN npm i -g serve");
    lines.push("COPY --from=builder /app/package.json ./");
    lines.push("RUN --mount=from=builder,source=/app,target=/builder \\\n" +
      "    BROWSER=$(find /builder/dist -maxdepth 2 -type d -name browser 2>/dev/null | head -1) && \\\n" +
      "    if [ -n \"$BROWSER\" ]; then cp -r \"$BROWSER\" ./dist; \\\n" +
      "    elif [ -d /builder/dist ] && [ -f /builder/dist/index.html ]; then cp -r /builder/dist ./dist; \\\n" +
      "    elif [ -d /builder/dist ]; then INNER=$(ls /builder/dist | head -1) && \\\n" +
      "      if [ -f \"/builder/dist/$INNER/index.html\" ]; then cp -r \"/builder/dist/$INNER\" ./dist; else cp -r /builder/dist ./dist; fi; \\\n" +
      "    elif [ -d /builder/build ]; then cp -r /builder/build ./build; fi");
    lines.push("ENV PORT=3000");
    lines.push("EXPOSE 3000");
    lines.push('CMD ["sh", "-c", "if [ -d dist ]; then serve dist -l 3000 -s; else serve build -l 3000 -s; fi"]');
  } else {
    lines.push("COPY --from=builder /app .");
    if (pm === "pnpm" || pm === "yarn") {
      lines.push("RUN corepack enable");
    }
    lines.push("ENV PORT=3000");
    lines.push("EXPOSE 3000");
    lines.push(`CMD ["${pm === "npm" ? "npm" : pm}", "start"]`);
  }

  return lines.join("\n") + "\n";
}
