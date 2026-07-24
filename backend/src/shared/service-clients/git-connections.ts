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

export interface GitConnectionCredentials {
  provider: string;
  token: string;
  endpoint: string;
}

/** Timeout for the Supabase query (ms). Fail fast rather than hang. */
const QUERY_TIMEOUT_MS = 8_000;

/** Number of attempts before giving up. */
const MAX_ATTEMPTS = 2;

/** Delay between retries (ms). */
const RETRY_DELAY_MS = 1_000;

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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await Promise.race([
        supabaseAdmin
          .from("git_connections")
          .select("provider, personal_token, endpoint")
          .eq("id", connectionId)
          .maybeSingle(),
        rejectAfterTimeout(QUERY_TIMEOUT_MS),
      ]);

      if (result.error || !result.data) {
        if (result.error) {
          logger.warn({ err: result.error, connectionId, attempt }, "[git-connections] Query failed");
        }
        // Don't retry on "not found" — that's a legitimate empty result
        if (!result.error) return null;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return null;
      }

      return {
        provider: result.data.provider || "",
        token: result.data.personal_token || "",
        endpoint: result.data.endpoint || "",
      };
    } catch (err) {
      logger.warn({ err, connectionId, attempt }, "[git-connections] Credential fetch failed");
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return null;
    }
  }

  return null;
}

// ─── Internal Helpers ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rejectAfterTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Git connection query timed out after ${ms}ms`)), ms),
  );
}
