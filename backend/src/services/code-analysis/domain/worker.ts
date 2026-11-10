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

/** A cancelled scan ends the job: failing it would make the queue retry the scan the user stopped. */
export async function handleScanJob(input: ScanJobInput): Promise<void> {
  // Cancelled while queued: nothing to kill, the job just must not start.
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
