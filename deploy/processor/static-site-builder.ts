/**
 * Shared static site builder utilities.
 *
 * Consolidates the duplicated install → build → find output dir logic
 * used by aws-s3, gcp-storage, and image-builder/source-bundler.
 */

import { join, extname } from "node:path";
import { existsSync, readdirSync, statSync, readFileSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import type { RunCmdFn } from "./run-cmd";

// ─── MIME Types ────────────────────────────────────────────────────

/** Shared MIME type map for static file uploads (S3, GCS, etc.) */
export const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
};

/** Directories to skip when recursively uploading static files. */
export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".nuxt",
  ".output",
  ".next",
  ".cache",
  "__pycache__",
]);

/**
 * Get the MIME type for a file based on its extension.
 * Falls back to "application/octet-stream" for unknown extensions.
 */
export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ─── Install Dependencies ──────────────────────────────────────────

/**
 * Install dependencies using the detected package manager.
 * Tries the strict/frozen-lockfile variant first, falls back to a permissive install.
 *
 * @returns true if installation succeeded, false otherwise
 */
export async function installDeps(opts: {
  repoDir: string;
  packageManager: string;
  runCmd: RunCmdFn;
  appendLog: (line: string) => Promise<void>;
}): Promise<boolean> {
  const { repoDir, packageManager, runCmd, appendLog } = opts;

  await appendLog("ℹ Installing dependencies...");

  let installOk = false;

  if (packageManager === "pnpm") {
    const result = await runCmd("pnpm", ["install", "--frozen-lockfile"], { cwd: repoDir });
    installOk = result.code === 0;
    if (!installOk) {
      await appendLog("⚠ pnpm install --frozen-lockfile failed, trying pnpm install...");
      const fallback = await runCmd("pnpm", ["install"], { cwd: repoDir });
      installOk = fallback.code === 0;
    }
  } else if (packageManager === "yarn") {
    const result = await runCmd("yarn", ["install", "--frozen-lockfile"], { cwd: repoDir });
    installOk = result.code === 0;
    if (!installOk) {
      await appendLog("⚠ yarn install --frozen-lockfile failed, trying yarn install...");
      const fallback = await runCmd("yarn", ["install"], { cwd: repoDir });
      installOk = fallback.code === 0;
    }
  } else {
    // Default to npm
    const result = await runCmd("npm", ["ci"], { cwd: repoDir });
    installOk = result.code === 0;
    if (!installOk) {
      await appendLog("⚠ npm ci failed, trying npm install...");
      const fallback = await runCmd("npm", ["install"], { cwd: repoDir });
      installOk = fallback.code === 0;
    }
  }

  if (installOk) {
    await appendLog("✓ Dependencies installed");
  } else {
    await appendLog("⚠ Dependency installation had issues — attempting build anyway");
  }

  return installOk;
}

// ─── Build Static Site ─────────────────────────────────────────────

/**
 * Build a static site using framework-specific commands.
 * Tries Nuxt generate, Next.js export, or generic npm run build.
 *
 * @returns true if the build succeeded, false otherwise
 */
export async function buildSite(opts: {
  repoDir: string;
  techStack: string[];
  runCmd: RunCmdFn;
  appendLog: (line: string) => Promise<void>;
}): Promise<boolean> {
  const { repoDir, techStack, runCmd, appendLog } = opts;

  await appendLog("ℹ Building static site...");

  const isNuxt = techStack.some((t) => t.toLowerCase().includes("nuxt"));
  const isNext = techStack.some((t) => t.toLowerCase().includes("next"));
  let buildOk = false;
  let frameworkBuildAttempted = false;

  if (isNuxt) {
    frameworkBuildAttempted = true;
    buildOk = await buildNuxt(repoDir, runCmd, appendLog);
  } else if (isNext) {
    frameworkBuildAttempted = true;
    buildOk = await buildNext(repoDir, runCmd, appendLog);
  }

  // Generic fallback for React (CRA/Vite), Vue, Svelte, Angular, Astro, etc.
  // Skip `npm run build` if a framework-specific build already attempted it.
  if (!buildOk && !frameworkBuildAttempted) {
    const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
    if (buildRes.code === 0) {
      buildOk = true;
      await appendLog("✓ Static site built");
    }
  }

  // Last resort: try generate script if no build succeeded
  if (!buildOk) {
    const genRes = await runCmd("npm", ["run", "generate", "--if-present"], { cwd: repoDir });
    if (genRes.code === 0) {
      buildOk = true;
      await appendLog("✓ Static site generated");
    } else {
      await appendLog("⚠ Build failed — uploading source files as fallback");
    }
  }

  return buildOk;
}

async function buildNuxt(
  repoDir: string,
  runCmd: RunCmdFn,
  appendLog: (line: string) => Promise<void>,
): Promise<boolean> {
  // Nuxt: try `nuxt generate` for full SSG, fall back to normal build for SPA
  const genResult = await runCmd("npx", ["nuxt", "generate"], {
    cwd: repoDir,
    env: { NITRO_PRESET: "static" },
  });
  if (genResult.code === 0) {
    await appendLog("✓ Nuxt static site generated");
    return true;
  }

  await appendLog("ℹ nuxt generate failed (likely API deps), building as SPA...");
  // Save the 200.html produced by the failed generate — it has correct script/link tags
  const outputPublicDir = join(repoDir, ".output/public");
  const saved200 = existsSync(join(outputPublicDir, "200.html"))
    ? readFileSync(join(outputPublicDir, "200.html"), "utf-8")
    : null;

  // Normal build produces client assets without triggering prerender
  const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
  if (
    buildRes.code === 0 ||
    existsSync(join(outputPublicDir, "_nuxt")) ||
    existsSync(join(repoDir, ".nuxt/dist/client/_nuxt"))
  ) {
    // Ensure .output/public/_nuxt exists
    if (!existsSync(join(outputPublicDir, "_nuxt"))) {
      const src = join(repoDir, ".nuxt/dist/client/_nuxt");
      if (existsSync(src)) {
        const { cpSync } = await import("node:fs");
        mkdirSync(outputPublicDir, { recursive: true });
        cpSync(src, join(outputPublicDir, "_nuxt"), { recursive: true });
      }
    }
    // Restore saved 200.html as index.html
    if (saved200 && existsSync(join(outputPublicDir, "_nuxt"))) {
      writeFileSync(join(outputPublicDir, "index.html"), saved200, "utf-8");
    }
    const buildOk = existsSync(join(outputPublicDir, "_nuxt"));
    if (buildOk) await appendLog("✓ Nuxt SPA built");
    return buildOk;
  }

  return false;
}

async function buildNext(
  repoDir: string,
  runCmd: RunCmdFn,
  appendLog: (line: string) => Promise<void>,
): Promise<boolean> {
  const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
  if (buildRes.code === 0) {
    // Try next export if out/ doesn't exist yet
    if (!existsSync(join(repoDir, "out"))) {
      await runCmd("npx", ["next", "export"], { cwd: repoDir });
    }
    await appendLog("✓ Next.js static site built");
    return true;
  }
  return false;
}

// ─── Find Build Output Directory ───────────────────────────────────

/**
 * Common framework output directories, checked in priority order.
 */
const POSSIBLE_OUTPUT_DIRS = [
  ".output/public", // Nuxt
  "out",            // Next.js
  "dist",           // Vite (React/Vue/Svelte), Astro, Angular
  "build",          // Create React App, SvelteKit
  ".next/out",      // Next.js (older)
  "output",         // Generic
  "public",         // Hugo, some configs
];

/**
 * Find the build output directory from a repo.
 * Checks common framework output directories in priority order.
 * Handles Angular's nested dist/<project-name>/browser pattern.
 *
 * @returns Absolute path to the output directory (falls back to repoDir)
 */
export function findOutputDir(repoDir: string): string {
  // Prefer a dir that has index.html
  for (const dir of POSSIBLE_OUTPUT_DIRS) {
    const candidate = join(repoDir, dir);
    if (existsSync(join(candidate, "index.html"))) {
      return candidate;
    }
  }

  // If none had index.html, pick the first that exists
  for (const dir of POSSIBLE_OUTPUT_DIRS) {
    if (existsSync(join(repoDir, dir))) {
      return join(repoDir, dir);
    }
  }

  // For Angular, check dist/<project-name>/browser or dist/<project-name>
  if (existsSync(join(repoDir, "dist"))) {
    const distEntries = readdirSync(join(repoDir, "dist"));
    for (const entry of distEntries) {
      const candidate = join(repoDir, "dist", entry);
      if (statSync(candidate).isDirectory()) {
        if (existsSync(join(candidate, "browser", "index.html"))) {
          return join(candidate, "browser");
        }
        if (existsSync(join(candidate, "index.html"))) {
          return candidate;
        }
      }
    }
  }

  // Fallback to repo root
  return repoDir;
}

// ─── Ensure index.html ─────────────────────────────────────────────

/**
 * Ensure index.html exists in the output directory.
 * Falls back to 200.html (Nuxt SPA fallback) if available.
 *
 * @returns true if index.html exists (or was created from 200.html)
 */
export async function ensureIndexHtml(
  uploadDir: string,
  appendLog: (line: string) => Promise<void>,
): Promise<boolean> {
  if (existsSync(join(uploadDir, "index.html"))) {
    return true;
  }
  // Check for 200.html (Nuxt SPA fallback)
  if (existsSync(join(uploadDir, "200.html"))) {
    copyFileSync(join(uploadDir, "200.html"), join(uploadDir, "index.html"));
    await appendLog("✓ Using 200.html as index.html");
    return true;
  }
  await appendLog("⚠ No index.html found in build output");
  return false;
}
