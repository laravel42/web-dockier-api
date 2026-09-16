import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import { nowIso } from "../../../shared/utils/time.js";
import { parseSummary } from "./mappers.js";
import { broadcastScanEvent, type ScanProgressPayload } from "./scan-events.js";

const lastDbWrite = new Map<string, number>();
const pendingBroadcast = new Map<string, ScanProgressPayload>();
const broadcastTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DB_WRITE_INTERVAL_MS = 400;
const WS_BROADCAST_INTERVAL_MS = 150;

function clearProgressBroadcastTimer(scanId: string): void {
  const timer = broadcastTimers.get(scanId);
  if (timer) {
    clearTimeout(timer);
    broadcastTimers.delete(scanId);
  }
  pendingBroadcast.delete(scanId);
}

function scheduleProgressBroadcast(scanId: string, progress: ScanProgressPayload): void {
  pendingBroadcast.set(scanId, progress);
  if (broadcastTimers.has(scanId)) return;

  const timer = setTimeout(() => {
    broadcastTimers.delete(scanId);
    const latest = pendingBroadcast.get(scanId);
    pendingBroadcast.delete(scanId);
    if (latest) broadcastScanEvent(scanId, { type: "progress", scanId, progress: latest });
  }, WS_BROADCAST_INTERVAL_MS);
  broadcastTimers.set(scanId, timer);
}

export async function updateScanProgress(scanId: string, progress: ScanProgressPayload): Promise<void> {
  scheduleProgressBroadcast(scanId, progress);

  const now = Date.now();
  const last = lastDbWrite.get(scanId) ?? 0;
  if (now - last < DB_WRITE_INTERVAL_MS) return;

  const { data, error: fetchError } = await supabaseAdmin
    .from("scans")
    .select("summary")
    .eq("id", scanId)
    .single();
  if (fetchError || !data) return;

  const summary = { ...parseSummary(data.summary), progress };
  const { error } = await supabaseAdmin
    .from("scans")
    .update({ summary: summary as unknown as Json, updated_at: nowIso() })
    .eq("id", scanId);

  if (!error) lastDbWrite.set(scanId, now);
}

/** Force-write progress to DB (phase transitions, completion). */
export async function persistScanProgress(scanId: string, progress: ScanProgressPayload): Promise<void> {
  clearProgressBroadcastTimer(scanId);
  broadcastScanEvent(scanId, { type: "progress", scanId, progress });

  const { data, error: fetchError } = await supabaseAdmin
    .from("scans")
    .select("summary")
    .eq("id", scanId)
    .single();
  if (fetchError || !data) return;

  const summary = { ...parseSummary(data.summary), progress };
  await supabaseAdmin
    .from("scans")
    .update({ summary: summary as unknown as Json, updated_at: nowIso() })
    .eq("id", scanId);

  lastDbWrite.set(scanId, Date.now());
}

export function broadcastScanStatus(
  scanId: string,
  status: string,
  summary: Record<string, unknown>,
): void {
  lastDbWrite.delete(scanId);
  clearProgressBroadcastTimer(scanId);
  broadcastScanEvent(scanId, { type: "status", scanId, status, summary });
}
