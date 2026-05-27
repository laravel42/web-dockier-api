import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { DeploymentRow } from "../types.js";
import { rowToDeployment } from "./mappers.js";
import { DeployError } from "./providers.js";

export async function listDeployments(tenantId: string, providerId?: string) {
  if (!tenantId) throw new DeployError("Tenant ID is required", "bad_request");
  let query = supabaseAdmin
    .from("deployments")
    .select("*")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (providerId) query = query.eq("provider_id", providerId);
  const { data, error } = await query;
  if (error) throw new DeployError("Failed to list deployments", "internal");
  return (data ?? []).map(rowToDeployment);
}

export async function getDeployment(deploymentId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("*")
    .eq("id", deploymentId)
    .single();
  if (error) {
    if (error.code === "PGRST116") throw new DeployError("Deployment not found", "not_found");
    throw new DeployError("Failed to fetch deployment", "internal");
  }
  if (!data) throw new DeployError("Deployment not found", "not_found");
  if (data.organization_id !== tenantId) throw new DeployError("Not your deployment", "forbidden");
  return rowToDeployment(data);
}

export async function getDeploymentForDestroy(deploymentId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("id,organization_id")
    .eq("id", deploymentId)
    .single();
  if (error) {
    if (error.code === "PGRST116") throw new DeployError("Deployment not found", "not_found");
    throw new DeployError("Failed to fetch deployment", "internal");
  }
  if (!data) throw new DeployError("Deployment not found", "not_found");
  if (data.organization_id !== tenantId) throw new DeployError("Not your deployment", "forbidden");
  return data;
}

export async function updateDeploymentStatus(deploymentId: string, updates: { status?: string; logs?: string; appUrl?: string }) {
  const payload: Partial<DeploymentRow> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.logs !== undefined) payload.logs = updates.logs;
  if (updates.appUrl !== undefined) payload.app_url = updates.appUrl;
  const { error } = await supabaseAdmin.from("deployments").update(payload).eq("id", deploymentId);
  if (error) throw new DeployError("Failed to update deployment", "internal");
}
