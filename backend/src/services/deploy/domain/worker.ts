/**
 * Deploy pipeline worker.
 *
 * Uses the generic createWorker factory from shared/queue.ts.
 * When a deployment is created, a job is enqueued and this worker picks it up
 * for background processing with retry semantics and crash recovery.
 *
 * Routes to either the native pipeline (CloudFormation/Pulumi) or the
 * Dokploy pipeline based on the DEPLOY_PROVIDER environment variable.
 */

import { createWorker, DEPLOY_QUEUE } from "../../../shared/database/queue.js";
import { executePipeline, type PipelineInput } from "./pipeline/pipeline.js";
import { executeDokployPipeline } from "./dokploy/pipeline.js";
import { assertDokployConfigured } from "./dokploy/config.js";
import { env } from "../../../shared/config.js";

/**
 * Route to the appropriate pipeline based on DEPLOY_PROVIDER config.
 * - "dokploy" → Dokploy PaaS pipeline (project → server → app → deploy)
 * - "native"  → Legacy CloudFormation/Pulumi pipeline (clone → build → provision)
 *
 * Validates required configuration before dispatching to prevent opaque
 * failures deep inside the pipeline.
 */
async function routePipeline(event: PipelineInput): Promise<void> {
  if (env.DEPLOY_PROVIDER === "dokploy") {
    // Fail fast with a single clear error if the Dokploy provider is
    // misconfigured, before the deployment flips to "building" and crashes
    // with an opaque error deep inside a stage.
    assertDokployConfigured();
    return executeDokployPipeline(event);
  }
  return executePipeline(event);
}

const deployWorker = createWorker<PipelineInput>(
  DEPLOY_QUEUE,
  routePipeline,
  { retryLimit: 1, expireInSeconds: 1800 },
);

export const registerDeployWorker = deployWorker.register;

export async function enqueueDeployment(input: PipelineInput): Promise<void> {
  await deployWorker.enqueue(input, input.deploymentId);
}
