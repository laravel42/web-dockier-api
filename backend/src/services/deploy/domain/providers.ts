import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList, assertOwnership } from "../../../shared/supabase/query.js";
import type { ProviderRow } from "../types.js";
import { rowToProvider } from "./mappers.js";
import { nowIso } from "../../../shared/utils/time.js";

export const DeployError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "precondition_failed" | "internal">("DeployError");
export type DeployError = InstanceType<typeof DeployError>;

export interface CreateProviderParams {
  tenantId: string;
  provider: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  region?: string;
}

export async function createProvider(params: CreateProviderParams) {
  const { tenantId, provider, label, apiKey, apiSecret, region } = params;

  const id = randomUUID();
  const now = nowIso();
  const payload = {
    id,
    organization_id: tenantId,
    provider,
    label,
    api_key: apiKey,
    api_secret: apiSecret,
    region: region ?? "",
    app_runner_connection_arn: "",
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
    .select("id,provider,label,region,created_at,organization_id")
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
  apiKey?: string;
  apiSecret?: string;
}

export async function updateProvider(params: UpdateProviderParams) {
  const { providerId, tenantId, label, apiKey, apiSecret } = params;
  const existing = await getProviderForTenant(providerId, tenantId);

  const updates: Partial<ProviderRow> = {};
  if (label !== undefined) updates.label = label;
  // Allow rotating the access key id, not just the secret. When credentials
  // are fully rotated in the cloud provider (new access key + secret), the
  // secret-only update path left the stale key id in place, so every deploy
  // kept failing with AuthFailure. Supporting apiKey here makes rotation work.
  if (apiKey !== undefined) updates.api_key = apiKey.trim();
  if (apiSecret !== undefined) updates.api_secret = apiSecret.trim();

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
