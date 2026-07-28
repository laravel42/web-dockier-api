/**
 * Pipeline Error Classification
 *
 * Pure function that classifies caught pipeline errors into structured
 * categories and phases. Used by the pipeline catch block to provide
 * failure metadata in notifications and UI messaging.
 *
 * Separated from helpers.ts (which handles DB writes and event emission)
 * so this logic can be independently unit-tested.
 */

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
