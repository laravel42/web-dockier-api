/**
 * Security scan worker — runs scans off the HTTP request path via pg-boss.
 */

import { createWorker, SECURITY_SCAN_QUEUE } from "../../../shared/database/queue.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { runScanInSubprocess } from "./run-scan-subprocess.js";
import { failScanIfStillRunning, type RunScanOptions } from "./scan-worker.js";
import { parseSummary } from "./mappers.js";
import { ScanCancelledError, isScanCancelRequested, markScanCancelled } from "./scan-cancel.js";

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
  /** Request ID from the originating HTTP request — used for log correlation. */
  correlationId?: string;
}

/**
 * A cancelled scan must END the job, not fail it: the queue retries a failed
 * job (retryLimit below), which would start the scan the user just stopped.
 */
export async function handleScanJob(input: ScanJobInput): Promise<void> {
  // Cancelled while still queued: there is no process to kill, only a job that
  // must not start. `runScan` marks a scan running as soon as it enqueues it.
  if (await isScanCancelRequested(input.scanId)) {
    await markScanCancelled(input.scanId);
    return;
  }
  try {
    await runScanInSubprocess(input, undefined, {
      isCancelled: () => isScanCancelRequested(input.scanId),
    });
  } catch (err) {
    if (err instanceof ScanCancelledError) {
      await markScanCancelled(input.scanId);
      return;
    }
    throw await resolveScanJobError(input.scanId, err);
  }
}

const scanWorker = createWorker<ScanJobInput>(SECURITY_SCAN_QUEUE, handleScanJob, {
  retryLimit: 1,
  expireInSeconds: 3600,
});

export const registerScanWorker = scanWorker.register;

export async function enqueueScan(input: ScanJobInput): Promise<void> {
  await scanWorker.enqueue(input, input.scanId);
}
