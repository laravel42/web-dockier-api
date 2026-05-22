/**
 * Image-builder pipeline worker.
 *
 * Registers the pg-boss job handler for the image-build queue.
 * When a build is created, a job is enqueued and this worker picks it up
 * for background processing with retry semantics and crash recovery.
 *
 * If pg-boss is not available (DATABASE_URL not set), falls back to
 * in-process execution via setImmediate.
 */

import { getQueue, IMAGE_BUILD_QUEUE } from "../../../shared/queue.js";
import { executeBuild, type BuildJobInput } from "./build-pipeline.js";
import type { Job } from "pg-boss";

let workerRegistered = false;

/**
 * Register the image-build worker with pg-boss.
 * Call once during server startup (after startQueue).
 * No-op if the queue is not available.
 */
export async function registerImageBuildWorker(): Promise<void> {
  const queue = getQueue();
  if (!queue || workerRegistered) return;

  await queue.createQueue(IMAGE_BUILD_QUEUE);

  await queue.work(IMAGE_BUILD_QUEUE, { batchSize: 1, pollingIntervalSeconds: 5 }, async ([job]: Job<BuildJobInput>[]) => {
    const input = job.data;
    console.log(`[image-build-worker] Processing build ${input.buildId}`);
    await executeBuild(input);
    console.log(`[image-build-worker] Completed build ${input.buildId}`);
  });

  workerRegistered = true;
  console.log("[image-build-worker] Registered on queue:", IMAGE_BUILD_QUEUE);
}

/**
 * Enqueue an image build for background processing.
 *
 * If pg-boss is available, sends the job to the persistent queue.
 * Otherwise, falls back to in-process execution via setImmediate.
 */
export async function enqueueBuild(input: BuildJobInput): Promise<void> {
  const queue = getQueue();

  if (queue) {
    // Persistent queue — job survives server restarts
    await queue.send(IMAGE_BUILD_QUEUE, input as unknown as Record<string, unknown>, {
      retryLimit: 2,
      expireInSeconds: 1200, // 20 min max per build
      singletonKey: input.buildId, // prevent duplicate processing
    });
    console.log(`[image-build-worker] Enqueued build ${input.buildId}`);
  } else {
    // Fallback: in-process execution (no crash recovery)
    setImmediate(() => {
      executeBuild(input).catch((err) => {
        console.error(`[image-build-worker] Build failed for ${input.buildId}:`, err);
      });
    });
  }
}
