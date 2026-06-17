import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type { DeploymentRow } from "../types.js";
import { rowToDeployment } from "./mappers.js";
import { DeployError } from "./providers.js";

export interface ListDeploymentsFilters {
  providerId?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
}

export interface ListDeploymentsResult {
  deployments: ReturnType<typeof rowToDeployment>[];
  total: number;
}

export async function listDeployments(
  tenantId: string,
  filters?: ListDeploymentsFilters,
): Promise<ListDeploymentsResult> {
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 100);
  const offset = Math.max(filters?.offset ?? 0, 0);
  const paginated = filters?.projectId != null || filters?.limit != null || filters?.offset != null;

  let query = supabaseAdmin
    .from("deployments")
    .select("*", paginated ? { count: "exact" } : undefined)
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters?.providerId) query = query.eq("provider_id", filters.providerId);
  if (filters?.projectId) query = query.eq("project_id", filters.projectId);

  if (paginated) {
    query = query.range(offset, offset + limit - 1);
  } else {
    query = query.limit(50);
  }

  const { data, error, count } = await query;
  const rows = unwrapList(data, error, DeployError, { internalMsg: "Failed to list deployments" });
  return {
    deployments: rows.map(rowToDeployment),
    total: count ?? rows.length,
  };
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
