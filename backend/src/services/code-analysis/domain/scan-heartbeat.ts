/**
 * Elapsed-time formatting and the scan heartbeat.
 *
 * The heartbeat keeps a scan's `updated_at` fresh during long-running steps
 * (clone, semgrep, sonarqube) so the stale-scan reconciler can distinguish a
 * slow-but-alive worker from a dead one.
 */

import { logger as obsLogger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { persistScanProgress } from "./scan-progress.js";
import type { ScanProgressPayload } from "./scan-events.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

/** Format a duration in milliseconds as `Ns` or `Nm Ss`. */
export function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

/**
 * Append an `(elapsed)` suffix to a label, replacing any suffix already present
 * so repeated calls don't stack multiple timers onto the same label.
 */
export function withElapsed(label: string, startedAt: number): string {
  const base = label.replace(/ \(\d+m? ?\d*s\)$/, "");
  return `${base} (${formatElapsed(Date.now() - startedAt)})`;
}

/**
 * Start a heartbeat that periodically re-persists the current progress payload
 * (with a live elapsed timer on `currentFile`). Returns a stop function that
 * clears the interval — always call it in a `finally`.
 */
export function startScanHeartbeat(
  scanId: string,
  getProgress: () => ScanProgressPayload,
): () => void {
  const startedAt = Date.now();
  const interval = setInterval(() => {
    const base = getProgress();
    persistScanProgress(scanId, {
      ...base,
      currentFile: withElapsed(base.currentFile ?? "Working", startedAt),
    }).catch((err: unknown) => {
      const message = getErrMsg(err);
      obsLogger.error("[scan] Heartbeat progress persist failed: " + message);
    });
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(interval);
}
