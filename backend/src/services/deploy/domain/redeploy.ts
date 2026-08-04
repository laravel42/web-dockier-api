/**
 * Redeploy & Rollback
 *
 * - redeployLatest: Creates a new deployment using the same config as an
 *   existing one but pulls the latest code from the branch (no commit pin).
 *
 * - rollbackToDeployment: Creates a new deployment that re-deploys the exact
 *   commit from a past successful deployment. Pins the commit SHA so the
 *   pipeline builds that specific version.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { unwrapQuery, assertOwnership } from "../../../shared/supabase/query.js";
import { DeployError } from "./providers.js";
import { createAndEnqueueDeployment } from "./deployments.js";
import { rowToDeployment } from "./mappers.js";

/**
 * Re-deploy: same provider/strategy/repo/branch, but pulls latest code.
 *
 * Use case: "I pushed a hotfix, deploy again" or "transient failure, retry."
 */
export async function redeployLatest(deploymentId: string, tenantId: string, correlationId?: string) {
  const source = await getSourceDeployment(deploymentId, tenantId);

  return await createAndEnqueueDeployment({
    tenantId,
    providerId: source.provider_id,
    gitConnectionId: source.git_connection_id ?? "",
    projectId: source.project_id || undefined,
    repo: source.repo,
    branch: source.branch,
    deployStrategy: source.deploy_strategy || "managed",
    correlationId: correlationId ? `redeploy:${correlationId}` : undefined,
  });
}

/**
 * Rollback: re-deploy a specific commit from a past deployment.
 *
 * The pipeline will check out the pinned commit SHA instead of HEAD.
 * Use case: "push-to-deploy shipped a broken commit, go back to what worked."
 */
export async function rollbackToDeployment(deploymentId: string, tenantId: string, correlationId?: string) {
  const source = await getSourceDeployment(deploymentId, tenantId);

  if (!source.commit_hash) {
    throw new DeployError(
      "Cannot rollback — this deployment has no recorded commit hash. Only deployments that completed successfully can be rolled back to.",
      "precondition_failed",
    );
  }

  // Create a new deployment that pins to the specific commit
  // The pipeline will use this commit instead of HEAD
  const deployment = await createAndEnqueueDeployment({
    tenantId,
    providerId: source.provider_id,
    gitConnectionId: source.git_connection_id ?? "",
    projectId: source.project_id || undefined,
    repo: source.repo,
    branch: source.branch,
    deployStrategy: source.deploy_strategy || "managed",
    correlationId: correlationId ? `rollback:${source.commit_hash}:${correlationId}` : `rollback:${source.commit_hash}`,
  });

  // Store the pinned commit on the new deployment so the pipeline knows
  // to check out this specific SHA rather than HEAD.
  await supabaseAdmin
    .from("deployments")
    .update({ commit_hash: source.commit_hash })
    .eq("id", deployment.id);

  return { ...deployment, commitHash: source.commit_hash };
}

// ─── Internal ──────────────────────────────────────────────────────

async function getSourceDeployment(deploymentId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("*")
    .eq("id", deploymentId)
    .single();

  const deployment = unwrapQuery(data, error, DeployError, {
    notFoundMsg: "Source deployment not found",
    internalMsg: "Failed to fetch deployment for redeploy",
  });

  assertOwnership(deployment, tenantId, DeployError, "Not your deployment");

  if (deployment.status === "destroyed") {
    throw new DeployError(
      "Cannot redeploy a destroyed deployment — its infrastructure has been torn down.",
      "precondition_failed",
    );
  }

  return deployment;
}
