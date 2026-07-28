/**
 * Git Connections Service Client
 *
 * Thin cross-service accessor for git connection credentials.
 * Used by deploy and image-builder services that need clone credentials
 * without depending directly on the git-integration domain module.
 *
 * This is the canonical point of access — when the underlying table schema
 * or access pattern changes, only this file needs updating.
 *
 * Includes timeout and retry logic because this sits on the critical path
 * of the deploy pipeline — a hanging query here blocks the entire deployment.
 */

import { supabaseAdmin } from "../supabase/client.js";
import { logger } from "../logger.js";
import { withRetry } from "../retry.js";

export interface GitConnectionCredentials {
  provider: string;
  token: string;
  endpoint: string;
}

/**
 * Fetch the clone credentials for a git connection.
 *
 * Returns null if the connection doesn't exist, the query fails after
 * retries, or the timeout is exceeded. Consumers should throw their
 * own domain-appropriate error on null.
 *
 * Includes:
 * - 8s timeout per attempt (prevents indefinite hangs on DNS/network issues)
 * - 1 retry with 1s backoff (handles transient connection pool exhaustion)
 *
 * @example
 * ```ts
 * const creds = await getGitConnectionCredentials(connectionId);
 * if (!creds) throw new Error("Git connection not found");
 * ```
 */
export async function getGitConnectionCredentials(connectionId: string): Promise<GitConnectionCredentials | null> {
  if (!connectionId) return null;

  try {
    const data = await withRetry(
      async () => {
        const result = await supabaseAdmin
          .from("git_connections")
          .select("provider, personal_token, endpoint")
          .eq("id", connectionId)
          .maybeSingle();

        // No error + no data = legitimate "not found" — don't retry
        if (!result.error && !result.data) return null;

        // Query error — throw so withRetry retries the attempt
        if (result.error) {
          throw result.error;
        }

        return result.data;
      },
      {
        attempts: 2,
        backoffMs: 1_000,
        timeoutMs: 8_000,
        label: "git-connection-credentials",
      },
    );

    if (!data) return null;

    return {
      provider: data.provider || "",
      token: data.personal_token || "",
      endpoint: data.endpoint || "",
    };
  } catch (err) {
    logger.warn({ err, connectionId }, "[git-connections] Credential fetch failed after retries");
    return null;
  }
}

// ─── Full Connection Access (tenant-scoped) ────────────────────────

/**
 * Fetch a full git connection row with tenant ownership verification.
 *
 * Re-exports from the git-integration service domain. Used by the
 * code-analysis scan worker which needs the full connection (provider,
 * token, endpoint) to clone a repository for scanning.
 */
export { getConnectionForTenant } from "../../services/git-integration/domain/connections.js";
