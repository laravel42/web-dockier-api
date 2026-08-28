/**
 * Dokploy Pipeline Orchestrator
 *
 * Coordinates all stages of the Dokploy deployment flow:
 *   1. Ensure Project (tenant → Dokploy project)
 *   2. Sync Git + Provision Server (parallel)
 *   3. Configure Application (depends on 1, 2)
 *   4. Deploy with retry (up to 3 attempts, Dokploy AI recovery)
 *
 * Called by the deploy worker when DEPLOY_PROVIDER=dokploy.
 * Idempotent — safe to re-run from any point.
 */

import type { PipelineInput } from "../pipeline/shared.js";
import { createDokployClient } from "./client.js";
import { appendLog, updateStatus } from "../pipeline/helpers.js";
import { getDeploymentCurrentStatus } from "../deployments.js";
import { supabaseAdmin } from "../../../../shared/supabase/client.js";
import { logTimestamp as ts } from "../../../../shared/utils/time.js";

import { stageEnsureProject } from "./stages/ensure-project.js";
import { stageSyncGit } from "./stages/sync-git.js";
import { stageProvisionServer } from "./stages/provision-server.js";
import { stageConfigureApp } from "./stages/configure-app.js";
import { stageDeployWithRetry } from "./stages/trigger-deploy.js";
import { revealEnv } from "../../../projects/domain/env.js";

const PIPELINE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Execute the full Dokploy deployment pipeline.
 * This runs asynchronously via the pg-boss job queue.
 */
export async function executeDokployPipeline(event: PipelineInput): Promise<void> {
  const { deploymentId, tenantId, projectId, gitConnectionId, repo, branch } = event;

  // Idempotency guard
  const currentStatus = await getDeploymentCurrentStatus(deploymentId);
  if (currentStatus === "building" || currentStatus === "deploying" || currentStatus === "cancelled") return;

  const client = createDokployClient();
  const log = async (line: string) => appendLog(deploymentId, `[${ts()}] ${line}`);
  const startTime = Date.now();

  const checkTimeout = () => {
    if (Date.now() - startTime > PIPELINE_TIMEOUT_MS) {
      throw new Error(`Pipeline timed out after ${Math.round(PIPELINE_TIMEOUT_MS / 60_000)} minutes`);
    }
  };

  try {
    await updateStatus(deploymentId, "building");
    await log("▶ Starting Dokploy deployment pipeline...");

    // ─── Stage 1: Ensure Dokploy Project ─────────────────────────
    const orgName = await getOrganizationName(tenantId);
    const { dokployEnvironmentId } = await stageEnsureProject({
      organizationId: tenantId,
      organizationName: orgName,
      client,
      log,
    });
    checkTimeout();

    // ─── Stage 2 & 3: Parallel — Sync Git + Provision Server ─────
    const [gitResult, serverResult] = await Promise.all([
      stageSyncGit({ gitConnectionId, repo, branch, log }),
      stageProvisionServer({ projectId: projectId || deploymentId, providerId: event.providerId, instanceType: event.instanceType, client, log }),
    ]);
    checkTimeout();

    // ─── Stage 4: Configure Application ──────────────────────────
    await updateStatus(deploymentId, "deploying");

    const envVars = projectId ? await loadProjectEnvVars(tenantId, projectId) : [];

    const { dokployApplicationId } = await stageConfigureApp({
      projectId: projectId || deploymentId,
      projectName: repoToAppName(repo),
      environmentId: dokployEnvironmentId,
      serverId: serverResult.dokployServerId,
      gitConfig: gitResult.gitConfig,
      repoAnalysis: {
        hasDockerfile: event.hasDocker ?? false,
        isStaticSite: false,
        primaryLanguage: event.primaryLanguage,
        techStack: event.techStack,
      },
      envVars,
      client,
      log,
    });
    checkTimeout();

    // ─── Stage 5: Deploy with Retry ──────────────────────────────
    const deployResult = await stageDeployWithRetry({
      applicationId: dokployApplicationId,
      client,
      log,
      maxAttempts: 3,
    });

    // ─── Success ─────────────────────────────────────────────────
    await updateStatus(deploymentId, "success");
    await log(`✓ Deployment complete! App URL: ${deployResult.appUrl || "(pending)"}`);

    // Store app URL in deployment record
    if (deployResult.appUrl) {
      await supabaseAdmin
        .from("deployments")
        .update({ app_url: deployResult.appUrl })
        .eq("id", deploymentId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log(`✗ Pipeline failed: ${message}`);
    try {
      await updateStatus(deploymentId, "failed");
    } catch {
      // Best-effort status update
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

async function getOrganizationName(tenantId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  return data?.name || `org-${tenantId.slice(0, 8)}`;
}

async function loadProjectEnvVars(tenantId: string, projectId: string): Promise<Array<{ name: string; value: string }>> {
  try {
    const result = await revealEnv({ tenantId, projectId });
    if (!result.exists || !result.content) return [];

    return result.content
      .split("\n")
      .filter((line: string) => line.includes("=") && !line.startsWith("#"))
      .map((line: string) => {
        const eqIdx = line.indexOf("=");
        return { name: line.slice(0, eqIdx), value: line.slice(eqIdx + 1) };
      });
  } catch {
    return [];
  }
}

function repoToAppName(repo: string): string {
  // "owner/my-repo" → "my-repo"
  const parts = repo.split("/");
  return parts[parts.length - 1].replace(/\.git$/, "");
}
