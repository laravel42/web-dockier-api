import type { RepoFiles } from "./repo-files.js";
import { joinPath } from "./repo-files.js";

const FRAMEWORK_CONFIGS = [
  "next.config.js", "next.config.ts", "next.config.mjs",
  "nuxt.config.ts", "vite.config.ts", "angular.json",
  "remix.config.js", "astro.config.mjs",
];

const CANDIDATE_SUBDIRS = [
  "app", "frontend", "web", "client",
  "packages/app", "packages/web", "apps/web", "apps/frontend", "src",
];

/**
 * Detect the application subdirectory within a repo (monorepo support).
 *
 * Returns "" when the app lives at the repo root — which is the case when a
 * framework config sits at the root, or when the root package.json declares a
 * build/start script. Otherwise probes a fixed list of conventional subdirs for
 * a package.json + framework config.
 *
 * Filesystem-agnostic: works off any RepoFiles (disk or fetched).
 */
export function detectSubDir(files: RepoFiles): string {
  if (FRAMEWORK_CONFIGS.some((f) => files.exists(f))) return "";

  if (files.exists("package.json")) {
    try {
      const pkg = JSON.parse(files.read("package.json") ?? "{}") as { scripts?: { build?: string; start?: string } };
      if (pkg.scripts?.build || pkg.scripts?.start) return "";
    } catch { /* fall through to subdir probing */ }
  }

  for (const sub of CANDIDATE_SUBDIRS) {
    if (files.exists(joinPath(sub, "package.json"))) {
      if (FRAMEWORK_CONFIGS.some((f) => files.exists(joinPath(sub, f)))) return sub;
    }
  }
  return "";
}
