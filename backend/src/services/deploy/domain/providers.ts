import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type { ProviderRow } from "../types.js";
import { rowToProvider } from "./mappers.js";

export type DeployErrorCode = "not_found" | "forbidden" | "bad_request" | "internal";

export class DeployError extends Error {
  constructor(
    message: string,
    public readonly code: DeployErrorCode,
    public readonly cause?: unknown,
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
  throwOnError(error, DeployError, {
    internalMsg: "Failed to create provider",
    duplicateMsg: `A provider with label "${label}" already exists`,
  });
  return rowToProvider(payload);
}

export async function listProviders(tenantId: string) {
  if (!tenantId) throw new DeployError("Tenant ID is required", "bad_request");
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
  if (provider.organization_id !== tenantId) throw new DeployError("Not your provider", "forbidden");
  return provider;
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

export async function getProviderCredentials(providerId: string) {
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("provider,region,api_key,api_secret")
    .eq("id", providerId)
    .single();
  const creds = unwrapQuery(data, error, DeployError, {
    notFoundMsg: "Provider not found",
    internalMsg: "Failed to fetch provider credentials",
  });
  return {
    provider: creds.provider,
    region: creds.region ?? "",
    apiKey: creds.api_key,
    apiSecret: creds.api_secret,
  };
}
