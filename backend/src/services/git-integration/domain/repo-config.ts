/**
 * Fetch-backed repo analysis for the Dokploy pipeline.
 *
 * The rich analyzer in `lib/repo-analyzer` used to require a cloned working
 * directory. It now runs off a `RepoFiles` source (see repo-files.ts), so this
 * module builds one from the git provider API — the file tree plus a bounded
 * set of manifest/config file CONTENTS — and runs the same analyzer the native
 * pipeline uses. One analyzer, two file sources.
 *
 * `read` is synchronous, so we PREFETCH the files the analyzer might read
 * (across the repo root and conventional monorepo subdirs) rather than fetch
 * lazily. Content misses degrade gracefully; the file tree still powers
 * `exists`/subdir detection.
 */

import { analyzeRepoFiles, MapRepoFiles, type RepoConfig } from "../../../lib/repo-analyzer/index.js";
import { fetchRepoFile, getRepoFileTree, type ConnectionLike, type RepoRef } from "./providers/provider-client.js";

/** Conventional monorepo app subdirs the analyzer probes (mirrors detect-subdir). */
const CANDIDATE_SUBDIRS = [
  "",
  "app", "frontend", "web", "client",
  "packages/app", "packages/web", "apps/web", "apps/frontend", "src",
];

/**
 * Manifest/config files whose CONTENTS the analyzer reads. Fetched at the repo
 * root and in each candidate subdir. (Lockfiles/dir markers only need to exist,
 * so they come from the file tree, not a content fetch.)
 */
const CONTENT_FILES = [
  "package.json",
  "composer.json",
  "composer.lock",
  "requirements.txt",
  "pyproject.toml",
  "runtime.txt",
  "go.mod",
  "next.config.js", "next.config.ts", "next.config.mjs",
  "nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.js",
  "astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.mts", "astro.config.cjs",
  ".nvmrc", ".node-version",
];

/**
 * Build a RepoFiles backed by the git provider API (no clone).
 *
 * Fetches the file tree once (for exists/list/subdir), then fetches the
 * contents of CONTENT_FILES that actually exist in the tree, across the repo
 * root and candidate subdirs. Best-effort: individual fetch failures are
 * skipped.
 */
export async function buildFetchedRepoFiles(connection: ConnectionLike, ref: RepoRef): Promise<MapRepoFiles> {
  let tree: string[] = [];
  try {
    tree = await getRepoFileTree(connection, ref);
  } catch {
    tree = [];
  }
  const treeSet = new Set(tree.map((p) => p.replace(/^\.\//, "")));

  // Which content files to fetch: only those present in the tree, and only in
  // subdirs that actually contain a manifest (keeps the fetch count bounded).
  const wanted: string[] = [];
  for (const sub of CANDIDATE_SUBDIRS) {
    const prefix = sub ? `${sub}/` : "";
    for (const name of CONTENT_FILES) {
      const path = `${prefix}${name}`;
      if (treeSet.has(path)) wanted.push(path);
    }
  }

  const contents: Record<string, string> = {};
  await Promise.all(
    wanted.map(async (path) => {
      try {
        const content = await fetchRepoFile(connection, ref, path);
        if (content !== null) contents[path] = content;
      } catch {
        // ignore individual fetch failures
      }
    }),
  );

  return new MapRepoFiles(contents, tree);
}

/**
 * Analyze a repository over the git provider API (no clone), returning the same
 * RepoConfig the native pipeline produces from a cloned directory.
 */
export async function analyzeRepoConnection(connection: ConnectionLike, ref: RepoRef): Promise<RepoConfig> {
  const files = await buildFetchedRepoFiles(connection, ref);
  return analyzeRepoFiles(files);
}

export interface RepoRuntimeInfo {
  config: RepoConfig;
  /** "server" (needs a running process) vs "static" bundle. */
  kind: "server" | "static";
  /** Whether the repo's package.json declares its own `start` script. */
  hasStartScript: boolean;
  /**
   * Set when the app builds for a platform-specific runtime (Astro's
   * Vercel/Netlify/Cloudflare adapters) rather than a self-runnable Node
   * server. Such a build produces no startable process, so the deploy should
   * say so explicitly rather than fail with a vague gateway error.
   */
  platformAdapter?: boolean;
  /**
   * A start command safe to hand a builder (Railpack) ONLY when the repo has no
   * `start` script and the analyzer synthesized a concrete server entry (e.g.
   * SSR Astro → "node ./dist/server/entry.mjs"). Undefined when the repo owns
   * its start (Railpack uses it) or when static/undetermined.
   */
  injectableStartCommand?: string;
}

/**
 * Analyze + classify a repo for the Dokploy pipeline: derives the RepoConfig and
 * the deploy-relevant summary (server vs static, start-command injectability).
 */
export async function analyzeRepoRuntime(connection: ConnectionLike, ref: RepoRef): Promise<RepoRuntimeInfo> {
  const files = await buildFetchedRepoFiles(connection, ref);
  const config = analyzeRepoFiles(files);

  // Read the app's package.json (root or detected subdir) to know if the repo
  // declares its own start script — Railpack uses that itself, so we must not
  // override it.
  const pkgPath = config.subDir ? `${config.subDir}/package.json` : "package.json";
  let hasStartScript = false;
  const pkgRaw = files.read(pkgPath);
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as { scripts?: { start?: string } };
      hasStartScript = Boolean(pkg.scripts?.start);
    } catch { /* ignore */ }
  }

  // Derive kind from the RUNTIME first. Feature flags alone are unreliable here:
  // a Laravel repo usually also has a package.json, so the Node analyzer runs
  // and can add "static-export" (Vite assets with a build script and no start
  // script) before the PHP analyzer takes over the runtime. Reading features
  // first made such apps look static, which is plainly wrong for Laravel.
  let kind: "server" | "static";
  if (config.runtime === "php" || config.runtime === "python" || config.runtime === "go") {
    kind = "server";
  } else if (config.runtime === "node") {
    kind = config.features.has("ssr") ? "server" : (config.features.has("static-export") ? "static" : "server");
  } else {
    kind = "static";
  }

  // Only inject a start command for NODE apps.
  //
  // This is deliberately narrow. The analyzer's `startCommand` exists primarily
  // to feed Dockier's own Dockerfile generator, so for non-Node runtimes it can
  // be an artifact of that image rather than a portable command — Laravel's is
  // "/usr/bin/supervisord -c /etc/supervisor/conf.d/app.conf", which only exists
  // in the generated PHP image. Handing that to Railpack/Nixpacks produces a
  // container that cannot start at all (Bad Gateway). For PHP/Python/Go the
  // builder already knows how to run the app, so we never override it.
  //
  // Within Node we still skip "<pm> start" passthroughs, which assume the very
  // start script we've established is missing.
  let injectableStartCommand: string | undefined;
  if (config.runtime === "node" && !hasStartScript && config.startCommand) {
    const isPassthrough = /\b(start|serve)\b/.test(config.startCommand) && /(npm|pnpm|yarn|bun)/.test(config.startCommand);
    if (!isPassthrough) injectableStartCommand = config.startCommand;
  }

  return {
    config,
    kind,
    hasStartScript,
    injectableStartCommand,
    platformAdapter: config.features.has("astro-platform-adapter") || undefined,
  };
}
