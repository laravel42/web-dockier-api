import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import { defaultSummary, parseSummary } from "./mappers.js";
import { broadcastScanStatus } from "./scan-progress.js";
import { logger } from "../../../shared/logger.js";
import { nowIso } from "../../../shared/utils/time.js";

/** Running scans must heartbeat within this window (see scan-worker). */
const RUNNING_HEARTBEAT_STALE_MS = 90 * 1000;
/** Running scans that never reported progress (job never started). */
const RUNNING_NO_PROGRESS_MS = 2 * 60 * 1000;
/** Pending scans that never started. */
const PENDING_STALE_MS = 5 * 60 * 1000;

interface ScanRow {
  id: string;
  status: string;
  updated_at: string;
  summary?: unknown;
}

function isStale(row: ScanRow): boolean {
  const ageMs = Date.now() - new Date(row.updated_at).getTime();
  if (row.status === "pending") return ageMs > PENDING_STALE_MS;
  if (row.status === "running") {
    const raw =
      typeof row.summary === "object" && row.summary !== null
        ? (row.summary as Record<string, unknown>).progress
        : undefined;
    const hasProgress = raw != null || parseSummary(row.summary).progress != null;
    if (!hasProgress && ageMs > RUNNING_NO_PROGRESS_MS) return true;
    return ageMs > RUNNING_HEARTBEAT_STALE_MS;
  }
  return false;
}

async function failStaleScan(scanId: string, message: string): Promise<void> {
  const summary = {
    ...defaultSummary(),
    error: message,
  };

  const { error } = await supabaseAdmin
    .from("scans")
    .update({
      status: "failed",
      summary: summary as unknown as Json,
      updated_at: nowIso(),
    })
    .eq("id", scanId)
    .in("status", ["running", "pending"]);

  if (error) {
    logger.error({ err: error.message }, `[scan] Failed to reconcile stale scan ${scanId}`);
    return;
  }

  broadcastScanStatus(scanId, "failed", summary);
  logger.info(`[scan] Reconciled stale scan ${scanId} → failed`);
}

export async function reconcileStaleScanById(scanId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("scans")
    .select("id,status,updated_at,summary")
    .eq("id", scanId)
    .single();

  if (error || !data || !isStale(data)) return false;

  await failStaleScan(scanId, "Scan timed out or was interrupted. Please run a new scan.");
  return true;
}

export async function reconcileAllStaleScans(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("scans")
    .select("id,status,updated_at,summary")
    .in("status", ["running", "pending"]);

  if (error || !data) return 0;

  let count = 0;
  for (const row of data) {
    if (!isStale(row)) continue;
    await failStaleScan(row.id, "Scan timed out or was interrupted. Please run a new scan.");
    count++;
  }
  return count;
}
