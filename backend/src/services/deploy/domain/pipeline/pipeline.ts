/**
 * Deploy Pipeline Orchestrator
 *
 * Single entry point that coordinates both standard and template deployments.
 * All reusable types and stage helpers live in shared.ts;
 * individual stage implementations live in stages.ts.
 *
 * Template deploys follow the same orchestrator flow but skip clone/analyze/build
 * and use template-specific initialization instead. This eliminates the previous
 * duplication between pipeline.ts and template.ts.
 *
 * This file owns:
 *   - executePipeline() — the main entry point called by the worker
 */

import { rm } from "node:fs/promises";
import { logger as obsLogger } from "../../../../shared/logger.js";
import { createDeployLogger } from "../../../../lib/logging.js";
import { createStreamingRunCmd } from "../run-cmd.js";
import { getTemplateConfig } from "../project-templates.js";

import { appendLog, updateStatus, emitDeployFailureNotification } from "./helpers.js";
import { classifyPipelineError } from "./error-classification.js";
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
  stageTemplateInit,
  stageTemplatePull,
  stageTemplatePostDeploy,
} from "./stages.js";

import type { PipelineInput } from "./shared.js";

// Re-export types so existing worker.ts import path continues to work.
export type { PipelineInput, ProjectContext, ProviderResult } from "./shared.js";

// ─── Main Pipeline Orchestrator ────────────────────────────────────

/**
 * Execute the full deployment pipeline.
 * This runs asynchronously via the pg-boss job queue.
 *
 * Handles both standard deploys (clone → analyze → build → provision)
 * and template deploys (pull image → provision) via the same stage flow.
 */
export async function executePipeline(event: PipelineInput): Promise<void> {
  const { deploymentId } = event;

  // Idempotency guard
  const currentStatus = await getDeploymentCurrentStatus(deploymentId);
  if (currentStatus === "building" || currentStatus === "deploying" || currentStatus === "cancelled") return;

  const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);
  const logger = createDeployLogger(appendLog, deploymentId);
  const ctx = new PipelineContext(event, logger, runCmd);

  // Resolve template config (if this is a template deploy)
  if (event.templateId) {
    ctx.templateConfig = getTemplateConfig(event.templateId) ?? null;
  }

  try {
    await updateStatus(deploymentId, "building");

    if (ctx.isTemplate) {
      await appendLog(deploymentId, `[${ts()}] ▶ Starting template deployment: ${ctx.templateConfig!.name}`);
    } else {
      await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);
    }

    // Stage 1: Resolve provider credentials (both paths)
    await stageProviderCredentials(ctx);
    await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${ctx.provider} | Region: ${ctx.region}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${ctx.deployStrategy}`);

    if (ctx.isTemplate) {
      // Template path: load project context → template init → pull image
      await stageLoadProjectContext(ctx);
      await stageTemplateInit(ctx);
      await stageTemplatePull(ctx);
    } else {
      // Standard path: clone → load project context → analyze → build
      await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${ctx.event.repo} | Branch: ${ctx.event.branch}`);
      await stageClone(ctx);
      await stageLoadProjectContext(ctx);
      await stageAnalyze(ctx);
      await stageBuild(ctx);
    }

    // From here, both paths converge
    await updateStatus(deploymentId, "deploying");
    await stageProvision(ctx);

    // Template-specific post-deploy (WordPress wp-config, stabilization)
    if (ctx.isTemplate) {
      await stageTemplatePostDeploy(ctx);
    }

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
      commitHash: ctx.commitHash || undefined,
      category,
      phase,
    });
  } finally {
    if (ctx.workDir) {
      await rm(ctx.workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
