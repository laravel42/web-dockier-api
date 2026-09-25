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
import {
  appendLog,
  updateStatus,
  emitDeploySuccessNotification,
  emitDeployFailureNotification,
} from "../pipeline/helpers.js";
import { markProjectInfraLive } from "../lifecycle/project-teardown.js";
import { clearRepoFaviconFromAnalysisCache } from "../../../git-integration/domain/cache.js";
import { logger } from "../../../../shared/logger.js";
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
import { resolveRuntimeStartCommand } from "./stages/resolve-runtime.js";
import { stageDeployWithRetry } from "./stages/trigger-deploy.js";
import { stageVerifyDeploy } from "./stages/verify-deploy.js";
import { createAdvisoryCollector, renderAdvisories } from "./advisories.js";
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
  // Collects the automatic adjustments the pipeline makes on the user's behalf
  // (missing start script, injected PORT/HOST, ...) so a successful deploy can
  // still report what needs attention in the repository.
  const advisories = createAdvisoryCollector();

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

    // Resolve a server start command for apps whose repo has no `start` script
    // (e.g. SSR Astro via @astrojs/node). Prefer one already on the event;
    // otherwise re-derive it from the repo's config files (no clone). Non-fatal
    // — undefined just lets Railpack infer as before.
    const resolvedRuntime = await resolveRuntimeStartCommand({
      gitConnectionId,
      repo,
      branch,
      explicit: event.startCommand,
      log,
    });
    const { startCommand } = resolvedRuntime;

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
        framework: resolvedRuntime.framework,
        runtime: resolvedRuntime.runtime,
        // PHP version drives builder selection: Railpack needs 8.2+, so an older
        // app falls back to Nixpacks instead of failing at plan time.
        phpVersion: resolvedRuntime.phpVersion,
        // Explicit start command (SSR Astro via @astrojs/node →
        // "node ./dist/server/entry.mjs"). configure-app hands it to Railpack so
        // the server actually launches.
        startCommand,
      },
      services: event.services,
      provisionedDatabases: dbResult.databases,
      envVars,
      client,
      log,
      advise: advisories.add,
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
      // Framework-aware context so a build failure can surface actionable
      // guidance (e.g. "add a start script") instead of the generic message.
      runtimeHint: {
        buildType,
        framework: resolvedRuntime.framework,
        kind: resolvedRuntime.kind,
        startCommandApplied: Boolean(startCommand),
        repoHasStartScript: resolvedRuntime.hasStartScript,
        platformAdapter: resolvedRuntime.platformAdapter,
      },
      advise: advisories.add,
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
        advise: advisories.add,
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

    // ─── Stage 9: Verify the app actually serves traffic ─────────
    // Dokploy reporting "done" only means the build succeeded — it says nothing
    // about whether the container serves requests. Probe the URL so a Bad
    // Gateway is visible (and diagnosed) here instead of being discovered by the
    // user. Strictly diagnostic: never fails the deploy.
    if (deployResult.appUrl) {
      try {
        await stageVerifyDeploy({
          appUrl: deployResult.appUrl,
          containerPort,
          log,
          runtimeHint: {
            buildType,
            framework: resolvedRuntime.framework,
            kind: resolvedRuntime.kind,
            startCommandApplied: Boolean(startCommand),
            repoHasStartScript: resolvedRuntime.hasStartScript,
            platformAdapter: resolvedRuntime.platformAdapter,
          },
        });
      } catch (verifyErr) {
        await log(`[stage:verify] Skipped verification: ${getErrDetail(verifyErr)}`);
      }
    }

    // ─── Success ─────────────────────────────────────────────────
    // Write the app URL ATOMICALLY with the success status. Writing it after
    // flipping to "success" is a race: clients that poll for a terminal status
    // (the deploy wizard) stop and render as soon as they see "success", so they
    // captured an empty app_url and showed no URL at all.
    await updateStatus(deploymentId, "success", deployResult.appUrl ? { app_url: deployResult.appUrl } : undefined);
    await log(`✓ Deployment complete! App URL: ${deployResult.appUrl || "(pending)"}`);

    // Report what Dockier adjusted on the user's behalf. The deploy succeeded —
    // these are advisories so the gaps get fixed in the repo rather than relying
    // on the platform to paper over them forever.
    for (const line of renderAdvisories(advisories.list())) {
      await log(line);
    }
    // (app_url is persisted with the success status above, not separately.)

    // ─── Post-success bookkeeping ────────────────────────────────
    // Parity with the native pipeline's finalize step. Without these the
    // deployment looks fine but the PROJECT does not: infra_state stays "none",
    // so the UI reports "No infrastructure" and the Tear Down button is
    // disabled (it requires "live") — leaving users unable to destroy resources
    // they just created. Notifications and the favicon cache were missing too.
    await markProjectInfraLive(projectId);
    await clearRepoFaviconFromAnalysisCache(repo, branch, logger);
    emitDeploySuccessNotification({
      tenantId,
      deploymentId,
      repo,
      branch,
      appUrl: deployResult.appUrl || undefined,
    });
  } catch (err) {
    const message = getErrDetail(err);
    await log(`✗ Pipeline failed: ${message}`);
    try {
      await updateStatus(deploymentId, "failed");
    } catch {
      // Best-effort status update
    }
    // Surface the failure through the user's notification channels, as the
    // native pipeline does — otherwise a failed Dokploy deploy is silent.
    emitDeployFailureNotification({
      tenantId,
      deploymentId,
      repo,
      branch,
      reason: message,
      category: "build",
    });
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
