import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapQuery, unwrapList, assertOwnership } from "../../../shared/supabase/query.js";
import type { DeploymentRow, ServiceEntry } from "../types.js";
import { rowToDeployment } from "./mappers.js";
import { DeployError, getProviderForTenant } from "./providers.js";
import { createDeploymentRecord } from "./processor.js";
import { enqueueDeployment } from "./worker.js";

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
  assertOwnership(deployment, tenantId, DeployError, "Not your deployment");
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
  assertOwnership(deployment, tenantId, DeployError, "Not your deployment");
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


/**
 * Look up a deployment by ID for webhook processing.
 *
 * Returns the deployment ID if found, or null if it doesn't exist.
 * Unlike other getters, a missing deployment is not an error here —
 * webhooks may arrive for already-deleted resources.
 */
export async function getDeploymentForWebhook(deploymentId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("id")
    .eq("id", deploymentId)
    .single();

  if (error) {
    // PGRST116 = row not found — normal for webhooks referencing deleted deployments
    if (error.code === "PGRST116") return null;
    throw new DeployError("Database error fetching deployment for webhook", "internal", error);
  }

  return data;
}

// ─── Create & Enqueue ──────────────────────────────────────────────

export interface CreateDeploymentParams {
  tenantId: string;
  providerId: string;
  gitConnectionId: string;
  projectId?: string;
  repo: string;
  branch: string;
  tofuScript?: string;
  techStack?: string[];
  primaryLanguage?: string;
  registryUrl?: string;
  deployStrategy?: string;
  buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
  useRepoDockerfile?: boolean;
  skipPipeline?: boolean;
  templateId?: string;
  services?: ServiceEntry[];
}

/**
 * Orchestrates the full deployment creation flow:
 * 1. Validates provider belongs to tenant
 * 2. Creates the deployment record
 * 3. Enqueues the deploy pipeline (unless skipPipeline is set)
 *
 * Returns the mapped deployment response object.
 */
export async function createAndEnqueueDeployment(params: CreateDeploymentParams) {
  const {
    tenantId,
    providerId,
    gitConnectionId,
    projectId,
    repo,
    branch,
    tofuScript,
    techStack,
    primaryLanguage,
    registryUrl,
    deployStrategy,
    buildMethod,
    useRepoDockerfile,
    skipPipeline,
    templateId,
    services,
  } = params;

  // Validate provider ownership
  const full = await getProviderForTenant(providerId, tenantId);
  const providerRow = { provider: full.provider, region: full.region ?? null };

  // Create the DB record
  const payload = await createDeploymentRecord(
    supabaseAdmin,
    {
      tenantId,
      providerId,
      gitConnectionId,
      projectId,
      repo,
      branch,
      tofuScript,
      techStack,
      primaryLanguage,
      hasDocker: buildMethod === "dockerfile",
      deployStrategy: (deployStrategy as "vps" | "managed" | "static" | undefined) ?? "managed",
      templateId,
      buildMethod,
      registryUrl,
      skipPipeline,
      useRepoDockerfile,
      services,
    },
    providerRow,
  );

  // Enqueue background pipeline
  if (!skipPipeline) {
    await enqueueDeployment({
      deploymentId: payload.id,
      tenantId,
      providerId,
      gitConnectionId,
      projectId,
      repo,
      branch,
      tofuScript: payload.tofu_script || "",
      techStack,
      primaryLanguage,
      hasDocker: buildMethod === "dockerfile",
      deployStrategy: payload.deploy_strategy || "managed",
      templateId,
      buildMethod,
      registryUrl,
      services: services as Array<{ type: string; name: string; mode: string }> | undefined,
      useRepoDockerfile,
    });
  }

  return rowToDeployment(payload);
}
