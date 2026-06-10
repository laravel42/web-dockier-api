import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function detectSubDir(repoDir: string): string {
  const rootFiles = readdirSync(repoDir);
  const frameworkConfigs = ["next.config.js", "next.config.ts", "next.config.mjs", "nuxt.config.ts", "vite.config.ts", "angular.json", "remix.config.js", "astro.config.mjs"];
  if (frameworkConfigs.some(f => rootFiles.includes(f))) return "";
  if (rootFiles.includes("package.json")) {
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
