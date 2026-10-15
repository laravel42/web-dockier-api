/**
 * Multi-service / docker-compose detection over a repo file tree.
 *
 * Pure and sync: it only looks at the paths `getRepoFileTree` already returned.
 * No file is fetched and the compose file is never parsed — the warning this
 * feeds is informational, so presence is all we need.
 *
 * On Bitbucket `getRepoFileTree` is non-recursive, so nested manifests are
 * invisible there and this predicate under-reports — an accepted false
 * negative, not fixed here.
 */

export type MultiServiceHint = {
  /**
   * First compose file found, repo-relative. Absent when the tree holds no
   * compose file; the directory count is always the signal.
   */
  composeFile?: string;
  /**
   * Candidate app directories, "" = repo root. Sorted, capped at 8. Always
   * holds 2 or more entries when a hint is returned.
   */
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

// npm/yarn declare workspaces inside package.json, so there is no marker file on the path list.
const NPM_YARN_ROOT_LOCKS = new Set(["yarn.lock", "package-lock.json"]);
const WORKSPACE_MEMBER_RE = /^(apps|packages)\/[^/]+\/package\.json$/i;

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
  ) || (
    candidates.some((file) => dirOf(file) === "" && NPM_YARN_ROOT_LOCKS.has(baseOf(file).toLowerCase()))
    && candidates.some((file) => WORKSPACE_MEMBER_RE.test(file))
  );

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
  // A root compose file is the normal way to run ONE app's dependencies locally (Laravel Sail, Django/Rails + postgres, or a stale unused compose), so it only enriches the copy once 2 app dirs show one root build no longer covers the repo.
  if (serviceDirs.length < 2) return null;

  const composeFile = candidates.find((file) => COMPOSE_RE.test(file));

  return {
    ...(composeFile ? { composeFile } : {}),
    serviceDirs: serviceDirs.slice(0, 8),
  };
}
