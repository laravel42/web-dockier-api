/**
 * Image-builder pipeline worker.
 *
 * Uses the generic createWorker factory from shared/queue.ts.
 * When a build is created, a job is enqueued and this worker picks it up
 * for background processing with retry semantics and crash recovery.
 */

import { createWorker, IMAGE_BUILD_QUEUE } from "../../../shared/queue.js";
import { executeBuild, type BuildJobInput } from "./build-pipeline.js";

const imageBuildWorker = createWorker<BuildJobInput>(
  IMAGE_BUILD_QUEUE,
  executeBuild,
  { retryLimit: 2, expireInSeconds: 1200 },
);

export const registerImageBuildWorker = imageBuildWorker.register;

export async function enqueueBuild(input: BuildJobInput): Promise<void> {
  await imageBuildWorker.enqueue(input, input.buildId);
}
