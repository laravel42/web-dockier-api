/**
 * Stage helper: resolve the server start command for the Dokploy pipeline.
 *
 * The Dokploy pipeline never clones the repo — it delegates build/start to
 * Railpack. That breaks SSR Node apps whose repo has no `start` script: Railpack
 * builds them but derives no start command, so the container runs nothing and
 * every request is a Bad Gateway (the Astro `@astrojs/node` case).
 *
 * To fix that without depending on the frontend passing anything, this helper
 * re-derives the start command inside the pipeline: it fetches the handful of
 * root manifest/config files over the git provider API (no clone) and runs the
 * shared `detectDeployRuntime`. It returns a start command ONLY when detection
 * is high-confidence; otherwise it returns undefined and the pipeline lets
 * Railpack infer as before.
 *
 * Best-effort and non-fatal: any fetch/detection failure returns undefined so a
 * deploy never breaks because runtime resolution had a hiccup.
 */

import { getGitConnectionCredentials } from "../../../../../shared/service-clients/git-connections.js";
import { fetchRepoFile, type ConnectionLike, type RepoRef } from "../../../../git-integration/domain/providers/provider-client.js";
import {
  detectDeployRuntime,
  DEPLOY_RUNTIME_FILES,
  HIGH_CONFIDENCE,
} from "../../../../git-integration/domain/deploy-runtime.js";

export interface ResolvedRuntime {
  /** High-confidence start command, or undefined to let Railpack infer. */
  startCommand?: string;
  /** Detected framework (e.g. "astro"), when known. */
  framework?: string;
  /** "server" (needs a running process) vs "static". */
  kind?: "server" | "static";
  /** Whether the repo declares its own `start` script. */
  hasStartScript?: boolean;
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

    // Fetch the known root config files directly by path (avoids a full tree
    // listing). Misses are fine — detection degrades to lower confidence.
    const files: Record<string, string> = {};
    await Promise.all(
      DEPLOY_RUNTIME_FILES.map(async (name) => {
        try {
          const content = await fetchRepoFile(connection, ref, name);
          if (content) files[name] = content;
        } catch {
          // ignore individual fetch failures
        }
      }),
    );

    const runtime = detectDeployRuntime(files);
    if (!runtime) return {};

    const descriptor = {
      framework: runtime.framework,
      kind: runtime.kind,
      hasStartScript: runtime.hasStartScript,
    };

    // Only override Railpack when we're confident AND the repo doesn't already
    // declare its own start script (Railpack would use that itself).
    if (runtime.startCommand && runtime.confidence >= HIGH_CONFIDENCE && !runtime.hasStartScript) {
      await log(
        `[stage:configure-app] Detected ${runtime.framework ?? "server"} app with no start script — using "${runtime.startCommand}".`,
      );
      return { startCommand: runtime.startCommand, ...descriptor };
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
