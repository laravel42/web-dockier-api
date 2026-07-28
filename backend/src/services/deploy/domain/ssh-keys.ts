import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapList } from "../../../shared/supabase/query.js";
import { DeployError } from "./providers.js";
import { nowIso } from "../../../shared/utils/time.js";

/** Compare keys by algorithm + key data (ignore optional comment). */
export function normalizeSshPublicKey(publicKey: string): string {
  const parts = publicKey.trim().split(/\s+/);
  if (parts.length < 2) return publicKey.trim();
  return `${parts[0]} ${parts[1]}`;
}

async function findDuplicateSshKey(tenantId: string, publicKey: string): Promise<boolean> {
  const normalized = normalizeSshPublicKey(publicKey);
  const { data, error } = await supabaseAdmin
    .from("ssh_keys")
    .select("public_key")
    .eq("organization_id", tenantId);
  throwOnError(error, DeployError, { internalMsg: "Failed to validate SSH key" });
  return (data ?? []).some((row) => normalizeSshPublicKey(row.public_key) === normalized);
}

export async function listSshKeys(tenantId: string) {
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

  const publicKey = rawKey.trim();
  if (!publicKey.startsWith("ssh-") && !publicKey.startsWith("ecdsa-")) {
    throw new DeployError("Invalid SSH public key format", "bad_request");
  }

  const parts = publicKey.split(/\s+/);
  if (parts.length < 2 || parts[1].length < 20) {
    throw new DeployError("Invalid SSH public key format: missing key data", "bad_request");
  }

  if (await findDuplicateSshKey(tenantId, publicKey)) {
    throw new DeployError("This SSH public key is already registered", "bad_request");
  }

  const fingerprint = `SHA256:${parts[1].slice(0, 16)}...`;
  const id = randomUUID();
  const payload = {
    id,
    organization_id: tenantId,
    label,
    public_key: publicKey,
    fingerprint,
    created_at: nowIso(),
  };
  const { error } = await supabaseAdmin.from("ssh_keys").insert(payload);
  throwOnError(error, DeployError, {
    internalMsg: "Failed to create SSH key",
    duplicateMsg: "This SSH public key is already registered",
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
  const { error, count } = await supabaseAdmin
    .from("ssh_keys")
    .delete({ count: "exact" })
    .eq("id", keyId)
    .eq("organization_id", tenantId);
  throwOnError(error, DeployError, { internalMsg: "Failed to delete SSH key" });
  if (count === 0) throw new DeployError("SSH key not found", "not_found");
}
