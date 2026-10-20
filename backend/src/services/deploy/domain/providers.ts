import { randomUUID } from "node:crypto";
import { encryptJson, readEncryptedOr } from "../../../shared/auth/crypto.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList, assertOwnership } from "../../../shared/supabase/query.js";
import type { ProviderRow } from "../types.js";
import { rowToProvider } from "./mappers.js";
import { nowIso } from "../../../shared/utils/time.js";
import { buildProviderCredential, parseProviderCredential, type ProviderCredential } from "../../../lib/provider-credentials.js";

export const DeployError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "precondition_failed" | "internal">("DeployError");
export type DeployError = InstanceType<typeof DeployError>;

/** Raw per-provider credential fields accepted from the API. */
export interface ProviderCredentialInput {
  accessKeyId?: string;
  secretAccessKey?: string;
  serviceAccountKey?: string;
}

export interface CreateProviderParams {
  tenantId: string;
  provider: string;
  label: string;
  credentials: ProviderCredentialInput;
  region?: string;
}

export async function createProvider(params: CreateProviderParams) {
  const { tenantId, provider, label, credentials, region } = params;

  // Throws DeployError-compatible on unknown provider; normalizes into the
  // typed credential shape stored as JSONB.
  const credential = buildProviderCredential(provider, credentials);

  const id = randomUUID();
  const now = nowIso();
  const payload = {
    id,
    organization_id: tenantId,
    provider,
    label,
    // The JSONB column is NOT NULL and kept until a later migration drops it.
    credentials: {} as Record<string, unknown>,
    credentials_encrypted: encryptJson(credential),
    region: region ?? "",
    created_at: now,
  };
  const { error } = await supabaseAdmin.from("server_providers").insert(payload);
  throwOnError(error, DeployError, {
    internalMsg: "Failed to create provider",
    duplicateMsg: `A provider with label "${label}" already exists`,
  });
  return rowToProvider(payload);
}

export async function listProviders(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("id,provider,label,region,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  const rows = unwrapList(data, error, DeployError, { internalMsg: "Failed to list providers" });
  return rows.map(rowToProvider);
}

export async function getProviderForTenant(providerId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("id,provider,label,region,credentials,credentials_encrypted,created_at,organization_id")
    .eq("id", providerId)
    .single();
  const provider = unwrapQuery(data, error, DeployError, {
    notFoundMsg: "Provider not found",
    internalMsg: "Failed to fetch provider",
  });
  assertOwnership(provider, tenantId, DeployError, "Not your provider");
  return provider;
}

export interface UpdateProviderParams {
  providerId: string;
  tenantId: string;
  label?: string;
  credentials?: ProviderCredentialInput;
}

export async function updateProvider(params: UpdateProviderParams) {
  const { providerId, tenantId, label, credentials } = params;
  const existing = await getProviderForTenant(providerId, tenantId);

  const updates: Partial<ProviderRow> = {};
  if (label !== undefined) updates.label = label;

  // Merge credential rotation over the existing stored credential. Only fields
  // the caller actually supplied are overwritten, so a partial update (e.g.
  // rotating just the AWS secret, or replacing a GCP service-account key)
  // preserves the other fields rather than blanking them. This keeps full AWS
  // key rotation (new id + secret) working while allowing single-field edits.
  if (credentials !== undefined) {
    let existingRaw: unknown;
    try {
      existingRaw = readEncryptedOr(existing.credentials_encrypted, existing.credentials);
    } catch {
      throw new DeployError(
        "Could not decrypt this provider's stored credentials. Re-enter every credential field for this provider.",
        "internal",
      );
    }
    updates.credentials_encrypted = encryptJson(mergeCredential(existing.provider, existingRaw, credentials));
    // Blank the legacy plaintext blob so a rotated credential is not left behind in the clear.
    updates.credentials = {};
  }

  if (Object.keys(updates).length === 0) return rowToProvider(existing);

  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .update(updates)
    .eq("id", providerId)
    .select("id,provider,label,region,created_at")
    .single();
  const provider = unwrapQuery(data, error, DeployError, {
    internalMsg: "Failed to update provider",
    duplicateMsg: "A provider with that label already exists",
  });
  return rowToProvider(provider);
}

export async function deleteProvider(providerId: string, tenantId: string) {
  await getProviderForTenant(providerId, tenantId);

  const { error: deploymentsError } = await supabaseAdmin.from("deployments").delete().eq("provider_id", providerId);
  throwOnError(deploymentsError, DeployError, { internalMsg: "Failed to delete associated deployments" });

  const { error } = await supabaseAdmin.from("server_providers").delete().eq("id", providerId);
  throwOnError(error, DeployError, { internalMsg: "Failed to delete provider" });
}

/**
 * Overlay caller-supplied credential fields onto the existing stored credential.
 * Only non-empty supplied fields overwrite; everything else is preserved. This
 * powers partial credential rotation from the update endpoint.
 */
function mergeCredential(
  provider: string,
  existingRaw: unknown,
  input: ProviderCredentialInput,
): ProviderCredential {
  const existing = parseProviderCredential(provider, existingRaw);

  if (existing.kind === "aws") {
    return {
      kind: "aws",
      accessKeyId: input.accessKeyId?.trim() || existing.accessKeyId,
      secretAccessKey: input.secretAccessKey?.trim() || existing.secretAccessKey,
    };
  }

  return {
    kind: "gcp",
    serviceAccountKey: input.serviceAccountKey?.trim() || existing.serviceAccountKey,
  };
}
