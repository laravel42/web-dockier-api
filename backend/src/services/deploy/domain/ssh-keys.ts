import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapList } from "../../../shared/supabase/query.js";
import { DeployError } from "./providers.js";

export async function listSshKeys(tenantId: string) {
  if (!tenantId) throw new DeployError("Tenant ID is required", "bad_request");
  const { data, error } = await supabaseAdmin
    .from("ssh_keys")
    .select("id,label,public_key,fingerprint,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  const rows = unwrapList(data, error, DeployError, { internalMsg: "Failed to list SSH keys" });
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    publicKey: row.public_key,
    fingerprint: row.fingerprint ?? "",
    createdAt: row.created_at,
  }));
}

export interface CreateSshKeyParams {
  tenantId: string;
  label: string;
  publicKey: string;
}

export async function createSshKey(params: CreateSshKeyParams) {
  const { tenantId, label, publicKey: rawKey } = params;
  if (!tenantId) throw new DeployError("Tenant ID is required", "bad_request");

  const publicKey = rawKey.trim();
  if (!publicKey.startsWith("ssh-") && !publicKey.startsWith("ecdsa-")) {
    throw new DeployError("Invalid SSH public key format", "bad_request");
  }

  const parts = publicKey.split(/\s+/);
  if (parts.length < 2 || parts[1].length < 20) {
    throw new DeployError("Invalid SSH public key format: missing key data", "bad_request");
  }
  const fingerprint = `SHA256:${parts[1].slice(0, 16)}...`;
  const id = randomUUID();
  const payload = {
    id,
    organization_id: tenantId,
    label,
    public_key: publicKey,
    fingerprint,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("ssh_keys").insert(payload);
  throwOnError(error, DeployError, {
    internalMsg: "Failed to create SSH key",
    duplicateMsg: `An SSH key with label "${label}" already exists`,
  });
  return {
    id,
    label: payload.label,
    publicKey,
    fingerprint,
    createdAt: payload.created_at,
  };
}

export async function deleteSshKey(keyId: string, tenantId: string) {
  if (!tenantId) throw new DeployError("Tenant ID is required", "bad_request");
  const { error } = await supabaseAdmin
    .from("ssh_keys")
    .delete()
    .eq("id", keyId)
    .eq("organization_id", tenantId);
  throwOnError(error, DeployError, { internalMsg: "Failed to delete SSH key" });
}
