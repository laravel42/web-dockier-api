import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Directory names skipped when walking repos and passed to Semgrep/SonarQube. */
export const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "vendor",
  "vendors",
  "bower_components",
  "jspm_packages",
  "third_party",
  "third-party",
  "dist",
  "build",
  "target",
  "out",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".yarn",
  ".pnpm-store",
  ".pnpm",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "site-packages",
  "Pods",
  ".bundle",
  "carthage",
  "godeps",
  ".gradle",
  ".nuget",
  ".composer",
  ".terraform",
  ".serverless",
]);

const SKIP_DIRS_LOWER = new Set([...SCAN_SKIP_DIRS].map((dir) => dir.toLowerCase()));

/** True when a single path segment is a skipped dependency/build directory. */
export function isScanSkippedDirName(name: string): boolean {
  return SKIP_DIRS_LOWER.has(name.toLowerCase());
}

/** True when any segment of a repo-relative path is a skipped directory. */
export function isScanSkippedRelativePath(relativePath: string): boolean {
  const segments = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return segments.some((segment) => isScanSkippedDirName(segment));
}

/** Lines for a repo-local `.semgrepignore` (gitignore syntax). */
export function semgrepIgnoreLines(): string[] {
  const header = "# Dockier — skip dependency and build artifact directories";
  const patterns = [...SCAN_SKIP_DIRS].flatMap((dir) => [`${dir}/`, `**/${dir}/**`]);
  return [header, ...patterns];
}

/** Write `.semgrepignore` into a cloned repo before Semgrep runs. */
export async function writeSemgrepIgnore(repoDir: string): Promise<void> {
  const content = `${semgrepIgnoreLines().join("\n")}\n`;
  await writeFile(join(repoDir, ".semgrepignore"), content, "utf-8");
}

/** Build Semgrep CLI `--exclude` flags (gitignore-style globs). */
export function semgrepExcludeArgs(): string[] {
  return [...SCAN_SKIP_DIRS].flatMap((dir) => [
    "--exclude",
    `${dir}/`,
    "--exclude",
    `**/${dir}/**`,
  ]);
}

/** Comma-separated SonarQube `sonar.exclusions` glob list. */
export function sonarExclusionGlobs(): string {
  return [...SCAN_SKIP_DIRS].map((dir) => `**/${dir}/**`).join(",");
}
