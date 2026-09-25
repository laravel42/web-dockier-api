/**
 * Disk-backed RepoFiles for the native pipeline (a cloned working directory).
 *
 * Kept in its own module so the browser/worker-safe analyzer core
 * (repo-files.ts) carries no `node:fs` import. Only the native pipeline, which
 * has a real clone, constructs this.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RepoFiles } from "./repo-files.js";

/** Directories never worth walking for analysis (and expensive to). */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  "vendor", "__pycache__", ".venv", "venv", ".cache", "coverage", ".turbo",
]);

export class DiskRepoFiles implements RepoFiles {
  private cachedList: string[] | null = null;

  constructor(private readonly repoDir: string) {}

  read(path: string): string | null {
    try {
      return readFileSync(join(this.repoDir, path), "utf-8");
    } catch {
      return null;
    }
  }

  exists(path: string): boolean {
    return existsSync(join(this.repoDir, path));
  }

  /**
   * Repo-root-relative file paths, computed via a bounded recursive walk
   * (skipping dependency/build dirs). Cached after first use. Only consulted by
   * callers that need the full tree; the analyzers themselves use read/exists.
   */
  list(): string[] {
    if (this.cachedList) return this.cachedList;
    const out: string[] = [];
    const walk = (rel: string, depth: number) => {
      if (depth > 6) return;
      let entries: string[];
      try {
        entries = readdirSync(join(this.repoDir, rel));
      } catch {
        return;
      }
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;
        const childRel = rel ? `${rel}/${entry}` : entry;
        let isDir = false;
        try {
          isDir = statSync(join(this.repoDir, childRel)).isDirectory();
        } catch {
          continue;
        }
        if (isDir) walk(childRel, depth + 1);
        else out.push(childRel);
      }
    };
    walk("", 0);
    this.cachedList = out;
    return out;
  }
}
