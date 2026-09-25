/**
 * Deploy-runtime detection (fetch-based, no clone).
 *
 * The Dokploy pipeline delegates build/start/port to Railpack's zero-config
 * inference. That works for most apps, but breaks for SSR Node apps whose
 * repo has no `start` script: Railpack builds the app but derives no start
 * command, so the container runs nothing and every request is a Bad Gateway.
 * The canonical example is an Astro app using `@astrojs/node` (server output)
 * whose `package.json` only has a `build` script — Astro emits
 * `dist/server/entry.mjs`, but nothing runs it.
 *
 * This module inspects a few manifest/config files (fetched via the git
 * provider API — no clone) and, only when confident, derives an explicit
 * start command + port that the deploy pipeline can hand to Railpack. It is
 * deliberately conservative: when it can't be sure, it returns a low/absent
 * confidence and the pipeline falls back to Railpack's own inference.
 *
 * A sibling of the richer clone-based analyzer in `backend/src/lib/repo-analyzer`
 * (which cannot run here because it reads from disk). Kept separate and small
 * so it can run off fetched file contents.
 */

/** Files this module needs to make a decision. Fetched best-effort. */
export const DEPLOY_RUNTIME_FILES = [
  "package.json",
  "astro.config.mjs",
  "astro.config.ts",
  "astro.config.js",
  "astro.config.mts",
  "nuxt.config.ts",
  "nuxt.config.mjs",
  "nuxt.config.js",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
] as const;

export type DeployKind = "static" | "server";

export interface DeployRuntime {
  /** "server" needs a running process; "static" is a built bundle. */
  kind: DeployKind;
  /** Framework, when identified (astro/nuxt/next/...). */
  framework?: string;
  /**
   * The command that starts the server, when we can derive one with high
   * confidence AND the repo doesn't already declare a `start` script (Railpack
   * would use that itself). Undefined means "let Railpack decide".
   */
  startCommand?: string;
  /** Port the server is expected to listen on once PORT is injected. */
  port?: number;
  /**
   * Confidence in the descriptor, 0–100. The pipeline only overrides Railpack
   * when this is high (see HIGH_CONFIDENCE). Lower values are advisory.
   */
  confidence: number;
  /** Whether the repo declares its own `start` script (Railpack will use it). */
  hasStartScript: boolean;
}

/** Confidence at/above which the pipeline should apply an explicit override. */
export const HIGH_CONFIDENCE = 80;

interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
}

function parsePackageJson(content: string | undefined): PackageJsonShape | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as PackageJsonShape;
  } catch {
    return null;
  }
}

function firstConfig(files: Record<string, string>, names: string[]): string | undefined {
  for (const name of names) {
    // Match on basename so a config in the repo root or a known path is found.
    const key = Object.keys(files).find((f) => f.toLowerCase().endsWith(name));
    if (key) return files[key];
  }
  return undefined;
}

/**
 * Astro-specific runtime detection.
 *
 * Static vs SSR is decided by two independent signals, matching the semantics
 * of the clone-based analyzer:
 *   - A server adapter dependency (`@astrojs/node`/`vercel`/`netlify`/
 *     `cloudflare`), OR
 *   - `output: "server" | "hybrid"` in astro.config.*
 * Either means the app renders on-demand and needs a running server. Only the
 * Node adapter produces a self-runnable server we can start ourselves
 * (`dist/server/entry.mjs`), so we only emit a startCommand in that case.
 */
function detectAstro(
  pkg: PackageJsonShape,
  deps: Record<string, string>,
  files: Record<string, string>,
): DeployRuntime | null {
  if (!deps["astro"]) return null;

  const hasStartScript = Boolean(pkg.scripts?.start);
  const nodeAdapter = Boolean(deps["@astrojs/node"]);
  const otherServerAdapter = Boolean(
    deps["@astrojs/vercel"] || deps["@astrojs/netlify"] || deps["@astrojs/cloudflare"],
  );

  const config = firstConfig(files, ["astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.mts"]);
  const configSaysServer = config ? /output\s*:\s*['"](server|hybrid)['"]/.test(config) : false;

  const isServer = nodeAdapter || otherServerAdapter || hasStartScript || configSaysServer;

  if (!isServer) {
    return { kind: "static", framework: "astro", confidence: HIGH_CONFIDENCE, hasStartScript };
  }

  // SSR. If the repo already has a start script, Railpack will use it — don't
  // override, just report the kind.
  if (hasStartScript) {
    return { kind: "server", framework: "astro", port: 3000, confidence: HIGH_CONFIDENCE, hasStartScript };
  }

  // The Node adapter emits a standalone server at dist/server/entry.mjs. This
  // is the documented entry for @astrojs/node standalone mode, so we can start
  // it ourselves with high confidence.
  if (nodeAdapter) {
    return {
      kind: "server",
      framework: "astro",
      startCommand: "node ./dist/server/entry.mjs",
      port: 3000,
      confidence: HIGH_CONFIDENCE,
      hasStartScript,
    };
  }

  // Server output via a non-Node adapter (vercel/netlify/cloudflare) without a
  // start script: the build targets a platform-specific runtime, not a plain
  // Node server we can launch. Report the kind but leave the start command to
  // Railpack (low confidence — this deploy likely needs manual attention).
  return { kind: "server", framework: "astro", port: 3000, confidence: 40, hasStartScript };
}

/**
 * Derive a deploy-runtime descriptor from fetched manifest/config files.
 *
 * `files` is a map of path → contents (a subset of DEPLOY_RUNTIME_FILES that
 * were found). Returns null when there's no package.json (not a Node app) or
 * when nothing actionable can be determined.
 */
export function detectDeployRuntime(files: Record<string, string>): DeployRuntime | null {
  const pkg = parsePackageJson(firstConfig(files, ["package.json"]));
  if (!pkg) return null;

  const deps: Record<string, string> = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  // Astro is the case that motivated this; handle it explicitly.
  const astro = detectAstro(pkg, deps, files);
  if (astro) return astro;

  // Other frameworks: report kind/hasStartScript where cheap, but don't invent
  // start commands — Railpack infers these reliably from a `start` script or
  // framework provider. Kept minimal on purpose.
  const hasStartScript = Boolean(pkg.scripts?.start);

  // Next.js / Nuxt / SvelteKit / Remix are SSR-by-default Node servers; if they
  // ship a start script Railpack handles them. We only note the kind.
  if (deps["next"] || deps["nuxt"] || deps["@sveltejs/kit"] || deps["@remix-run/node"] || deps["remix"]) {
    return { kind: "server", port: 3000, confidence: hasStartScript ? HIGH_CONFIDENCE : 50, hasStartScript };
  }

  return null;
}
