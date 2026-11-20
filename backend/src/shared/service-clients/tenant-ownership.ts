/**
 * Ownership checks for ids that arrive in a request body.
 *
 * A project or git connection id is a UUID, but it is not a secret: the project
 * id is in every deploy hook URL, and a former member keeps the ids they saw.
 * Every id a caller supplies must be checked against the caller's tenant before
 * anything keyed on it runs (the deploy pipeline reuses the project's server,
 * application and env, and clones with the connection's token).
 */
import { supabaseAdmin } from "../supabase/client.js";

/** True when the row exists in the tenant. An empty id counts as owned: there is nothing to check. */
async function belongsToTenant(table: "projects" | "git_connections", id: string | null | undefined, tenantId: string): Promise<boolean> {
  if (!id) return true;
  const { data, error } = await supabaseAdmin.from(table).select("id").eq("id", id).eq("organization_id", tenantId).maybeSingle();
  if (error) throw new Error(`Failed to verify ${table} ownership`);
  return data !== null;
}

export function projectBelongsToTenant(projectId: string | null | undefined, tenantId: string): Promise<boolean> {
  return belongsToTenant("projects", projectId, tenantId);
}

export function gitConnectionBelongsToTenant(connectionId: string | null | undefined, tenantId: string): Promise<boolean> {
  return belongsToTenant("git_connections", connectionId, tenantId);
}
