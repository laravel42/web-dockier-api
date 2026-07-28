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

// ─── Error Classification ──────────────────────────────────────────

import { BuildError, ProvisionError } from "../../../../lib/logging.js";

export interface ErrorClassification {
  category: "build" | "infra" | "post-deploy" | "unknown";
  phase?: string;
}

/**
 * Classify a caught pipeline error into a category and phase.
 *
 * Used by the pipeline catch block to provide structured failure metadata
 * in notifications. This allows the UI to show different messaging:
 * - Build errors: "Check your Dockerfile / build configuration"
 * - Infra errors: "Infrastructure issue — contact support or retry"
 * - Post-deploy: "Deployment succeeded but a post-deploy step failed"
 *
 * Heuristic patterns are deliberately specific to avoid misclassification.
 * For example, "clone" alone would match "Could not clone ECR repository"
 * (an infra error), so we require "git clone" or "failed to clone" context.
 */
export function classifyPipelineError(error: unknown): ErrorClassification {
  if (error instanceof BuildError) {
    return { category: "build", phase: error.phase };
  }
  if (error instanceof ProvisionError) {
    return { category: "infra", phase: error.provider };
  }

  if (!(error instanceof Error)) {
    return { category: "unknown" };
  }

  const msg = error.message.toLowerCase();

  // ── Infra patterns (check first — more specific than build) ──────
  if (
    msg.includes("cloudformation") ||
    msg.includes("pulumi") ||
    msg.includes("provision") ||
    msg.includes("stack creation failed") ||
    msg.includes("stack update failed") ||
    msg.includes("createstack") ||
    msg.includes("updatestack") ||
    msg.includes("rollback_complete") ||
    msg.includes("cloud run") ||
    msg.includes("ecs service") ||
    msg.includes("ecr repository") ||
    msg.includes("capacity constraints") ||
    msg.includes("instancelimitexceeded") ||
    msg.includes("vcpu limit")
  ) {
    return { category: "infra", phase: "provision" };
  }

  // ── Post-deploy patterns ─────────────────────────────────────────
  if (
    msg.includes("post-deploy") ||
    msg.includes("post_deploy") ||
    msg.includes("deploy script failed") ||
    msg.includes("ssm command failed")
  ) {
    return { category: "post-deploy" };
  }

  // ── Build/clone patterns ─────────────────────────────────────────
  if (
    msg.includes("git clone") ||
    msg.includes("failed to clone") ||
    msg.includes("clone failed") ||
    msg.includes("repository not found") ||
    msg.includes("authentication failed") ||
    msg.includes("git connection not found") ||
    msg.includes("could not resolve host")
  ) {
    return { category: "build", phase: "clone" };
  }

  if (
    msg.includes("dockerfile") ||
    msg.includes("docker build") ||
    msg.includes("docker buildx") ||
    msg.includes("failed to build image") ||
    msg.includes("build failed") ||
    msg.includes("exited with code") ||
    msg.includes("npm run build") ||
    msg.includes("pnpm build") ||
    msg.includes("yarn build") ||
    msg.includes("composer install") ||
    msg.includes("pip install")
  ) {
    return { category: "build", phase: "docker-build" };
  }

  if (
    msg.includes("failed to pull docker image") ||
    msg.includes("docker pull") ||
    msg.includes("docker push") ||
    msg.includes("image push failed") ||
    msg.includes("docker tag")
  ) {
    return { category: "build", phase: "docker-build" };
  }

  return { category: "unknown" };
}

// ─── Env Parser ────────────────────────────────────────────────────

// Env parsing has been consolidated into shared/env/parse-env.ts.
// Import directly from there: import { parseEnvContent } from "../../../shared/env/parse-env.js";
