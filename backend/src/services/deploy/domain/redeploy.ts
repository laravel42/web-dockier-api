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
import { getProviderCredentialsSafe } from "../../../lib/provider-credentials.js";
import { DeployError } from "./providers.js";
import { createAndEnqueueDeployment } from "./deployments.js";
import { rowToDeployment } from "./mappers.js";

type BuildMethod = "dockerfile" | "railpack" | "nixpacks" | "codebuild";

/**
 * Resolve the build method to reuse for a redeploy/rollback.
 *
 * Prefers the source deployment's persisted `build_method`. For legacy rows
 * created before that column existed it falls back to CodeBuild on AWS — the
 * Dockier server has no local Docker daemon, so a local build would fail — and
 * leaves it unset for other providers so the pipeline applies its own default.
 */
async function resolveBuildMethod(source: { build_method: string | null; provider_id: string }): Promise<BuildMethod | undefined> {
  if (source.build_method) return source.build_method as BuildMethod;
  const creds = await getProviderCredentialsSafe(source.provider_id);
  return creds?.provider === "aws" ? "codebuild" : undefined;
}

/**
 * Re-deploy: same provider/strategy/repo/branch, but pulls latest code.
 *
 * Use case: "I pushed a hotfix, deploy again" or "transient failure, retry."
 */
export async function redeployLatest(deploymentId: string, tenantId: string, correlationId?: string) {
  const source = await getSourceDeployment(deploymentId, tenantId);
  const buildMethod = await resolveBuildMethod(source);

  return await createAndEnqueueDeployment({
    tenantId,
    providerId: source.provider_id,
    gitConnectionId: source.git_connection_id ?? "",
    projectId: source.project_id || undefined,
    repo: source.repo,
    branch: source.branch,
    deployStrategy: source.deploy_strategy || "managed",
    buildMethod,
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

  const buildMethod = await resolveBuildMethod(source);

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
    buildMethod,
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

  // Redeploy/rollback are intentionally teardown-independent: a new deploy
  // recreates infrastructure when it was torn down, or updates it when live.
  // Legacy `destroyed` records still carry the provider/repo/strategy needed to
  // recreate, so they remain redeployable.

  return deployment;
}
