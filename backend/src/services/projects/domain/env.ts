import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { encrypt, decrypt } from "../../../shared/crypto.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, throwOnMutationError } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";

export const EnvError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("EnvError");
export type EnvError = InstanceType<typeof EnvError>;

/**
 * Check if a project has an env file stored.
 */
export async function hasEnvFile(params: {
  tenantId: string;
  projectId: string;
}): Promise<boolean> {
  const { tenantId, projectId } = params;
  const { count } = await supabaseAdmin
    .from("project_env_files")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);
  return (count ?? 0) > 0;
}

/**
 * Get masked env content (keys visible, values replaced with bullets).
 */
export async function getMaskedEnv(params: {
  tenantId: string;
  projectId: string;
}): Promise<{ content: string; exists: boolean }> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("project_env_files")
    .select("encrypted_content, iv, auth_tag")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();

  throwOnError(error, EnvError, { internalMsg: "Failed to fetch environment file" });
  if (!data) return { content: "", exists: false };

  // Decrypt to get the real content, then mask values
  const decrypted = decrypt({
    encrypted: data.encrypted_content,
    iv: data.iv,
    authTag: data.auth_tag,
  });

  const masked = decrypted
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      // Preserve comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) return line;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) return line;
      const key = line.slice(0, eqIdx);
      return `${key}=••••••••`;
    })
    .join("\n");

  return { content: masked, exists: true };
}

/**
 * Get the full decrypted env content. Only callable with project:manage permission.
 */
export async function revealEnv(params: {
  tenantId: string;
  projectId: string;
}): Promise<{ content: string; exists: boolean }> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("project_env_files")
    .select("encrypted_content, iv, auth_tag")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();

  throwOnError(error, EnvError, { internalMsg: "Failed to fetch environment file" });
  if (!data) return { content: "", exists: false };

  const decrypted = decrypt({
    encrypted: data.encrypted_content,
    iv: data.iv,
    authTag: data.auth_tag,
  });

  return { content: decrypted, exists: true };
}

/**
 * Save (create or update) the env file content.
 */
export async function saveEnv(params: {
  tenantId: string;
  projectId: string;
  content: string;
}): Promise<void> {
  const { tenantId, projectId, content } = params;

  if (content.length > 64_000) {
    throw new EnvError("Environment file too large (max 64KB)", "bad_request");
  }

  const { encrypted, iv, authTag } = encrypt(content);

  const { data: existing } = await supabaseAdmin
    .from("project_env_files")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("project_env_files")
      .update({
        encrypted_content: encrypted,
        iv,
        auth_tag: authTag,
        updated_at: nowIso(),
      })
      .eq("id", existing.id);
    throwOnMutationError(error, EnvError, { internalMsg: "Failed to save environment file" });
  } else {
    const { error } = await supabaseAdmin
      .from("project_env_files")
      .insert({
        organization_id: tenantId,
        project_id: projectId,
        encrypted_content: encrypted,
        iv,
        auth_tag: authTag,
      });
    throwOnMutationError(error, EnvError, { internalMsg: "Failed to create environment file" });
  }
}

/**
 * Delete the env file for a project.
 */
export async function deleteEnv(params: {
  tenantId: string;
  projectId: string;
}): Promise<void> {
  const { tenantId, projectId } = params;
  const { error } = await supabaseAdmin
    .from("project_env_files")
    .delete()
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);
  throwOnMutationError(error, EnvError, { internalMsg: "Failed to delete environment file" });
}
