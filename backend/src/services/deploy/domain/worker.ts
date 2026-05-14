/**
 * Deploy pipeline worker.
 *
 * Registers the pg-boss job handler for the deploy-pipeline queue.
 * When a deployment is created, a job is enqueued and this worker picks it up
 * for background processing with retry semantics and crash recovery.
 *
 * If pg-boss is not available (DATABASE_URL not set), falls back to
 * in-process execution via setImmediate.
 */

import { getQueue, DEPLOY_QUEUE } from "../../../shared/queue.js";
import { executePipeline, type PipelineInput } from "./pipeline.js";

let workerRegistered = false;

/**
 * Register the deploy pipeline worker with pg-boss.
 * Call once during server startup (after startQueue).
 * No-op if the queue is not available.
 */
export async function registerDeployWorker(): Promise<void> {
  const queue = getQueue();
  if (!queue || workerRegistered) return;

  await queue.createQueue(DEPLOY_QUEUE);

  await queue.work(DEPLOY_QUEUE, { batchSize: 1, pollingIntervalSeconds: 5 }, async ([job]: any[]) => {
    const input = job.data as PipelineInput;
    console.log(`[deploy-worker] Processing deployment ${input.deploymentId}`);
    await executePipeline(input);
    console.log(`[deploy-worker] Completed deployment ${input.deploymentId}`);
  });

  workerRegistered = true;
  console.log("[deploy-worker] Registered on queue:", DEPLOY_QUEUE);
}

/**
 * Enqueue a deployment for background processing.
 *
 * If pg-boss is available, sends the job to the persistent queue.
 * Otherwise, falls back to in-process execution via setImmediate.
 */
export async function enqueueDeployment(input: PipelineInput): Promise<void> {
  const queue = getQueue();

  if (queue) {
    // Persistent queue — job survives server restarts
    await queue.send(DEPLOY_QUEUE, input as unknown as Record<string, unknown>, {
      retryLimit: 1,
      expireInSeconds: 1800, // 30 min max per deploy
      singletonKey: input.deploymentId, // prevent duplicate processing
    });
    console.log(`[deploy-worker] Enqueued deployment ${input.deploymentId}`);
  } else {
    // Fallback: in-process execution (no crash recovery)
    setImmediate(() => {
      executePipeline(input).catch((err) => {
        console.error(`[deploy-worker] Pipeline failed for ${input.deploymentId}:`, err);
      });
    });
  }
}
