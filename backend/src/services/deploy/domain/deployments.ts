import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapQuery, unwrapList, assertOwnership, normalizePagination, paginatedQuery } from "../../../shared/supabase/query.js";
import type { DeploymentRow, DeploymentStatus, ServiceEntry } from "../types.js";
import { rowToDeployment } from "./mappers.js";
import { DeployError, getProviderForTenant } from "./providers.js";
import { createDeploymentRecord } from "./processor.js";
import { enqueueDeployment } from "./worker.js";
import { logger } from "../../../shared/logger.js";
import { nowIso } from "../../../shared/utils/time.js";

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
  const { limit, offset } = normalizePagination(filters ?? {});

  let query = supabaseAdmin
    .from("deployments")
    .select("*", { count: "exact" })
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters?.providerId) query = query.eq("provider_id", filters.providerId);
  if (filters?.projectId) query = query.eq("project_id", filters.projectId);

  const result = await paginatedQuery(query, { limit, offset }, DeployError, {
    internalMsg: "Failed to list deployments",
    map: rowToDeployment,
  });

  return { deployments: result.data, total: result.total };
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

export async function updateDeploymentStatus(deploymentId: string, updates: { status?: DeploymentStatus; logs?: string; appUrl?: string }) {
  const payload: Partial<DeploymentRow> = { updated_at: nowIso() };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.logs !== undefined) payload.logs = updates.logs;
  if (updates.appUrl !== undefined) payload.app_url = updates.appUrl;
  const { error } = await supabaseAdmin.from("deployments").update(payload).eq("id", deploymentId);
  throwOnError(error, DeployError, { internalMsg: "Failed to update deployment" });
}

// ─── Pipeline Domain Functions ─────────────────────────────────────

/**
 * Get the current status of a deployment (used for idempotency guards).
 */
export async function getDeploymentCurrentStatus(deploymentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("deployments")
    .select("status")
    .eq("id", deploymentId)
    .maybeSingle();
  return data?.status ?? null;
}

/**
 * Append a line to the deployment logs column.
 * Uses a Postgres RPC for atomic concatenation — avoids the read-modify-write
 * race condition that loses log lines under concurrent appends.
 *
 * This function is intentionally non-throwing. Logging is best-effort —
 * if Supabase is unreachable (DNS failure, network issues), the log line
 * is lost but the pipeline continues. Without this resilience, a transient
 * Supabase outage crashes the deploy worker via unhandled promise rejection
 * in the streaming command output handler.
 */
export async function appendDeploymentLog(deploymentId: string, line: string): Promise<void> {
  const sanitized = line.replace(/\0/g, "");
  try {
    const { error } = await supabaseAdmin.rpc("append_deployment_log", {
      p_deployment_id: deploymentId,
      p_line: sanitized,
    });
    if (error) {
      logger.warn({ err: error, deploymentId }, "[deploy] Failed to append log line (non-fatal)");
    }
  } catch (err) {
    logger.warn({ err, deploymentId }, "[deploy] Failed to append log line (non-fatal)");
  }
}

/**
 * Update deployment status and optional extra fields (app_url, infra, etc.).
 * Used by the pipeline to transition between building → deploying → success/failed.
 */
export async function setDeploymentStatus(deploymentId: string, status: DeploymentStatus, extra?: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from("deployments")
    .update({ status, updated_at: nowIso(), ...extra })
    .eq("id", deploymentId);
  throwOnError(error, DeployError, { internalMsg: "Failed to update deployment status" });
}

/**
 * Update specific fields on a deployment record (commit_hash, docker_image, etc.).
 */
export async function patchDeployment(deploymentId: string, fields: Partial<DeploymentRow>): Promise<void> {
  const { error } = await supabaseAdmin.from("deployments").update(fields).eq("id", deploymentId);
  throwOnError(error, DeployError, { internalMsg: "Failed to update deployment" });
}

/**
 * Find a cached Docker image from a previous deployment of the same commit.
 * Returns the docker_image string if found, null otherwise.
 */
export async function findCachedImage(
  repo: string,
  branch: string,
  commitHash: string,
  excludeDeploymentId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("docker_image")
    .eq("repo", repo)
    .eq("branch", branch)
    .eq("commit_hash", commitHash)
    .neq("docker_image", "")
    .neq("id", excludeDeploymentId)
    .not("status", "in", '("destroyed","failed")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Non-fatal — cache miss just means the pipeline rebuilds the image
    logger.warn({ err: error, repo, branch, commitHash }, "Failed to query cached image");
    return null;
  }
  return data?.docker_image ?? null;
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
  /** Request ID for end-to-end log correlation. */
  correlationId?: string;
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
    correlationId,
  } = params;

  // Validate provider ownership
  const full = await getProviderForTenant(providerId, tenantId);
  const providerRow = { provider: full.provider, region: full.region ?? null };

  // Create the DB record
  const payload = await createDeploymentRecord(
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
      correlationId,
    });
  }

  return rowToDeployment(payload);
}

// ─── Cancel Deployment ─────────────────────────────────────────────

/** Statuses that can be cancelled. */
const CANCELLABLE_STATUSES = ["pending", "building", "deploying"];

/**
 * Cancel a stuck or in-progress deployment.
 *
 * Sets status to "cancelled" and appends a log line indicating
 * user-initiated cancellation. Only deployments in pending/building/deploying
 * status can be cancelled.
 */
export async function cancelDeployment(deploymentId: string, tenantId: string) {
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

  if (!CANCELLABLE_STATUSES.includes(deployment.status)) {
    throw new DeployError(
      `Cannot cancel deployment in status: ${deployment.status}`,
      "precondition_failed",
    );
  }

  // Use optimistic locking: only cancel if status is still cancellable.
  // This prevents overwriting a concurrent transition (e.g., building → success).
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("deployments")
    .update({
      status: "cancelled",
      updated_at: nowIso(),
    })
    .eq("id", deploymentId)
    .in("status", CANCELLABLE_STATUSES)
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw new DeployError("Failed to cancel deployment", "internal", updateError);
  }

  if (!updated) {
    // Race lost — status changed between the read and the update.
    // Re-fetch current state and return it so the client sees the real status.
    const { data: current } = await supabaseAdmin
      .from("deployments")
      .select("*")
      .eq("id", deploymentId)
      .single();
    if (current) return rowToDeployment(current);
    throw new DeployError("Deployment status changed before cancel could be applied", "precondition_failed");
  }

  // Append cancel log atomically via RPC (avoids read-modify-write race)
  await appendDeploymentLog(deploymentId, `[${nowIso()}] ⛔ Deployment cancelled by user`);

  return rowToDeployment(updated);
}
