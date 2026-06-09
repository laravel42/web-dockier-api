/**
 * Standalone scan entry point — spawned as a child process so heavy scan work
 * does not block the Fastify HTTP server event loop.
 */

import { executeScan, type RunScanOptions } from "./scan-worker.js";

interface ScanRunnerInput {
  scanId: string;
  tenantId: string;
  options?: RunScanOptions;
}

const raw = process.argv[2];
if (!raw) {
  console.error("[scan-runner] Missing job input");
  process.exit(1);
}

let input: ScanRunnerInput;
try {
  input = JSON.parse(raw) as ScanRunnerInput;
} catch {
  console.error("[scan-runner] Invalid job input JSON");
  process.exit(1);
}

executeScan(input.scanId, input.tenantId, input.options ?? {})
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scan-runner] Scan ${input.scanId} failed: ${message}`);
    process.exit(1);
  });
