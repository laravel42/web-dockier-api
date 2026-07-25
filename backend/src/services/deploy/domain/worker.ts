/**
 * Deploy pipeline worker.
 *
 * Uses the generic createWorker factory from shared/queue.ts.
 * When a deployment is created, a job is enqueued and this worker picks it up
 * for background processing with retry semantics and crash recovery.
 */

import { createWorker, DEPLOY_QUEUE } from "../../../shared/queue.js";
import { executePipeline, type PipelineInput } from "./pipeline/pipeline.js";

const deployWorker = createWorker<PipelineInput>(
  DEPLOY_QUEUE,
  executePipeline,
  { retryLimit: 1, expireInSeconds: 1800 },
);

export const registerDeployWorker = deployWorker.register;

export async function enqueueDeployment(input: PipelineInput): Promise<void> {
  await deployWorker.enqueue(input, input.deploymentId);
}
