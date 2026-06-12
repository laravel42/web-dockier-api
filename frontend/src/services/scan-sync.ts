import { request } from "./request";
import type { Scan } from "../types";

/**
 * Fetch a one-off snapshot of a scan's current state.
 *
 * Routed through the shared `request()` wrapper so it inherits timeout and
 * 401/session handling. Returns `null` on any failure — callers (the scan
 * progress poller) treat a missing snapshot as "no update" and keep their
 * own reconnect/poll loop, so this stays non-throwing. Retries are disabled
 * because that loop already handles transient failures.
 */
export async function fetchScanSnapshot(scanId: string): Promise<Scan | null> {
  try {
    return await request<Scan>(`/code-analysis/scans/${scanId}`, { noRetry: true });
  } catch {
    return null;
  }
}
