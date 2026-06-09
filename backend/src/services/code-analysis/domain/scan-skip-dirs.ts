/** Directory names skipped when walking repos and passed to Semgrep/SonarQube. */
export const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "vendor",
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
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "site-packages",
  "Pods",
  ".bundle",
]);

/** Build Semgrep CLI `--exclude` flags for dependency and build artifact folders. */
export function semgrepExcludeArgs(): string[] {
  return [...SCAN_SKIP_DIRS].flatMap((dir) => ["--exclude", dir]);
}

/** Comma-separated SonarQube `sonar.exclusions` glob list. */
export function sonarExclusionGlobs(): string {
  return [...SCAN_SKIP_DIRS].map((dir) => `**/${dir}/**`).join(",");
}
