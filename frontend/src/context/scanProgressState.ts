import type { ScanWsMessage } from "../services/scan-websocket";
import type { Scan, ScanProgress, ScanSummary } from "../types";

export interface ScanLiveState {
  status: string;
  progress: ScanProgress | null;
  summary: ScanSummary | null;
  error: string | null;
}

export const ACTIVE_STATUSES = new Set(["pending", "running"]);
export const TERMINAL_STATUSES = new Set(["completed", "failed"]);

const PHASE_ORDER: Record<string, number> = {
  cloning: 0,
  scanning: 1,
  persisting: 2,
  done: 3,
};

export const POLL_INTERVAL_MS = 4_000;

function emptySummaryFromProgress(progress: ScanProgress): ScanSummary {
  return {
    totalFindings: progress.findingsCount,
    errors: 0,
    warnings: 0,
    infos: 0,
    filesScanned: progress.filesScanned,
    filesInRepo: progress.filesInRepo,
    progress,
  };
}

function summaryFromRecord(raw: Record<string, unknown>): ScanSummary {
  return {
    totalFindings: Number(raw.totalFindings ?? 0),
    errors: Number(raw.errors ?? 0),
    warnings: Number(raw.warnings ?? 0),
    infos: Number(raw.infos ?? 0),
    filesScanned: Number(raw.filesScanned ?? 0),
    filesInRepo: Number(raw.filesInRepo ?? 0),
    error: typeof raw.error === "string" ? raw.error : undefined,
    progress: raw.progress as ScanProgress | undefined,
  };
}

function progressEqual(a: ScanProgress | null | undefined, b: ScanProgress | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.phase === b.phase
    && a.filesScanned === b.filesScanned
    && a.filesInRepo === b.filesInRepo
    && a.findingsCount === b.findingsCount
    && a.currentFile === b.currentFile
    && a.currentRule === b.currentRule
    && a.scanner === b.scanner
    && a.rulesChecked === b.rulesChecked
    && a.rulesTotal === b.rulesTotal
  );
}

function summaryEqual(a: ScanSummary | null, b: ScanSummary | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.totalFindings === b.totalFindings
    && a.errors === b.errors
    && a.warnings === b.warnings
    && a.infos === b.infos
    && a.filesScanned === b.filesScanned
    && a.filesInRepo === b.filesInRepo
    && a.error === b.error
    && progressEqual(a.progress, b.progress)
  );
}

export function liveStateEqual(a: ScanLiveState | undefined, b: ScanLiveState): boolean {
  if (!a) return false;
  return (
    a.status === b.status
    && a.error === b.error
    && progressEqual(a.progress, b.progress)
    && summaryEqual(a.summary, b.summary)
  );
}

function progressAhead(
  live: ScanProgress | null | undefined,
  api: ScanProgress | null | undefined,
): ScanProgress | null {
  if (!live) return api ?? null;
  if (!api) return live;

  if (live.filesScanned !== api.filesScanned) {
    return live.filesScanned > api.filesScanned ? live : api;
  }
  if (live.findingsCount !== api.findingsCount) {
    return live.findingsCount > api.findingsCount ? live : api;
  }

  const livePhase = PHASE_ORDER[live.phase] ?? 0;
  const apiPhase = PHASE_ORDER[api.phase] ?? 0;
  if (livePhase !== apiPhase) {
    return livePhase > apiPhase ? live : api;
  }

  if (live.currentFile !== api.currentFile) return live;
  return api;
}

/** Never let a stale API poll replace fresher WebSocket progress. */
export function mergeLiveWithScan(prev: ScanLiveState | undefined, fromApi: ScanLiveState): ScanLiveState {
  if (!prev) return fromApi;
  if (TERMINAL_STATUSES.has(fromApi.status)) return fromApi;
  if (TERMINAL_STATUSES.has(prev.status)) return prev;

  const progress = progressAhead(prev.progress, fromApi.progress);
  const summary = fromApi.summary ?? prev.summary;
  const mergedSummary = progress && summary
    ? {
        ...summary,
        filesScanned: progress.filesScanned,
        filesInRepo: progress.filesInRepo,
        totalFindings: Math.max(summary.totalFindings, progress.findingsCount),
        progress,
      }
    : summary;

  return {
    status: ACTIVE_STATUSES.has(fromApi.status) ? fromApi.status : prev.status,
    progress,
    summary: mergedSummary,
    error: fromApi.error ?? prev.error,
  };
}

export function applyMessage(
  prev: ScanLiveState | undefined,
  message: ScanWsMessage,
): ScanLiveState {
  if (message.type === "progress") {
    const status =
      prev?.status && TERMINAL_STATUSES.has(prev.status) ? prev.status : (prev?.status ?? "running");
    const summary = prev?.summary
      ? {
          ...prev.summary,
          filesScanned: message.progress.filesScanned,
          filesInRepo: message.progress.filesInRepo,
          totalFindings: Math.max(prev.summary.totalFindings, message.progress.findingsCount),
          progress: message.progress,
        }
      : emptySummaryFromProgress(message.progress);

    return {
      status,
      progress: message.progress,
      summary,
      error: prev?.error ?? null,
    };
  }

  if (message.type === "status") {
    const summary = summaryFromRecord(message.summary);
    return {
      status: message.status,
      progress: summary.progress ?? null,
      summary,
      error: summary.error ?? null,
    };
  }

  const summary = summaryFromRecord(message.summary);
  return {
    status: message.status,
    progress: message.progress ?? summary.progress ?? null,
    summary,
    error: summary.error ?? null,
  };
}

export function liveStateFromScan(scan: Scan): ScanLiveState {
  return {
    status: scan.status,
    progress: scan.summary?.progress ?? null,
    summary: scan.summary ?? null,
    error: scan.summary?.error ?? null,
  };
}
