import type { RepoConfig } from "../types";

export function generateNodeDockerfile(config: RepoConfig): string {
  const nodeVer = config.nodeVersion || config.runtimeVersion || "20";
  const pm = config.packageManager === "unknown" ? "npm" : config.packageManager;
  const pmVer = config.packageManagerVersion;
  const copyPrefix = config.subDir ? `${config.subDir}/` : "";
  const lines: string[] = [];

  // ── Builder stage ──
  lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim AS builder`);
  lines.push("WORKDIR /app");

  const buildAptPkgs = new Set<string>();
  for (const dep of config.nativeDeps) {
    for (const pkg of dep.aptPackages) buildAptPkgs.add(pkg);
  }
  if (buildAptPkgs.size > 0) {
    lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...buildAptPkgs].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);
  }

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

  if (config.framework === "SvelteKit") {
    const installCmd = pm === "pnpm" ? "pnpm add -D" : pm === "yarn" ? "yarn add -D" : pm === "bun" ? "bun add -D" : "npm install --save-dev";
    lines.push(`RUN ${installCmd} @sveltejs/adapter-node`);
    lines.push("RUN if grep -q 'adapter-auto' svelte.config.js 2>/dev/null; then \\\n" +
      "    sed -i \"s/@sveltejs\\/adapter-auto/@sveltejs\\/adapter-node/g\" svelte.config.js; \\\n" +
      "    fi");
  }

  lines.push(`RUN ${pm === "npm" ? "npm run" : pm} build`);

  // ── Production stage ──
  lines.push("");
  lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim`);
  lines.push("WORKDIR /app");

  const runtimeAptPkgs = new Set<string>();
  for (const dep of config.nativeDeps) {
    for (const pkg of dep.aptPackages.filter(p => !["make", "g++", "python3"].includes(p))) {
      runtimeAptPkgs.add(pkg);
    }
  }
  if (runtimeAptPkgs.size > 0) {
    lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${[...runtimeAptPkgs].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`);
  }

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
    lines.push('CMD ["node_modules/.bin/next", "start"]');
  } else if (config.framework === "Nuxt" && config.features.has("static-export")) {
    lines.push(`FROM public.ecr.aws/docker/library/node:${nodeVer}-slim`);
    lines.push("WORKDIR /app");
    lines.push("RUN npm i -g serve");
    lines.push("COPY --from=builder /app/.output/public ./public");
    lines.push('ENV PORT=3000');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["serve", "public", "-l", "3000", "-s"]');
  } else if (config.framework === "Nuxt") {
    lines.push("COPY --from=builder /app/.output ./.output");
    lines.push('ENV PORT=3000 HOSTNAME="0.0.0.0"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", ".output/server/index.mjs"]');
  } else if (config.framework === "SPA") {
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
  } else if (config.framework === "Angular") {
    lines.push("RUN npm i -g serve");
    lines.push("COPY --from=builder /app/package.json ./");
    lines.push("RUN --mount=from=builder,source=/app/dist,target=/builder-dist \\\n    BROWSER=$(find /builder-dist -maxdepth 2 -type d -name browser | head -1) && \\\n    if [ -n \"$BROWSER\" ]; then cp -r \"$BROWSER\" ./dist; else cp -r /builder-dist/$(ls /builder-dist | head -1) ./dist; fi");
    lines.push("ENV PORT=3000");
    lines.push("EXPOSE 3000");
    lines.push('CMD ["serve", "dist", "-l", "3000", "-s"]');
  } else if (config.framework === "SvelteKit") {
    lines.push("COPY --from=builder /app/build ./build");
    lines.push("COPY --from=builder /app/package.json ./");
    lines.push("COPY --from=builder /app/node_modules ./node_modules");
    lines.push('ENV PORT=3000 HOST="0.0.0.0" ORIGIN="http://localhost:3000"');
    lines.push("EXPOSE 3000");
    lines.push('CMD ["node", "build"]');
  } else if (config.framework === "Astro" && config.features.has("static-export")) {
    lines.push("RUN npm i -g serve");
    lines.push("COPY --from=builder /app/dist ./dist");
    lines.push("ENV PORT=3000");
    lines.push("EXPOSE 3000");
    lines.push('CMD ["serve", "dist", "-l", "3000", "-s"]');
  } else {
    lines.push("COPY --from=builder /app .");
    lines.push(`ENV PORT=${config.port}`);
    lines.push(`EXPOSE ${config.port}`);
    if (config.startCommand) {
      lines.push(`CMD ${JSON.stringify(config.startCommand.split(" "))}`);
    } else if (pm === "pnpm" || pm === "yarn") {
      lines.push("RUN corepack enable");
      lines.push(`CMD ["${pm}", "start"]`);
    } else {
      lines.push('CMD ["npm", "start"]');
    }
  }

  return lines.join("\n") + "\n";
}
