/**
 * Multi-service / docker-compose detection over a repo file tree.
 *
 * Pure and sync: it only looks at the paths `getRepoFileTree` already returned.
 * No file is fetched and the compose file is never parsed — the warning this
 * feeds is informational, so presence is all we need.
 */

export type MultiServiceHint = {
  /** First compose file found, repo-relative. Absent when the signal was the directory count. */
  composeFile?: string;
  /** Candidate app directories, "" = repo root. Sorted, capped at 8. */
  serviceDirs: string[];
};

/**
 * Path segments that never contain a deployable service: build output, vendored
 * dependencies, caches, and test/example fixtures. First group mirrors
 * `SKIP_DIRS` in `lib/repo-analyzer/repo-files-disk.ts` (not exported; copied
 * here on purpose rather than refactoring that module).
 */
const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  "coverage",
  "site-packages",
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
  "fixture",
  "fixtures",
  "example",
  "examples",
  "sample",
  "samples",
  "template",
  "templates",
  "demo",
]);

/** Top-level dirs that hold shared workspace libraries, not deployable services. */
const LIBRARY_ROOTS = new Set(["packages", "libs", "lib", "internal", "tools"]);

/** A root manifest next to one of these is a workspace manifest, not a service. */
const WORKSPACE_MARKERS = new Set([
  "pnpm-workspace.yaml",
  "turbo.json",
  "lerna.json",
  "nx.json",
  "rush.json",
]);

const MANIFESTS = new Set([
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "pipfile",
  "manage.py",
  "go.mod",
]);

const COMPOSE_RE = /(^|\/)(docker-compose|compose)(\.[A-Za-z0-9_-]+)?\.ya?ml$/i;

function dirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function isIgnored(path: string): boolean {
  return path.split("/").some((segment) => IGNORED_SEGMENTS.has(segment.toLowerCase()));
}

/**
 * Detect whether a repo holds more than one deployable service.
 *
 * Returns `null` when it does not — callers treat that as "checked, single
 * service". Errs toward `null` when the signal is ambiguous.
 */
export function detectMultiService(files: string[]): MultiServiceHint | null {
  const candidates = files.filter((file) => !isIgnored(file));
  const hasWorkspaceMarker = candidates.some((file) =>
    dirOf(file) === "" && WORKSPACE_MARKERS.has(baseOf(file).toLowerCase()),
  );

  const composeFile = candidates.find((file) => COMPOSE_RE.test(file));

  const serviceDirSet = new Set<string>();
  for (const file of candidates) {
    if (!MANIFESTS.has(baseOf(file).toLowerCase())) continue;
    const dir = dirOf(file);
    // A root package.json beside a workspace marker describes the workspace itself.
    if (dir === "" && hasWorkspaceMarker && baseOf(file).toLowerCase() === "package.json") continue;
    if (LIBRARY_ROOTS.has(dir.split("/")[0].toLowerCase())) continue;
    serviceDirSet.add(dir);
  }

  const serviceDirs = Array.from(serviceDirSet).sort();
  // 2 app dirs is where one root build stops covering the repo; same-dir runtime mixes (Laravel + its asset package.json) stay at 1 on purpose.
  if (!composeFile && serviceDirs.length < 2) return null;

  return {
    ...(composeFile ? { composeFile } : {}),
    serviceDirs: serviceDirs.slice(0, 8),
  };
}
