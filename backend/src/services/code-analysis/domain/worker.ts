/**
 * Security scan worker — runs scans off the HTTP request path via pg-boss.
 */

import { createWorker, SECURITY_SCAN_QUEUE } from "../../../shared/queue.js";
import { runScanInSubprocess } from "./run-scan-subprocess.js";
import type { RunScanOptions } from "./scan-worker.js";

export interface ScanJobInput {
  scanId: string;
  tenantId: string;
  options: RunScanOptions;
}

const scanWorker = createWorker<ScanJobInput>(
  SECURITY_SCAN_QUEUE,
  async (input) => {
    await runScanInSubprocess(input);
  },
  { retryLimit: 1, expireInSeconds: 3600 },
);

export const registerScanWorker = scanWorker.register;

export async function enqueueScan(input: ScanJobInput): Promise<void> {
  await scanWorker.enqueue(input, input.scanId);
}
