import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapQuery, assertOwnership, normalizePagination, paginatedQuery } from "../../../shared/supabase/query.js";
import type { DeployStrategy, DeploymentRow, DeploymentStatus, ServiceEntry } from "../types.js";
import { rowToDeployment } from "./mappers.js";
import { DeployError, getProviderForTenant } from "./providers.js";
import { createDeploymentRecord } from "./processor.js";
import { enqueueDeployment } from "./worker.js";
import { logger } from "../../../shared/logger.js";
import { nowIso } from "../../../shared/utils/time.js";
import { env } from "../../../shared/config.js";
import { getProviderCredentialsSafe, hasUsableCredential } from "../../../lib/provider-credentials.js";

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

  // Batch-fetch project names for all deployments in a single query
  const projectIds = [...new Set(result.data.map((d) => d.projectId).filter(Boolean))];
  const projectNameMap = await getProjectNameMap(projectIds);

  const deployments = result.data.map((d) => ({
    ...d,
    projectName: projectNameMap.get(d.projectId) ?? "",
  }));

  return { deployments, total: result.total };
}

/**
 * Batch-fetch project names by IDs.
 * Returns a Map<projectId, name> for quick lookups.
 */
async function getProjectNameMap(projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from("projects")
    .select("id, name")
    .in("id", projectIds);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id, row.name);
  }
  return map;
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
  deployStrategy?: DeployStrategy;
  buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
  useRepoDockerfile?: boolean;
  skipPipeline?: boolean;
  templateId?: string;
  services?: ServiceEntry[];
  /** Selected plan's instance size (e.g. "t3.small"). Used for VPS provisioning. */
  instanceType?: string;
  /** Target region override. Falls back to the provider's configured region. */
  region?: string;
  /**
   * Explicit server start command derived from repo analysis. Handed to
   * Railpack by the Dokploy pipeline for SSR Node apps that don't declare a
   * `start` script (otherwise the container runs nothing → Bad Gateway).
   */
  startCommand?: string;
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
    instanceType,
    region,
    startCommand,
    correlationId,
  } = params;

  // Validate provider ownership
  const full = await getProviderForTenant(providerId, tenantId);
  const providerRow = { provider: full.provider, region: full.region ?? null };

  // Fail fast on missing cloud credentials.
  //
  // The Dokploy pipeline auto-provisions a VPS on the tenant's own cloud
  // account (AWS/GCP) unless a pre-provisioned server IP is configured.
  // That path needs usable provider credentials. Without this guard the
  // deployment would be created, flip to "building", and only fail deep in
  // the provision-server stage with an opaque error — after the user has
  // already committed to the deploy. Check up front and reject with a clear,
  // actionable message instead.
  // Static deploys are exempt: they never provision a VPS. They go to object
  // storage + CDN via the native pipeline (see routePipeline), which resolves
  // credentials itself in stageProviderCredentials and fails there with a
  // specific error if they are unusable.
  const dokployAutoProvision =
    env.DEPLOY_PROVIDER === "dokploy" &&
    !env.DOKPLOY_DEFAULT_SERVER_IP &&
    deployStrategy !== "static";
  if (dokployAutoProvision && !skipPipeline) {
    const creds = await getProviderCredentialsSafe(providerId);
    if (!creds || !hasUsableCredential(creds.credential)) {
      throw new DeployError(
        "This deployment provisions a server on your cloud account, but the selected " +
        "provider has no usable credentials. Configure the provider's credentials " +
        "under Settings → Providers before deploying.",
        "precondition_failed",
      );
    }
  }

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
      deployStrategy: deployStrategy ?? "managed",
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
      instanceType,
      region: region || providerRow.region || undefined,
      startCommand,
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

  // Only after the row is actually cancelled: ask the build server to stop.
  // A lost race above returns early, so we never stop a remote build that some
  // other transition already finished.
  await requestRemoteBuildCancel(deployment.project_id || deploymentId, deploymentId);

  return rowToDeployment(updated);
}

/**
 * Ask Dokploy to stop the build this deployment started.
 *
 * Best-effort and never fatal (same convention as the AI Dockerfile review):
 * the deployment is already cancelled in Dockier, so a failure here must not
 * turn a successful cancel into an error — it only means the remote build may
 * keep running, which we tell the user in the deploy log.
 *
 * `mappingKey` is the project id, falling back to the deployment id: the
 * Dokploy pipeline creates every mapping with `projectId || deploymentId`, so
 * a projectless deployment's mapping is keyed by its own id.
 */
const REMOTE_CANCEL_TIMEOUT_MS = 5_000;

async function requestRemoteBuildCancel(mappingKey: string, deploymentId: string): Promise<void> {
  // The native/static pipeline has no Dokploy build to stop.
  //
  // Not gated on the deployment's own strategy: a compose deploy always routes
  // to Dokploy regardless of DEPLOY_PROVIDER (see routePipeline), but
  // DEPLOY_PROVIDER=dokploy is the only configuration in which any Dokploy
  // resource exists at all, so this guard still holds for both kinds.
  if (env.DEPLOY_PROVIDER !== "dokploy") return;

  try {
    // Dynamic import keeps the Dokploy modules out of this file's (widely
    // imported) static module graph, matching dokploy/pipeline.ts.
    const { getProjectResource } = await import("./dokploy/mappings.js");
    const resource = await getProjectResource(mappingKey);
    // Nothing was configured on Dokploy yet (e.g. cancel during provisioning).
    if (resource.kind === "none") return;

    const { createDokployClient } = await import("./dokploy/client.js");
    // Bounded on purpose: this runs inside the user's Cancel request. The
    // default client retries 3× with a 30s per-attempt timeout (~127s), which
    // would hang the Cancel button — and the wizard's spinner — while Dokploy
    // is unreachable, which is exactly when a user cancels. One short attempt
    // is enough: failing only means the remote build may keep running, and we
    // say so in the log below.
    const client = createDokployClient({
      timeout: REMOTE_CANCEL_TIMEOUT_MS,
      maxRetries: 0,
    });
    // Each resource kind has its own cancel procedure; calling
    // `application.cancelDeployment` with a composeId is a 404 that this
    // function's catch would swallow, leaving the stack building.
    if (resource.kind === "compose") {
      await client.cancelComposeDeployment(resource.compose.dokployComposeId);
    } else {
      await client.cancelDeployment(resource.application.dokployApplicationId);
    }
    await appendDeploymentLog(
      deploymentId,
      `[${nowIso()}] ⛔ Asked the build server to stop the running build.`,
    );
  } catch (err) {
    logger.warn({ err, deploymentId }, "[deploy] Failed to cancel the remote Dokploy build");
    await appendDeploymentLog(
      deploymentId,
      `[${nowIso()}] ⚠ Could not reach the build server to stop the build — it may still be running there. The deployment is cancelled in Dockier.`,
    );
  }
}
