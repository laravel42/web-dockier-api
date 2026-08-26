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
import { env } from "../../../shared/config.js";

/**
 * Route to the appropriate pipeline based on DEPLOY_PROVIDER config.
 * - "dokploy" → Dokploy PaaS pipeline (project → server → app → deploy)
 * - "native"  → Legacy CloudFormation/Pulumi pipeline (clone → build → provision)
 */
async function routePipeline(event: PipelineInput): Promise<void> {
  if (env.DEPLOY_PROVIDER === "dokploy") {
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
