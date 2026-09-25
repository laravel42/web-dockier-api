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
import { getErrDetail } from "../../../../shared/utils/error-message.js";

import { deleteDatabaseMappings } from "./mappings.js";
import { stageEnsureProject } from "./stages/ensure-project.js";
import { stageSyncGit } from "./stages/sync-git.js";
import { stageProvisionServer } from "./stages/provision-server.js";
import { stageProvisionDatabases } from "./stages/provision-databases.js";
import { stageConfigureApp } from "./stages/configure-app.js";
import { stageDeployWithRetry } from "./stages/trigger-deploy.js";
import { stageRunPostDeploy } from "./stages/run-post-deploy.js";
import { revealEnv } from "../../../projects/domain/env.js";

// Real builds (dependency install + framework build + image build) commonly
// run 8-12 minutes, on top of first-time server provisioning (~3-5 min). Keep
// a generous ceiling so a legitimately slow build isn't cut off; the deploy
// stage has its own per-attempt timeout for the build itself.
const PIPELINE_TIMEOUT_MS = 40 * 60 * 1000; // 40 minutes

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
    await log("▶ Starting deployment pipeline...");

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
      stageProvisionServer({ projectId: projectId || deploymentId, providerId: event.providerId, tenantId, instanceType: event.instanceType, client, log }),
    ]);
    checkTimeout();

    await updateStatus(deploymentId, "deploying");

    const envVars = projectId ? await loadProjectEnvVars(tenantId, projectId) : [];

    // A freshly provisioned server has NONE of the previously created database
    // services (they lived on the old, now-deleted box). Their mappings are
    // stale — reusing them makes the app connect to a hostname that no longer
    // resolves ("getaddrinfo ... failed"), which crashes Laravel at startup and
    // yields Bad Gateway. Clear them so the DB stage recreates fresh services
    // on the new server.
    if (!serverResult.reused) {
      await deleteDatabaseMappings(projectId || deploymentId);
      await log("[stage:provision-databases] New server provisioned — recreating self-hosted services on it.");
    }

    // ─── Stage 4: Provision self-hosted databases (vps services) ─
    // Runs before configure-app so the app's env can be wired to the DBs.
    const dbResult = await stageProvisionDatabases({
      projectId: projectId || deploymentId,
      projectName: repoToAppName(repo),
      environmentId: dokployEnvironmentId,
      serverId: serverResult.dokployServerId,
      services: event.services ?? [],
      envVars,
      client,
      log,
    });
    checkTimeout();

    // ─── Stage 5: Configure Application ──────────────────────────
    const { dokployApplicationId, buildType, containerPort } = await stageConfigureApp({
      projectId: projectId || deploymentId,
      projectName: repoToAppName(repo),
      environmentId: dokployEnvironmentId,
      serverId: serverResult.dokployServerId,
      gitConfig: gitResult.gitConfig,
      repoAnalysis: {
        hasDockerfile: event.hasDocker ?? false,
        // "static" here means a repo that ships its ALREADY-BUILT output (so
        // Dokploy's nginx "static" build type can just COPY it). Source-only
        // static generators like Astro/Vite must build with Railpack instead,
        // which runs the build and serves the result. No signal for committed
        // build output flows through the deploy event, so this is false: Astro
        // et al. correctly fall through to Railpack in determineBuildType().
        isStaticSite: false,
        primaryLanguage: event.primaryLanguage,
        techStack: event.techStack,
      },
      services: event.services,
      provisionedDatabases: dbResult.databases,
      envVars,
      client,
      log,
    });
    checkTimeout();

    // ─── Stage 5: Deploy with Retry ──────────────────────────────
    // A full build takes many minutes, so cap retries at 2: one retry covers a
    // transient failure (e.g. a flaky dependency download), while avoiding
    // burning 30+ minutes re-running a deterministic build failure three times.
    const deployResult = await stageDeployWithRetry({
      applicationId: dokployApplicationId,
      client,
      log,
      containerPort,
      maxAttempts: 2,
      pollIntervalMs: event.deployPollIntervalMs,
    });

    // ─── Stage 6: Post-deploy commands ───────────────────────────
    // Run the project's user-defined post-deploy commands inside the running
    // container. Best-effort + non-fatal — a failure here never fails the
    // deploy (see stageRunPostDeploy).
    //
    // buildType + language are passed so the stage can skip commands that the
    // container's own startup already runs (Railpack PHP runs migrate +
    // optimize at boot). Re-running those here via `docker exec` is redundant
    // and can bake a broken config, causing Bad Gateway — so we don't.
    if (projectId) {
      await stageRunPostDeploy({
        projectId,
        buildType,
        primaryLanguage: event.primaryLanguage,
        techStack: event.techStack,
        log,
      });
      checkTimeout();
    }

    // ─── Stage 7: Network rules (security + redirects) ───────────
    // Reconcile the project's Basic Auth + redirect rules onto the Dokploy
    // app's Traefik middlewares. Best-effort + non-fatal — a failure here
    // never fails the deploy.
    if (projectId) {
      try {
        const { applyNetworkRulesDokploy } = await import("../../../network/domain/dokploy-applier.js");
        const netResult = await applyNetworkRulesDokploy({ tenantId, projectId });
        await log(`[stage:network] ${netResult.message}`);
      } catch (netErr) {
        await log(`[stage:network] Skipped applying network rules: ${getErrDetail(netErr)}`);
      }
      checkTimeout();
    }

    // ─── Stage 8: Custom domains + SSL ───────────────────────────
    // Register the project's user custom domains on the Dokploy app and
    // request Let's Encrypt via Traefik. Best-effort + non-fatal — a failure
    // here never fails the deploy. (The auto sslip.io domain is set during the
    // deploy stage and preserved here.)
    if (projectId) {
      try {
        const { applyDomainConfigDokploy } = await import("../../../domains/domain/dokploy-applier.js");
        const domResult = await applyDomainConfigDokploy({ tenantId, projectId });
        await log(`[stage:domains] ${domResult.message}`);
      } catch (domErr) {
        await log(`[stage:domains] Skipped applying domains: ${getErrDetail(domErr)}`);
      }
      checkTimeout();
    }

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
    const message = getErrDetail(err);
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
