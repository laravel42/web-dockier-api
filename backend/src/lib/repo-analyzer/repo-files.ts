/**
 * Filesystem-agnostic file source for the repo analyzer.
 *
 * The analyzer historically read straight from a cloned working directory
 * (node:fs). That tied it to the native pipeline, which is the only place a
 * clone exists. To let the same analyzer run in the Dokploy pipeline (which
 * never clones — it fetches files over the git provider API), all file access
 * goes through this interface instead of `fs`.
 *
 * Paths are POSIX-style and relative to the repo root (e.g. "package.json",
 * "apps/web/package.json"). Implementations:
 *   - DiskRepoFiles: reads a cloned directory (native pipeline).
 *   - MapRepoFiles / fetch-backed: serves already-fetched contents + a known
 *     file tree (Dokploy pipeline, tests).
 *
 * `read` returns the file contents or null when absent/unreadable. `exists`
 * reports whether a path is present; for a directory path it reports whether
 * any known entry lives under it (so directory checks like "app/api" work off a
 * flat file list).
 */
export interface RepoFiles {
  read(path: string): string | null;
  exists(path: string): boolean;
  /** All known file paths, repo-root-relative (used by subdir detection). */
  list(): string[];
}

/** Join repo-root-relative path segments with POSIX separators. */
export function joinPath(...segments: string[]): string {
  return segments
    .filter((s) => s !== "")
    .join("/")
    .replace(/\/+/g, "/");
}

/**
 * A RepoFiles backed by an in-memory map of path → contents.
 *
 * `exists` treats a path as present if it's an exact key OR a directory prefix
 * of some key. This mirrors how the disk analyzer used existsSync for both
 * files (package.json) and directories (app/api).
 */
export class MapRepoFiles implements RepoFiles {
  private readonly files: Map<string, string>;
  private readonly knownPaths: Set<string>;

  /**
   * @param files    path → contents for files whose CONTENT is available.
   * @param knownPaths Optional superset of paths known to exist (e.g. the full
   *   repo file tree) even when their content wasn't fetched. Lets `exists`/
   *   `list` reflect the real tree while `read` only returns fetched contents.
   *   Defaults to the keys of `files`.
   */
  constructor(files: Record<string, string> | Map<string, string>, knownPaths?: string[]) {
    this.files = files instanceof Map ? new Map(files) : new Map(Object.entries(files));
    this.knownPaths = new Set((knownPaths ?? [...this.files.keys()]).map(normalize));
    for (const key of this.files.keys()) this.knownPaths.add(key);
  }

  read(path: string): string | null {
    const norm = normalize(path);
    return this.files.has(norm) ? this.files.get(norm)! : null;
  }

  exists(path: string): boolean {
    const norm = normalize(path);
    if (this.knownPaths.has(norm)) return true;
    // Directory check: any known path under this prefix.
    const prefix = norm.endsWith("/") ? norm : `${norm}/`;
    for (const key of this.knownPaths) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  list(): string[] {
    return [...this.knownPaths];
  }
}

function normalize(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+/g, "/");
}
