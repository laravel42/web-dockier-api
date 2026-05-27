import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { ProviderRow } from "../types.js";
import { rowToProvider } from "./mappers.js";

export type DeployErrorCode = "not_found" | "forbidden" | "bad_request" | "internal";

export class DeployError extends Error {
  constructor(
    message: string,
    public readonly code: DeployErrorCode,
  ) {
    super(message);
    this.name = "DeployError";
  }
}

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
  if (!tenantId) throw new DeployError("Tenant ID is required", "bad_request");

  const id = uuidv4();
  const now = new Date().toISOString();
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
  if (error) {
    if (error.code === "23505") throw new DeployError(`A provider with label "${label}" already exists`, "bad_request");
    throw new DeployError("Failed to create provider", "internal");
  }
  return rowToProvider(payload);
}

export async function listProviders(tenantId: string) {
  if (!tenantId) throw new DeployError("Tenant ID is required", "bad_request");
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("id,provider,label,region,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new DeployError("Failed to list providers", "internal");
  return (data ?? []).map(rowToProvider);
}

export async function getProviderForTenant(providerId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("id,provider,label,region,created_at,organization_id")
    .eq("id", providerId)
    .single();
  if (error) {
    if (error.code === "PGRST116") throw new DeployError("Provider not found", "not_found");
    throw new DeployError("Failed to fetch provider", "internal");
  }
  if (!data) throw new DeployError("Provider not found", "not_found");
  if (data.organization_id !== tenantId) throw new DeployError("Not your provider", "forbidden");
  return data;
}

export interface UpdateProviderParams {
  providerId: string;
  tenantId: string;
  label?: string;
  apiSecret?: string;
}

export async function updateProvider(params: UpdateProviderParams) {
  const { providerId, tenantId, label, apiSecret } = params;
  const existing = await getProviderForTenant(providerId, tenantId);

  const updates: Partial<ProviderRow> = {};
  if (label !== undefined) updates.label = label;
  if (apiSecret !== undefined) updates.api_secret = apiSecret.trim();

  if (Object.keys(updates).length === 0) return rowToProvider(existing);

  const { error } = await supabaseAdmin.from("server_providers").update(updates).eq("id", providerId);
  if (error) {
    if (error.code === "23505") throw new DeployError(`A provider with that label already exists`, "bad_request");
    throw new DeployError("Failed to update provider", "internal");
  }
  return rowToProvider({
    id: existing.id,
    provider: existing.provider,
    label: label ?? existing.label,
    region: existing.region,
    created_at: existing.created_at,
  });
}

export async function deleteProvider(providerId: string, tenantId: string) {
  await getProviderForTenant(providerId, tenantId);

  const { error: deploymentsError } = await supabaseAdmin.from("deployments").delete().eq("provider_id", providerId);
  if (deploymentsError) throw new DeployError("Failed to delete associated deployments", "internal");

  const { error } = await supabaseAdmin.from("server_providers").delete().eq("id", providerId);
  if (error) throw new DeployError("Failed to delete provider", "internal");
}

export async function getProviderCredentials(providerId: string) {
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("provider,region,api_key,api_secret")
    .eq("id", providerId)
    .single();
  if (error) {
    if (error.code === "PGRST116") throw new DeployError("Provider not found", "not_found");
    throw new DeployError("Failed to fetch provider credentials", "internal");
  }
  if (!data) throw new DeployError("Provider not found", "not_found");
  return {
    provider: data.provider,
    region: data.region ?? "",
    apiKey: data.api_key,
    apiSecret: data.api_secret,
  };
}
