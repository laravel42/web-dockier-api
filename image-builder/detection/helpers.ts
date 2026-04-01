// ─── Detection Helpers ───

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function detectNodePM(appDir: string, repoDir: string): "npm" | "pnpm" | "yarn" | "bun" {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
    if (pkg.packageManager) {
      const pm = pkg.packageManager.split("@")[0];
      if (pm === "pnpm" || pm === "yarn" || pm === "bun") return pm;
    }
  } catch {}
  if (existsSync(join(appDir, "pnpm-lock.yaml")) || existsSync(join(repoDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(appDir, "yarn.lock")) || existsSync(join(repoDir, "yarn.lock"))) return "yarn";
  if (existsSync(join(appDir, "bun.lockb"))) return "bun";
  return "npm";
}

export function detectSubDir(repoDir: string): string {
  const rootFiles = readdirSync(repoDir);
  const frameworkConfigs = ["next.config.js", "next.config.ts", "next.config.mjs", "nuxt.config.ts", "vite.config.ts", "angular.json", "remix.config.js", "astro.config.mjs"];
  if (frameworkConfigs.some(f => rootFiles.includes(f))) return "";
  if (rootFiles.includes("package.json") || rootFiles.includes("composer.json") || rootFiles.includes("go.mod") || rootFiles.includes("requirements.txt")) {
    try {
      const pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf-8"));
      if (pkg.scripts?.build || pkg.scripts?.start) return "";
    } catch {}
    if (rootFiles.includes("composer.json") || rootFiles.includes("go.mod") || rootFiles.includes("requirements.txt")) return "";
  }
  const subdirs = ["app", "frontend", "web", "client", "packages/app", "packages/web", "apps/web", "apps/frontend", "src"];
  for (const sub of subdirs) {
    const subPath = join(repoDir, sub);
    if (existsSync(subPath) && (existsSync(join(subPath, "package.json")) || existsSync(join(subPath, "composer.json")))) {
      return sub;
    }
  }
  return "";
}
