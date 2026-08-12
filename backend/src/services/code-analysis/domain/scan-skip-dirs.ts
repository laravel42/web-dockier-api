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


/**
 * Filenames that are generated output regardless of where they sit.
 *
 * Directory-based skipping misses published vendor assets: Laravel's
 * `vendor:publish` drops third-party bundles into `public/`, which is a perfectly
 * ordinary directory name, so `public/js/filament/forms/components/file-upload.js`
 * was being scanned as if it were hand-written.
 */
const GENERATED_FILE_PATTERNS: RegExp[] = [
  /\.min\.(js|css|mjs|cjs)$/i,
  /\.bundle\.(js|css|mjs|cjs)$/i,
  /\.chunk\.(js|mjs|cjs)$/i,
  /-[0-9a-f]{8,}\.(js|css|mjs|cjs)$/i,   // content-hashed build output
  /\.map$/i,
];

/** True when a filename is recognisably build output rather than source. */
export function isGeneratedAssetName(name: string): boolean {
  return GENERATED_FILE_PATTERNS.some((re) => re.test(name));
}

/**
 * Longest line we will accept in a text asset before treating it as minified.
 *
 * Minified bundles put a whole library on one line. A finding on such a file is
 * unusable — "line 2" of a 400 KB line tells nobody anything, and the code is not
 * the user's to fix. Hand-written sources essentially never exceed this.
 */
export const MAX_SOURCE_LINE_LENGTH = 2_000;

/**
 * True when the content looks machine-generated: one or more absurdly long lines.
 *
 * Catches the bundles that slip past the name patterns — plenty of published
 * assets are minified without a `.min` in the name.
 */
export function looksMinified(content: string): boolean {
  let lineLength = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      lineLength = 0;
      continue;
    }
    if (++lineLength > MAX_SOURCE_LINE_LENGTH) return true;
  }
  return false;
}

/** Lines for a repo-local `.semgrepignore` (gitignore syntax). */
export function semgrepIgnoreLines(): string[] {
  const header = "# Dockier — skip dependency and build artifact directories";
  const patterns = [...SCAN_SKIP_DIRS].flatMap((dir) => [`${dir}/`, `**/${dir}/**`]);
  const generated = ["*.min.js", "*.min.css", "*.min.mjs", "*.bundle.js", "*.chunk.js", "*.map"];
  return [header, ...patterns, "# generated assets", ...generated];
}

/** Write `.semgrepignore` into a cloned repo before Semgrep runs. */
export async function writeSemgrepIgnore(repoDir: string): Promise<void> {
  const content = `${semgrepIgnoreLines().join("\n")}\n`;
  await writeFile(join(repoDir, ".semgrepignore"), content, "utf-8");
}

/** Build Semgrep CLI `--exclude` flags (gitignore-style globs). */
export function semgrepExcludeArgs(): string[] {
  const dirs = [...SCAN_SKIP_DIRS].flatMap((dir) => [
    "--exclude",
    `${dir}/`,
    "--exclude",
    `**/${dir}/**`,
  ]);
  const generated = ["*.min.js", "*.min.css", "*.min.mjs", "*.bundle.js", "*.chunk.js", "*.map"]
    .flatMap((glob) => ["--exclude", glob]);
  return [...dirs, ...generated];
}

/** Comma-separated SonarQube `sonar.exclusions` glob list. */
export function sonarExclusionGlobs(): string {
  return [...SCAN_SKIP_DIRS].map((dir) => `**/${dir}/**`).join(",");
}
