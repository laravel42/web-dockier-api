/**
 * Security scan worker — runs scans off the HTTP request path via pg-boss.
 */

import { createWorker, SECURITY_SCAN_QUEUE } from "../../../shared/queue.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { runScanInSubprocess } from "./run-scan-subprocess.js";
import { failScanIfStillRunning, type RunScanOptions } from "./scan-worker.js";
import { parseSummary } from "./mappers.js";

async function resolveScanJobError(scanId: string, err: unknown): Promise<Error> {
  await failScanIfStillRunning(scanId, err);

  const { data } = await supabaseAdmin.from("scans").select("status, summary").eq("id", scanId).single();
  const summary = parseSummary(data?.summary);
  if (data?.status === "failed" && summary.error) {
    return new Error(summary.error);
  }

  return err instanceof Error ? err : new Error(String(err));
}

export interface ScanJobInput {
  scanId: string;
  tenantId: string;
  options: RunScanOptions;
}

const scanWorker = createWorker<ScanJobInput>(
  SECURITY_SCAN_QUEUE,
  async (input) => {
    try {
      await runScanInSubprocess(input);
    } catch (err) {
      throw await resolveScanJobError(input.scanId, err);
    }
  },
  { retryLimit: 1, expireInSeconds: 3600 },
);

export const registerScanWorker = scanWorker.register;

export async function enqueueScan(input: ScanJobInput): Promise<void> {
  await scanWorker.enqueue(input, input.scanId);
}
