import { randomUUID } from "node:crypto";
import { encryptJson, decryptJson } from "../../../shared/crypto.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList, assertOwnership } from "../../../shared/supabase/query.js";
import type { Database } from "../../../shared/supabase/types.js";
import { rowToSummary } from "./mappers.js";

export const PM_PROVIDERS = ["linear", "jira"] as const;
export type PMProvider = (typeof PM_PROVIDERS)[number];

export const IntegrationsError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "conflict" | "internal">("IntegrationsError");
export type IntegrationsError = InstanceType<typeof IntegrationsError>;

export interface PMIntegrationRow {
  id: string;
  organization_id: string;
  provider: string;
  name: string;
  credentials_encrypted: string;
  enabled: boolean;
  created_at: string;
}

export interface PMIntegrationCredentials {
  config: Record<string, string>;
}

function parseCredentials(encrypted: string): PMIntegrationCredentials {
  const payload = decryptJson(encrypted);
  const config = payload.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new IntegrationsError("Invalid integration credentials", "internal");
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (typeof value === "string") normalized[key] = value;
  }
  return { config: normalized };
}

export function assertPMProvider(provider: string): PMProvider {
  if (!PM_PROVIDERS.includes(provider as PMProvider)) {
    throw new IntegrationsError(`Unsupported PM provider: ${provider}`, "bad_request");
  }
  return provider as PMProvider;
}

export async function getPMIntegrationForTenant(integrationId: string, tenantId: string): Promise<PMIntegrationRow> {
  const { data, error } = await supabaseAdmin
    .from("pm_integrations")
    .select("id,organization_id,provider,name,credentials_encrypted,enabled,created_at")
    .eq("id", integrationId)
    .single();
  const row = unwrapQuery(data, error, IntegrationsError, {
    notFoundMsg: "Integration not found",
    internalMsg: "Failed to fetch integration",
  }) as PMIntegrationRow;
  assertOwnership(row, tenantId, IntegrationsError, "Not your integration");
  return row;
}

export async function getPMIntegrationConfig(integrationId: string, tenantId: string) {
  const row = await getPMIntegrationForTenant(integrationId, tenantId);
  if (!row.enabled) throw new IntegrationsError("Integration is disabled", "bad_request");
  const { config } = parseCredentials(row.credentials_encrypted);
  return { type: row.provider, config };
}

export interface CreatePMIntegrationParams {
  tenantId: string;
  provider: string;
  name: string;
  config: Record<string, string>;
  enabled?: boolean;
}

export async function createPMIntegration(params: CreatePMIntegrationParams) {
  const { tenantId, provider, name, config, enabled = true } = params;
  assertPMProvider(provider);

  const { data: existing, error: checkError } = await supabaseAdmin
    .from("pm_integrations")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();
  throwOnError(checkError, IntegrationsError, { internalMsg: "Failed to check for duplicate integration" });
  if (existing) throw new IntegrationsError(`A ${provider} integration already exists`, "conflict");

  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = {
    id,
    organization_id: tenantId,
    provider,
    name,
    credentials_encrypted: encryptJson({ config }),
    enabled,
    created_at: now,
  };
  const { error } = await supabaseAdmin.from("pm_integrations").insert(payload);
  throwOnError(error, IntegrationsError, {
    internalMsg: "Failed to create integration",
    duplicateMsg: `A ${provider} integration already exists`,
  });
  return rowToSummary(payload);
}

export async function listPMIntegrations(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("pm_integrations")
    .select("id,provider,name,enabled,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  const rows = unwrapList(data, error, IntegrationsError, { internalMsg: "Failed to list integrations" });
  return rows.map((row) => rowToSummary(row as PMIntegrationRow));
}

export interface UpdatePMIntegrationParams {
  integrationId: string;
  tenantId: string;
  name?: string;
  config?: Record<string, string>;
  enabled?: boolean;
}

export async function updatePMIntegration(params: UpdatePMIntegrationParams) {
  const { integrationId, tenantId, name, config, enabled } = params;
  const existing = await getPMIntegrationForTenant(integrationId, tenantId);

  const updates: Database["public"]["Tables"]["pm_integrations"]["Update"] = {};
  if (name !== undefined) updates.name = name;
  if (enabled !== undefined) updates.enabled = enabled;
  if (config !== undefined) {
    updates.credentials_encrypted = encryptJson({ config });
  }

  if (Object.keys(updates).length === 0) return rowToSummary(existing);

  const { data, error } = await supabaseAdmin
    .from("pm_integrations")
    .update(updates)
    .eq("id", integrationId)
    .select("id,provider,name,enabled,created_at")
    .single();
  const row = unwrapQuery(data, error, IntegrationsError, { internalMsg: "Failed to update integration" });
  return rowToSummary(row as PMIntegrationRow);
}

export async function deletePMIntegration(integrationId: string, tenantId: string) {
  await getPMIntegrationForTenant(integrationId, tenantId);
  const { error } = await supabaseAdmin.from("pm_integrations").delete().eq("id", integrationId);
  throwOnError(error, IntegrationsError, { internalMsg: "Failed to delete integration" });
}
