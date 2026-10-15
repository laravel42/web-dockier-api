/**
 * Multi-service / docker-compose detection over a repo file tree.
 *
 * Pure and sync: it only looks at the paths `getRepoFileTree` already returned.
 * No file is fetched and the compose file is never parsed — the warning this
 * feeds is informational, so presence is all we need.
 */

export type MultiServiceHint = {
  /**
   * First compose file found, repo-relative. Absent when the tree holds no
   * compose file; a compose file alone never triggers the hint.
   */
  composeFile?: string;
  /**
   * Candidate service directories, "" = repo root — app-manifest dirs, or the
   * Dockerfile dirs a compose repo is built from when no manifest is
   * recognised. Sorted, capped at 8. Always holds 2 or more entries.
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
// One member is enough: a root Node app beside a lone apps/* service then goes unreported — accepted, the bias is toward silence.
const NPM_YARN_ROOT_LOCKS = new Set(["yarn.lock", "package-lock.json"]);
const WORKSPACE_MEMBER_RE = /^(apps|packages)\/[^/]+\/package\.json$/i;

/** Dirs that hold an app's build/infra assets, so a Dockerfile there is not a second service. */
const DOCKER_ASSET_ROOTS = new Set([
  "docker",
  ".docker",
  "deploy",
  "deployment",
  "ops",
  "infra",
  "infrastructure",
  "nginx",
  "proxy",
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
 * Subdirectories holding a Dockerfile. The repo root is excluded so one app's
 * own Dockerfile plus a sidecar never reaches 2.
 */
function dockerfileDirs(candidates: string[]): string[] {
  const dirs = new Set<string>();
  for (const file of candidates) {
    if (baseOf(file).toLowerCase() !== "dockerfile") continue;
    const dir = dirOf(file);
    if (dir === "") continue;
    const root = dir.split("/")[0].toLowerCase();
    if (LIBRARY_ROOTS.has(root) || DOCKER_ASSET_ROOTS.has(root)) continue;
    dirs.add(dir);
  }
  return Array.from(dirs).sort();
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
  const composeFile = candidates.find((file) => COMPOSE_RE.test(file));
  // 2 dirs is where one root build stops covering the repo; same-dir runtime mixes (Laravel + its asset package.json) stay at 1 on purpose, and a compose file alone is how ONE app runs its local dependencies (Laravel Sail, Django/Rails + postgres, or a stale unused compose), so it needs a directory signal — Dockerfile dirs when the services use a runtime MANIFESTS does not list (Rust, Java, Ruby, .NET).
  const dirs = serviceDirs.length >= 2 || !composeFile ? serviceDirs : dockerfileDirs(candidates);
  if (dirs.length < 2) return null;

  return {
    ...(composeFile ? { composeFile } : {}),
    serviceDirs: dirs.slice(0, 8),
  };
}
