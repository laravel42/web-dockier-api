/**
 * Git Connections Service Client
 *
 * Thin cross-service accessor for git connection credentials.
 * Used by deploy and image-builder services that need clone credentials
 * without depending directly on the git-integration domain module.
 *
 * This is the canonical point of access — when the underlying table schema
 * or access pattern changes, only this file needs updating.
 */

import { supabaseAdmin } from "../supabase/client.js";

export interface GitConnectionCredentials {
  provider: string;
  token: string;
  endpoint: string;
}

/**
 * Fetch the clone credentials for a git connection.
 *
 * Returns null if the connection doesn't exist or the query fails.
 * Consumers should throw their own domain-appropriate error on null.
 *
 * @example
 * ```ts
 * const creds = await getGitConnectionCredentials(connectionId);
 * if (!creds) throw new Error("Git connection not found");
 * ```
 */
export async function getGitConnectionCredentials(connectionId: string): Promise<GitConnectionCredentials | null> {
  if (!connectionId) return null;

  const { data, error } = await supabaseAdmin
    .from("git_connections")
    .select("provider, personal_token, endpoint")
    .eq("id", connectionId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    provider: data.provider || "",
    token: data.personal_token || "",
    endpoint: data.endpoint || "",
  };
}
