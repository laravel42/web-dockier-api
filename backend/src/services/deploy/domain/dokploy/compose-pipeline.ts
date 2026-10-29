/**
 * Dokploy Compose Pipeline Orchestrator
 *
 * The compose counterpart of `pipeline.ts`:
 *   1. Ensure Project   (shared, verbatim)
 *   2. Sync Git + Provision Server (shared, verbatim, in parallel)
 *   3. Configure Compose (git source, compose path, env, services)
 *   4. Deploy and poll
 *   5. Custom domains
 *
 * Deliberately NOT here, each for a reason rather than for lack of time:
 *
 *  - Database provisioning. A compose file that declares its own Postgres gets
 *    nothing provisioned, because injecting a second one and overriding
 *    DATABASE_URL points a working stack at the wrong server. A file that
 *    declares none is served by the user's own env credentials.
 *  - Network rules. Dokploy's `security` and `redirects` tables reference
 *    applications.applicationId and have no compose equivalent, so there is no
 *    API call to make on any version.
 *  - Post-deploy commands. A stack is N containers; running a command means
 *    naming a service first, which nothing in the API expresses yet.
 *  - Build type, start command, PORT/HOST injection, Railpack tuning. All
 *    application concepts. Each compose service builds from its own `build:`.
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
import { revealEnv } from "../../../projects/domain/env.js";

import { stageEnsureProject } from "./stages/ensure-project.js";
import { stageSyncGit } from "./stages/sync-git.js";
import { stageProvisionServer } from "./stages/provision-server.js";
import { stageConfigureCompose, type ComposeDeployConfig } from "./stages/configure-compose.js";
import { stageDeployCompose } from "./stages/deploy-compose.js";
import { resolveComposeFile } from "./stages/resolve-compose.js";
import { fetchBuildLogTail } from "./stages/build-log.js";

/** Same ceiling as the application pipeline — a compose stack builds N images. */
const PIPELINE_TIMEOUT_MS = 40 * 60 * 1000;

/** Control-flow sentinel for a user cancel. NOT a failure (see pipeline.ts). */
class DeployCancelledError extends Error {}

export async function executeComposePipeline(event: PipelineInput): Promise<void> {
  const { deploymentId, tenantId, projectId, gitConnectionId, repo, branch } = event;

  const currentStatus = await getDeploymentCurrentStatus(deploymentId);
  if (currentStatus === "building" || currentStatus === "deploying" || currentStatus === "cancelled") return;

  const client = createDokployClient();
  const log = async (line: string) => appendLog(deploymentId, `[${ts()}] ${line}`);
  const startTime = Date.now();

  const isCancelled = async () => (await getDeploymentCurrentStatus(deploymentId)) === "cancelled";
  const checkpoint = async () => {
    if (Date.now() - startTime > PIPELINE_TIMEOUT_MS) {
      throw new Error(`Pipeline timed out after ${Math.round(PIPELINE_TIMEOUT_MS / 60_000)} minutes`);
    }
    if (await isCancelled()) throw new DeployCancelledError();
  };

  try {
    await updateStatus(deploymentId, "building");
    await log("▶ Starting Docker Compose deployment pipeline...");

    // The compose file to deploy, and which of its services is public. Read
    // from project settings rather than the deploy event: these must survive a
    // redeploy and a rollback, and be editable without running a deploy.
    const compose = await loadComposeConfig(projectId);
    if (!compose) {
      throw new Error(
        "No Docker Compose file is configured for this project. " +
        "Pick the compose file and its public service in the project's deploy settings, then deploy again.",
      );
    }
    await log(`▶ Compose file: ${compose.path}`);

    // ─── Stage 1: Ensure Dokploy Project ─────────────────────────
    const { dokployEnvironmentId } = await stageEnsureProject({
      organizationId: tenantId,
      organizationName: await getOrganizationName(tenantId),
      client,
      log,
    });
    await checkpoint();

    // ─── Stage 2 & 3: Sync Git + Provision Server (parallel) ─────
    const [gitResult, serverResult] = await Promise.all([
      stageSyncGit({ gitConnectionId, repo, branch, log }),
      stageProvisionServer({
        projectId: projectId || deploymentId,
        providerId: event.providerId,
        tenantId,
        instanceType: event.instanceType,
        client,
        log,
      }),
    ]);
    await checkpoint();

    await updateStatus(deploymentId, "deploying");

    // Re-read the compose file from the repo rather than trusting the wizard's
    // cached analysis: it supplies the `${VAR:?}` list the pre-flight check
    // needs, and re-derives the entry port, which a changed Dockerfile EXPOSE
    // can invalidate between deploys.
    const resolved = await resolveComposeFile({
      gitConnectionId,
      repo,
      branch,
      composePath: compose.path,
      log,
    });

    // ─── Stage 4: Configure the compose stack ────────────────────
    const configured = await stageConfigureCompose({
      projectId: projectId || deploymentId,
      projectName: repoToAppName(repo),
      environmentId: dokployEnvironmentId,
      serverId: serverResult.dokployServerId,
      gitConfig: gitResult.gitConfig,
      compose: {
        path: compose.path,
        // The project's explicit choices win; the file only fills a gap. A user
        // who picked a service and port meant it, and the file's own signals
        // are a heuristic.
        entryService: compose.entryService ?? resolved.entryService,
        entryPort: compose.entryPort ?? resolved.entryPort,
      },
      envVars: projectId ? await loadProjectEnvVars(tenantId, projectId) : [],
      requiredVars: resolved.requiredVars,
      client,
      log,
    });
    await checkpoint();

    // ─── Stage 5: Deploy ─────────────────────────────────────────
    const deployResult = await stageDeployCompose({
      composeId: configured.dokployComposeId,
      appName: configured.appName,
      serverId: serverResult.dokployServerId,
      entryService: configured.entryService,
      entryPort: configured.entryPort,
      client,
      log,
      pollIntervalMs: event.deployPollIntervalMs,
      isCancelled,
      fetchBuildLog: projectId
        ? (logPath: string) => fetchBuildLogTail({ projectId, logPath })
        : undefined,
    });

    if (deployResult.status === "cancelled") throw new DeployCancelledError();
    if (deployResult.status === "error") {
      throw new Error(
        deployResult.failureReason ??
        "The compose deployment failed. Check the compose file's build contexts, images and required variables.",
      );
    }

    // ─── Stage 6: Custom domains ─────────────────────────────────
    // Best-effort and non-fatal, as on the application path.
    if (projectId) {
      try {
        const { applyDomainConfigDokploy } = await import("../../../domains/domain/dokploy-applier.js");
        const domResult = await applyDomainConfigDokploy({ tenantId, projectId });
        await log(`[stage:domains] ${domResult.message}`);
      } catch (domErr) {
        await log(`[stage:domains] Skipped applying domains: ${getErrDetail(domErr)}`);
      }
      await checkpoint();
    }

    // ─── Success ─────────────────────────────────────────────────
    if (await isCancelled()) throw new DeployCancelledError();

    await markProjectInfraLive(projectId);
    await updateStatus(
      deploymentId,
      "success",
      deployResult.appUrl ? { app_url: deployResult.appUrl } : undefined,
    );
    await log(
      `✓ Deployment complete! ${configured.serviceNames.length} service(s) running. ` +
      `App URL: ${deployResult.appUrl || "(no public service configured)"}`,
    );

    await clearRepoFaviconFromAnalysisCache(repo, branch, logger);
    emitDeploySuccessNotification({
      tenantId,
      deploymentId,
      repo,
      branch,
      appUrl: deployResult.appUrl || undefined,
    });
  } catch (err) {
    const cancelled = err instanceof DeployCancelledError;
    const message = getErrDetail(err);

    if (cancelled) {
      await log("⛔ Deployment cancelled by user — pipeline stopped. Any resources already created remain; use Tear Down to remove them.");
    } else {
      await log(`✗ Pipeline failed: ${message}`);
      try {
        await updateStatus(deploymentId, "failed");
      } catch {
        // Best-effort status update.
      }
    }

    // A failed compose deploy may still have created a VM and a Dokploy stack.
    // Mark infra live so the Tear Down button (gated on infra_state === "live")
    // lights up and the user can remove them.
    if (projectId) {
      try {
        await markProjectInfraLive(projectId);
      } catch {
        // never mask the original failure
      }
    }

    if (cancelled) return;
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

/**
 * The project's compose configuration from `projects.settings.compose`.
 *
 * Returns null when the project has none, which makes the deploy fail with an
 * actionable message rather than guessing `./docker-compose.yml` — a guess
 * would deploy the wrong file for any repo that keeps several (a local stack
 * binds source directories and publishes host ports, so deploying it produces
 * a broken service rather than a readable failure).
 */
async function loadComposeConfig(projectId?: string): Promise<ComposeDeployConfig | null> {
  if (!projectId) return null;

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("settings")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data?.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
    return null;
  }

  const compose = (data.settings as Record<string, unknown>).compose;
  if (!compose || typeof compose !== "object" || Array.isArray(compose)) return null;

  const { path, entryService, entryPort } = compose as Record<string, unknown>;
  if (typeof path !== "string" || path === "") return null;

  return {
    path,
    entryService: typeof entryService === "string" ? entryService : undefined,
    entryPort: typeof entryPort === "number" ? entryPort : undefined,
  };
}

async function getOrganizationName(tenantId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  return data?.name || `org-${tenantId.slice(0, 8)}`;
}

async function loadProjectEnvVars(
  tenantId: string,
  projectId: string,
): Promise<Array<{ name: string; value: string }>> {
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
  const parts = repo.split("/");
  return parts[parts.length - 1].replace(/\.git$/, "");
}
