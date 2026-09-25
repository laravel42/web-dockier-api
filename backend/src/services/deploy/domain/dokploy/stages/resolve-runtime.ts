/**
 * Stage helper: resolve the server start command for the Dokploy pipeline.
 *
 * The Dokploy pipeline never clones the repo — it delegates build/start to
 * Railpack. That breaks SSR Node apps whose repo has no `start` script: Railpack
 * builds them but derives no start command, so the container runs nothing and
 * every request is a Bad Gateway (the Astro `@astrojs/node` case).
 *
 * This helper re-derives the start command inside the pipeline using the SAME
 * repo analyzer the native pipeline uses (`analyzeRepoRuntime`), run over files
 * fetched from the git provider API (no clone). It returns a start command ONLY
 * when the repo has no `start` script and the analyzer produced a concrete
 * server entry; otherwise it returns undefined and the pipeline lets Railpack
 * infer as before.
 *
 * Best-effort and non-fatal: any failure returns undefined so a deploy never
 * breaks because runtime resolution had a hiccup.
 */

import { getGitConnectionCredentials } from "../../../../../shared/service-clients/git-connections.js";
import { type ConnectionLike, type RepoRef } from "../../../../git-integration/domain/providers/provider-client.js";
import { analyzeRepoRuntime } from "../../../../git-integration/domain/repo-config.js";

export interface ResolvedRuntime {
  /** High-confidence start command, or undefined to let Railpack infer. */
  startCommand?: string;
  /** Detected framework (e.g. "astro"), when known. */
  framework?: string;
  /** "server" (needs a running process) vs "static". */
  kind?: "server" | "static";
  /** Whether the repo declares its own `start` script. */
  hasStartScript?: boolean;
  /**
   * True when the build targets a platform runtime (Astro Vercel/Netlify/
   * Cloudflare adapter) and therefore has no startable Node server.
   */
  platformAdapter?: boolean;
  /** Detected runtime ("php", "node", ...) — used for builder selection. */
  runtime?: string;
  /**
   * Detected PHP version from composer.json (e.g. "8.1"). Railpack only supports
   * 8.2+, so this drives a fallback to Nixpacks for older apps.
   */
  phpVersion?: string;
}

/**
 * Resolve a high-confidence start command for the repo, or undefined.
 *
 * @param explicit A start command already supplied on the deploy event (e.g.
 *   from the wizard). When present it wins and no fetch happens.
 */
export async function resolveRuntimeStartCommand(params: {
  gitConnectionId: string;
  repo: string;
  branch: string;
  explicit?: string;
  log: (line: string) => Promise<void>;
}): Promise<ResolvedRuntime> {
  const { gitConnectionId, repo, branch, explicit, log } = params;

  if (explicit && explicit.trim()) {
    return { startCommand: explicit.trim() };
  }

  try {
    const creds = await getGitConnectionCredentials(gitConnectionId);
    if (!creds) return {};

    const connection: ConnectionLike = {
      provider: creds.provider.toLowerCase(),
      personal_token: creds.token,
      endpoint: creds.endpoint || null,
    };
    const [owner, repository] = parseOwnerRepo(repo);
    const ref: RepoRef = { owner, repo: repository, branch };

    const runtime = await analyzeRepoRuntime(connection, ref);
    const descriptor: ResolvedRuntime = {
      framework: runtime.config.framework || undefined,
      kind: runtime.kind,
      hasStartScript: runtime.hasStartScript,
      platformAdapter: runtime.platformAdapter,
      runtime: runtime.config.runtime,
      phpVersion: runtime.config.phpVersion || undefined,
    };

    if (runtime.platformAdapter) {
      await log(
        `[stage:configure-app] This Astro app uses a platform adapter (Vercel/Netlify/Cloudflare), which builds a ` +
        `serverless handler rather than a Node server. To deploy it here, switch to @astrojs/node with ` +
        `mode: "standalone".`,
      );
    }

    if (runtime.injectableStartCommand) {
      await log(
        `[stage:configure-app] Detected ${runtime.config.framework || "server"} app with no start script — using "${runtime.injectableStartCommand}".`,
      );
      return { startCommand: runtime.injectableStartCommand, ...descriptor };
    }

    return descriptor;
  } catch {
    // Non-fatal: fall back to Railpack's own inference.
    return {};
  }
}

function parseOwnerRepo(repo: string): [string, string] {
  const cleaned = repo.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "");
  const parts = cleaned.split("/");
  if (parts.length >= 2) return [parts[0], parts.slice(1).join("/")];
  return [cleaned, cleaned];
}
