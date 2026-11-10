/**
 * Cancelling a running scan.
 *
 * The request only records intent in the database. The process that owns the
 * scan's subprocess notices it by polling and does the killing, so this works
 * with any number of backend instances: there is no registry of subprocesses to
 * route a request to, and the instance that received the click need not be the
 * one running the scan.
 */

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

/**
 * Record a cancel request. Returns false when the scan is not running — it
 * finished, or never started — so the caller can tell the user instead of
 * pretending something was cancelled. The status filter is also what keeps a
 * late click from touching a scan that just completed.
 */
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

/**
 * Finish a cancelled scan. Only a scan still marked running is touched, so a
 * scan that completed between the kill and this call keeps its result.
 */
export async function markScanCancelled(scanId: string): Promise<void> {
  await markScanFailed(scanId, SCAN_CANCELLED_MESSAGE, { cancelled: true });
}
