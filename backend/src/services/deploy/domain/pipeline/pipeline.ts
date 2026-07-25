/**
 * Deploy Pipeline Orchestrator
 *
 * Thin entry point that coordinates the full deployment lifecycle.
 * All reusable types and stage helpers live in pipeline-shared.ts;
 * individual stage implementations live in pipeline-stages.ts.
 *
 * This file owns:
 *   - executePipeline() — the main entry point called by the worker
 *   - fetchProviderCredentials() — private helper for template path
 */

import { rm } from "node:fs/promises";
import { logger as obsLogger } from "../../../../shared/logger.js";
import { createDeployLogger } from "../../../../lib/logging.js";
import { getProviderCredentialsSafe } from "../../../../lib/provider-credentials.js";
import { createStreamingRunCmd } from "../run-cmd.js";
import { extractRegionFromScript } from "../gcp-helpers.js";
import { getTemplateConfig } from "../project-templates.js";
import { isCloudProvider } from "../../types.js";
import { executeTemplatePipeline } from "./template.js";

import { appendLog, updateStatus, emitDeployFailureNotification, classifyPipelineError } from "./helpers.js";
import { logTimestamp as ts } from "../../../../shared/utils/time.js";
import { getDeploymentCurrentStatus } from "../deployments.js";

import { PipelineContext } from "./context.js";
import {
  stageProviderCredentials,
  stageClone,
  stageLoadProjectContext,
  stageAnalyze,
  stageBuild,
  stageProvision,
  stagePostDeploy,
  stageNetworkRules,
  stageFinalize,
  stageRestoreProcesses,
} from "./stages.js";

import type { PipelineInput, ProviderResult } from "./shared.js";

// Re-export types so existing worker.ts import path continues to work.
export type { PipelineInput, ProjectContext, ProviderResult } from "./shared.js";

// ─── Private: Fetch Provider Credentials (template path) ───────────

async function fetchProviderCredentials(
  event: PipelineInput,
): Promise<ProviderResult | null> {
  const creds = await getProviderCredentialsSafe(event.providerId);
  if (!creds) {
    obsLogger.error({ providerId: event.providerId }, "[deploy] Provider not found or credentials unavailable");
    return null;
  }

  const rawProvider = creds.provider || "";
  if (!isCloudProvider(rawProvider)) {
    obsLogger.error({ providerId: event.providerId, provider: rawProvider }, "[deploy] Unsupported cloud provider");
    return null;
  }

  let region = creds.region || "us-east-1";
  if (event.tofuScript) {
    const scriptRegion = extractRegionFromScript(event.tofuScript);
    if (scriptRegion) region = scriptRegion;
  }

  return {
    provider: rawProvider,
    region,
    credentials: {
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
    },
  };
}

// ─── Main Pipeline Orchestrator ────────────────────────────────────

/**
 * Execute the full deployment pipeline.
 * This runs asynchronously via the pg-boss job queue.
 */
export async function executePipeline(event: PipelineInput): Promise<void> {
  const { deploymentId } = event;

  // Idempotency guard
  const currentStatus = await getDeploymentCurrentStatus(deploymentId);
  if (currentStatus === "building" || currentStatus === "deploying" || currentStatus === "cancelled") return;

  // Template deploy path (early exit)
  if (event.templateId) {
    const templateConfig = getTemplateConfig(event.templateId);
    if (templateConfig) {
      const providerResult = await fetchProviderCredentials(event);
      if (providerResult) {
        await executeTemplatePipeline(event, providerResult, templateConfig);
        return;
      }
    }
  }

  // Standard deploy path
  const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);
  const logger = createDeployLogger(appendLog, deploymentId);
  const ctx = new PipelineContext(event, logger, runCmd);

  try {
    await updateStatus(deploymentId, "building");
    await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);

    await stageProviderCredentials(ctx);
    await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${ctx.provider} | Region: ${ctx.region}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${ctx.deployStrategy}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${ctx.event.repo} | Branch: ${ctx.event.branch}`);

    await stageClone(ctx);
    await stageLoadProjectContext(ctx);
    await stageAnalyze(ctx);
    await stageBuild(ctx);

    await updateStatus(deploymentId, "deploying");
    await stageProvision(ctx);
    await stagePostDeploy(ctx);
    await stageNetworkRules(ctx);
    await stageFinalize(ctx);
    await stageRestoreProcesses(ctx);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const { category, phase } = classifyPipelineError(e);
    // Best-effort logging and status update. If Supabase is unreachable
    // (the cause of this failure), these calls may also fail silently.
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${message}`);
    try {
      await updateStatus(deploymentId, "failed");
    } catch (statusErr) {
      obsLogger.error({ err: statusErr, deploymentId }, "[deploy] Could not mark deployment as failed");
    }
    // Notify the user of the failure with classification
    emitDeployFailureNotification({
      tenantId: event.tenantId,
      deploymentId,
      repo: event.repo,
      branch: event.branch,
      reason: message,
      commitHash: ctx.commitHash,
      category,
      phase,
    });
  } finally {
    if (ctx.workDir) {
      await rm(ctx.workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
