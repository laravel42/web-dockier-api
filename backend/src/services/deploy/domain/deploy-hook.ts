/**
 * Project Deploy Hook Tokens
 *
 * The project-specific deploy hook (`POST /projects/:projectId/deploy/hook`)
 * is self-authenticating: the only credential is the `token` query param.
 *
 * Historically that token was `projectId.slice(0, 8)` — derived entirely from
 * the caller-visible project id, so anyone who knew the URL knew the secret.
 * Projects now get a strong random token stored at `settings.deployHookToken`
 * when push-to-deploy is enabled, and the legacy prefix stays accepted so hook
 * URLs already configured on a Git provider keep working.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";

/** Generate a strong deploy hook token (64 hex chars / 256 bits). */
export function generateDeployHookToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * The legacy, caller-derivable token: the first 8 characters of the project id.
 *
 * Still accepted as a fallback for hook URLs already in the wild (the frontend
 * builds one from `project.id.slice(0, 8)`), which is why it must not be removed.
 */
export function legacyDeployHookToken(projectId: string): string {
  return projectId.slice(0, 8);
}

/** Compare two strings in constant time, with a length pre-check. */
function timingSafeMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export interface VerifyDeployHookTokenParams {
  projectId: string;
  /** The token supplied by the caller. */
  provided: string;
  /** The strong token stored at `settings.deployHookToken`, when the project has one. */
  storedToken?: string | null;
}

/**
 * Verify a deploy hook token against the stored strong token and the legacy
 * project-id prefix.
 *
 * Both candidates are evaluated before the result is combined — no
 * short-circuiting — so the work done does not reveal which candidate matched.
 */
export function verifyDeployHookToken(params: VerifyDeployHookTokenParams): boolean {
  const { projectId, provided, storedToken } = params;
  if (!provided) return false;

  const legacyMatch = timingSafeMatch(provided, legacyDeployHookToken(projectId));
  const storedMatch = storedToken ? timingSafeMatch(provided, storedToken) : false;

  return legacyMatch || storedMatch;
}

/**
 * Load the repo/branch/settings a deploy hook call needs.
 *
 * Returns the raw Supabase `{ project, error }` pair so the route can keep its
 * existing "Project not found" response for either failure mode.
 */
export async function getProjectForDeployHook(projectId: string) {
  const { data: project, error } = await supabaseAdmin
    .from("projects")
    .select("id, organization_id, repository, branch, connection_id, settings")
    .eq("id", projectId)
    .maybeSingle();

  return { project, error };
}

/** Read the strong deploy hook token out of a project's `settings` jsonb. */
export function readStoredDeployHookToken(settings: Record<string, unknown> | null): string | null {
  const stored = settings?.deployHookToken;
  return typeof stored === "string" && stored.length > 0 ? stored : null;
}
