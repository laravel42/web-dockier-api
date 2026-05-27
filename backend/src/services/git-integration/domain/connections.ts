import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Database } from "../../../shared/supabase/types.js";

export type GitIntegrationErrorCode = "not_found" | "forbidden" | "bad_request" | "conflict" | "internal" | "precondition_failed";

export class GitIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: GitIntegrationErrorCode,
  ) {
    super(message);
    this.name = "GitIntegrationError";
  }
}

export interface ConnectionRow {
  id: string;
  organization_id: string;
  provider: string;
  personal_token: string;
  label: string;
  repo_url: string;
  endpoint: string;
  created_at: string;
}

/**
 * Fetch a connection by ID. Throws on DB errors and not-found.
 */
export async function getConnection(connectionId: string): Promise<ConnectionRow> {
  const { data, error } = await supabaseAdmin
    .from("git_connections")
    .select("id,organization_id,provider,personal_token,label,repo_url,endpoint,created_at")
    .eq("id", connectionId)
    .single();
  if (error) {
    if (error.code === "PGRST116") throw new GitIntegrationError("Connection not found", "not_found");
    throw new GitIntegrationError(error.message, "internal");
  }
  if (!data) throw new GitIntegrationError("Connection not found", "not_found");
  return data as ConnectionRow;
}

/**
 * Fetch a connection and verify it belongs to the given tenant.
 */
export async function getConnectionForTenant(connectionId: string, tenantId: string): Promise<ConnectionRow> {
  const conn = await getConnection(connectionId);
  if (conn.organization_id !== tenantId) {
    throw new GitIntegrationError("Not your connection", "forbidden");
  }
  return conn;
}

export interface CreateConnectionParams {
  tenantId: string;
  provider: string;
  personalToken: string;
  label: string;
  repoUrl: string;
  endpoint: string;
}

export async function createConnection(params: CreateConnectionParams) {
  const { tenantId, provider, personalToken, label, repoUrl, endpoint } = params;
  if (!tenantId) throw new GitIntegrationError("Tenant ID is required", "bad_request");

  // Check for duplicate
  const { data: existing, error: checkError } = await supabaseAdmin
    .from("git_connections")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("provider", provider)
    .eq("label", label)
    .maybeSingle();
  if (checkError) throw new GitIntegrationError(checkError.message, "internal");
  if (existing) throw new GitIntegrationError(`A ${provider} connection with label "${label}" already exists`, "conflict");

  const id = uuidv4();
  const now = new Date().toISOString();
  const payload = {
    id,
    organization_id: tenantId,
    provider,
    personal_token: personalToken,
    label,
    repo_url: repoUrl,
    endpoint,
    created_at: now,
  };
  const { error } = await supabaseAdmin.from("git_connections").insert(payload);
  if (error) {
    if (error.code === "23505") {
      throw new GitIntegrationError(`A ${provider} connection with label "${label}" already exists`, "conflict");
    }
    throw new GitIntegrationError("Failed to create connection", "internal");
  }

  return {
    id,
    provider: payload.provider,
    label: payload.label,
    repoUrl: payload.repo_url,
    endpoint: payload.endpoint,
    createdAt: now,
  };
}

export async function listConnections(tenantId: string) {
  if (!tenantId) throw new GitIntegrationError("Tenant ID is required", "bad_request");
  const { data, error } = await supabaseAdmin
    .from("git_connections")
    .select("id,provider,label,repo_url,endpoint,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new GitIntegrationError(error.message, "internal");
  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    label: row.label,
    repoUrl: row.repo_url ?? "",
    endpoint: row.endpoint ?? "",
    createdAt: row.created_at,
  }));
}

export async function deleteConnection(connectionId: string, tenantId: string) {
  const conn = await getConnectionForTenant(connectionId, tenantId);
  const { error } = await supabaseAdmin.from("git_connections").delete().eq("id", conn.id);
  if (error) throw new GitIntegrationError("Failed to delete connection", "internal");
}

export interface UpdateConnectionParams {
  connectionId: string;
  tenantId: string;
  label: string;
  personalToken?: string;
}

export async function updateConnection(params: UpdateConnectionParams) {
  const { connectionId, tenantId, label, personalToken } = params;
  const conn = await getConnectionForTenant(connectionId, tenantId);

  const updates: Database["public"]["Tables"]["git_connections"]["Update"] = { label };
  if (personalToken) updates.personal_token = personalToken;

  const { error } = await supabaseAdmin.from("git_connections").update(updates).eq("id", connectionId);
  if (error) {
    if (error.code === "23505") {
      throw new GitIntegrationError(`A ${conn.provider} connection with label "${label}" already exists`, "conflict");
    }
    throw new GitIntegrationError("Failed to update connection", "internal");
  }

  return {
    id: conn.id,
    provider: conn.provider,
    label,
    repoUrl: conn.repo_url ?? "",
    endpoint: conn.endpoint ?? "",
    createdAt: conn.created_at,
  };
}

/**
 * Parse a repo URL into owner/repo components.
 */
export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  const normalized = repoUrl.replace(/\.git$/, "");
  const sshMatch = normalized.match(/^git@[^:]+:([^/]+)\/(.+)$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  try {
    const url = new URL(normalized);
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    return null;
  } catch {
    const parts = normalized.split("/");
    if (parts.length >= 2) return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
    return null;
  }
}
