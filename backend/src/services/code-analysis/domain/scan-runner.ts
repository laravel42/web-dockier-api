/**
 * Standalone scan entry point — spawned as a child process so heavy scan work
 * does not block the Fastify HTTP server event loop.
 */

import { initConfig } from "../../../shared/config.js";
import type { RunScanOptions } from "./scan-worker.js";

interface ScanRunnerInput {
  scanId: string;
  tenantId: string;
  options?: RunScanOptions;
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (!raw) {
    throw new Error("[scan-runner] Missing job input");
  }

  let input: ScanRunnerInput;
  try {
    input = JSON.parse(raw) as ScanRunnerInput;
  } catch {
    throw new Error("[scan-runner] Invalid job input JSON");
  }

  await initConfig();
  const { executeScan } = await import("./scan-worker.js");
  await executeScan(input.scanId, input.tenantId, input.options ?? {});
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scan-runner] ${message}`);
    process.exit(1);
  });
