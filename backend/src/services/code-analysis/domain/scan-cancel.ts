/** Cancel records intent in the database; the instance owning the subprocess polls it, so any instance can serve the request. */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { nowIso } from "../../../shared/utils/time.js";
import { markScanFailed } from "./scan-persistence.js";

export const SCAN_CANCELLED_MESSAGE = "Scan cancelled";

/** Thrown by the subprocess runner when it stopped because a cancel was requested. */
export class ScanCancelledError extends Error {
  constructor() {
    super(SCAN_CANCELLED_MESSAGE);
    this.name = "ScanCancelledError";
  }
}

/** False when the scan is not running; the status filter keeps a late click off a finished scan. */
export async function requestScanCancel(scanId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("scans")
    .update({ cancel_requested_at: nowIso() })
    .eq("id", scanId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to request scan cancellation: ${error.message}`);
  return data !== null;
}

export async function isScanCancelRequested(scanId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("scans")
    .select("cancel_requested_at")
    .eq("id", scanId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read scan cancellation: ${error.message}`);
  return Boolean(data?.cancel_requested_at);
}

/** Finish a cancelled scan; one that completed meanwhile keeps its result (see markScanFailed). */
export async function markScanCancelled(scanId: string): Promise<void> {
  await markScanFailed(scanId, SCAN_CANCELLED_MESSAGE, { cancelled: true });
}
