/**
 * Repository file discovery for the scanner.
 *
 * Walks a cloned repo and returns the set of files worth scanning, skipping
 * symlinks, ignored directories, generated assets, oversized files, and
 * minified bundles that would only produce noise findings.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import {
  isScanSkippedDirName,
  isScanSkippedRelativePath,
  isGeneratedAssetName,
  looksMinified,
} from "./scan-skip-dirs.js";

/** Files larger than this (1 MB) are skipped — usually vendored bundles or data. */
const MAX_SCAN_FILE_BYTES = 1_000_000;
/** Extensions worth a minification check; anything else is left alone. */
const MINIFIABLE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".css", ".scss"]);

/**
 * Recursively collect scannable files under `repoDir`.
 *
 * Returns both absolute paths (`allFiles`) and their repo-relative counterparts
 * (`relativePaths`), index-aligned so callers can pick whichever they need.
 */
export async function walkRepoFiles(repoDir: string): Promise<{ allFiles: string[]; relativePaths: string[] }> {
  const allFiles: string[] = [];
  const relativePaths: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink() || isScanSkippedDirName(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relPath = relative(repoDir, fullPath);
      if (isScanSkippedRelativePath(relPath)) continue;
      if (isGeneratedAssetName(entry.name)) continue;

      try {
        const { size } = await stat(fullPath);
        if (size > MAX_SCAN_FILE_BYTES) continue;

        // Published vendor bundles are often minified without a `.min` in the
        // name — Laravel's vendor:publish drops them straight into public/. A
        // finding on one points at line 2 of a single 400 KB line, which nobody
        // can act on and which is not the user's code anyway.
        if (MINIFIABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          const content = await readFile(fullPath, "utf-8");
          if (looksMinified(content)) continue;
        }
      } catch {
        continue;
      }

      allFiles.push(fullPath);
      relativePaths.push(relPath);
    }
  }

  await walk(repoDir);
  return { allFiles, relativePaths };
}
