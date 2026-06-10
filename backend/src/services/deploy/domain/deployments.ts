import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type { DeploymentRow } from "../types.js";
import { rowToDeployment } from "./mappers.js";
import { DeployError } from "./providers.js";

export async function listDeployments(tenantId: string, providerId?: string) {
  let query = supabaseAdmin
    .from("deployments")
    .select("*")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (providerId) query = query.eq("provider_id", providerId);
  const { data, error } = await query;
  const rows = unwrapList(data, error, DeployError, { internalMsg: "Failed to list deployments" });
  return rows.map(rowToDeployment);
}

export async function getDeployment(deploymentId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("*")
    .eq("id", deploymentId)
    .single();
  const deployment = unwrapQuery(data, error, DeployError, {
    notFoundMsg: "Deployment not found",
    internalMsg: "Failed to fetch deployment",
  });
  if (deployment.organization_id !== tenantId) throw new DeployError("Not your deployment", "forbidden");
  return rowToDeployment(deployment);
}

export async function getDeploymentForDestroy(deploymentId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("id,organization_id")
    .eq("id", deploymentId)
    .single();
  const deployment = unwrapQuery(data, error, DeployError, {
    notFoundMsg: "Deployment not found",
    internalMsg: "Failed to fetch deployment",
  });
  if (deployment.organization_id !== tenantId) throw new DeployError("Not your deployment", "forbidden");
  return deployment;
}

export async function updateDeploymentStatus(deploymentId: string, updates: { status?: string; logs?: string; appUrl?: string }) {
  const payload: Partial<DeploymentRow> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.logs !== undefined) payload.logs = updates.logs;
  if (updates.appUrl !== undefined) payload.app_url = updates.appUrl;
  const { error } = await supabaseAdmin.from("deployments").update(payload).eq("id", deploymentId);
  throwOnError(error, DeployError, { internalMsg: "Failed to update deployment" });
}
