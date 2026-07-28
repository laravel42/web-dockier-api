/**
 * Pipeline shared helpers.
 *
 * Low-level utilities used across all pipeline stages: timestamp formatting,
 * deployment log appending, status updates, and .env content parsing.
 *
 * DB writes delegate to domain functions in deployments.ts — this module
 * provides the pipeline-specific calling conventions (e.g. appendLog signature
 * expected by createDeployLogger and createStreamingRunCmd).
 */

import {
  appendDeploymentLog,
  setDeploymentStatus,
} from "../deployments.js";
import type { DeploymentStatus } from "../../types.js";
import { emit } from "../../../../shared/events.js";

// ─── Deployment Log ────────────────────────────────────────────────

export async function appendLog(deploymentId: string, line: string): Promise<void> {
  await appendDeploymentLog(deploymentId, line);
}

// ─── Status Update ─────────────────────────────────────────────────

export async function updateStatus(deploymentId: string, status: DeploymentStatus, extra?: Record<string, unknown>): Promise<void> {
  await setDeploymentStatus(deploymentId, status, extra);
}

// ─── Deploy Notification ───────────────────────────────────────────

/**
 * Emit a deploy-succeeded notification via the domain event bus.
 *
 * Encapsulates the common notification payload so callers (pipeline.ts,
 * processor.ts) don't duplicate the message construction.
 */
export function emitDeploySuccessNotification(params: {
  tenantId: string;
  deploymentId: string;
  repo: string;
  branch: string;
  commitHash?: string;
  appUrl?: string;
}): void {
  const { tenantId, deploymentId, repo, branch, commitHash, appUrl } = params;
  const message = appUrl
    ? `Deployment of ${repo} (${branch}) succeeded. App URL: ${appUrl}`
    : `Deployment of ${repo} (${branch}) succeeded.`;

  emit("notification:send", {
    tenantId,
    title: "Deployment succeeded",
    message,
    metadata: {
      kind: "deploy",
      repo,
      branch,
      commit: commitHash || undefined,
      appUrl: appUrl || undefined,
      deployId: deploymentId,
    },
  });
}

/**
 * Emit a deploy-failed notification via the domain event bus.
 *
 * Provides users with immediate awareness of deployment failures
 * through their configured notification channels (in-app, email, etc.).
 *
 * Includes optional error classification so the UI and notification
 * templates can present different messaging for build failures
 * (user-actionable) vs. infrastructure failures (platform issue).
 */
export function emitDeployFailureNotification(params: {
  tenantId: string;
  deploymentId: string;
  repo: string;
  branch: string;
  reason?: string;
  commitHash?: string;
  /** Error category: "build" for clone/analyze/docker errors, "infra" for provisioning, "post-deploy" for post-deploy scripts */
  category?: "build" | "infra" | "post-deploy" | "unknown";
  /** Specific phase within the category (e.g. "clone", "docker-build", "cloudformation") */
  phase?: string;
}): void {
  const { tenantId, deploymentId, repo, branch, reason, commitHash, category, phase } = params;

  const prefix = category === "build"
    ? "Build failed"
    : category === "infra"
      ? "Infrastructure provisioning failed"
      : category === "post-deploy"
        ? "Post-deploy step failed"
        : "Deployment failed";

  const message = reason
    ? `${prefix} for ${repo} (${branch}): ${reason}`
    : `${prefix} for ${repo} (${branch}).`;

  emit("notification:send", {
    tenantId,
    title: prefix,
    message,
    metadata: {
      kind: "deploy",
      repo,
      branch,
      commit: commitHash || undefined,
      deployId: deploymentId,
      failureCategory: category || "unknown",
      failurePhase: phase || undefined,
    },
  });
}

// ─── Env Parser ────────────────────────────────────────────────────

// Env parsing has been consolidated into shared/env/parse-env.ts.
// Import directly from there: import { parseEnvContent } from "../../../shared/env/parse-env.js";
