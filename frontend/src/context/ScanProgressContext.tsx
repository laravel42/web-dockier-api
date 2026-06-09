import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchScanSnapshot } from "../services/scan-sync";
import { getScanWebSocketUrl, type ScanWsMessage } from "../services/scan-websocket";
import type { Scan, ScanProgress, ScanSummary } from "../types";

export interface ScanLiveState {
  status: string;
  progress: ScanProgress | null;
  summary: ScanSummary | null;
  error: string | null;
}

interface ScanProgressContextValue {
  getLiveState: (scanId: string) => ScanLiveState | undefined;
  trackScan: (scanId: string) => void;
  seedFromScan: (scan: Scan) => void;
  setOptimisticRunning: (scanId: string) => void;
  clearScanState: (scanId: string) => void;
}

const ScanProgressContext = createContext<ScanProgressContextValue | null>(null);

const ACTIVE_STATUSES = new Set(["pending", "running"]);
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

const POLL_INTERVAL_MS = 12_000;

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

function liveStateEqual(a: ScanLiveState | undefined, b: ScanLiveState): boolean {
  if (!a) return false;
  return (
    a.status === b.status
    && a.error === b.error
    && progressEqual(a.progress, b.progress)
    && summaryEqual(a.summary, b.summary)
  );
}

function applyMessage(
  prev: ScanLiveState | undefined,
  message: ScanWsMessage,
): ScanLiveState {
  if (message.type === "progress") {
    const status =
      prev?.status && TERMINAL_STATUSES.has(prev.status) ? prev.status : (prev?.status ?? "running");
    return {
      status,
      progress: message.progress,
      summary: prev?.summary ?? null,
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

function liveStateFromScan(scan: Scan): ScanLiveState {
  return {
    status: scan.status,
    progress: scan.summary?.progress ?? null,
    summary: scan.summary ?? null,
    error: scan.summary?.error ?? null,
  };
}

export function ScanProgressProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, ScanLiveState>>({});
  const statesRef = useRef(states);
  statesRef.current = states;
  const socketsRef = useRef<Map<string, WebSocket>>(new Map());
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const trackingRef = useRef<Set<string>>(new Set());

  const setLiveState = useCallback((scanId: string, next: ScanLiveState) => {
    setStates((prev) => {
      if (liveStateEqual(prev[scanId], next)) return prev;
      return { ...prev, [scanId]: next };
    });
  }, []);

  const closeSocket = useCallback((scanId: string) => {
    const timer = reconnectTimersRef.current.get(scanId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimersRef.current.delete(scanId);
    }
    const socket = socketsRef.current.get(scanId);
    if (socket) {
      socket.onclose = null;
      socket.close();
      socketsRef.current.delete(scanId);
    }
    trackingRef.current.delete(scanId);
  }, []);

  const syncFromApi = useCallback(async (scanId: string): Promise<boolean> => {
    const scan = await fetchScanSnapshot(scanId);
    if (!scan) {
      return statesRef.current[scanId]
        ? ACTIVE_STATUSES.has(statesRef.current[scanId].status)
        : false;
    }
    const next = liveStateFromScan(scan);
    setLiveState(scanId, next);
    return ACTIVE_STATUSES.has(scan.status);
  }, [setLiveState]);

  const connect = useCallback(
    (scanId: string) => {
      if (socketsRef.current.has(scanId) || trackingRef.current.has(scanId)) return;
      trackingRef.current.add(scanId);

      const token = localStorage.getItem("token");
      if (!token) {
        trackingRef.current.delete(scanId);
        return;
      }

      const openWebSocket = () => {
        if (socketsRef.current.has(scanId)) return;

        const ws = new WebSocket(getScanWebSocketUrl(scanId, token));

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string) as ScanWsMessage;
            if (message.scanId !== scanId) return;
            setStates((prev) => {
              const next = applyMessage(prev[scanId], message);
              if (liveStateEqual(prev[scanId], next)) return prev;
              return { ...prev, [scanId]: next };
            });

            if (message.type === "status" && !ACTIVE_STATUSES.has(message.status)) {
              closeSocket(scanId);
            }
          } catch {
            /* ignore malformed messages */
          }
        };

        ws.onclose = () => {
          socketsRef.current.delete(scanId);
          trackingRef.current.delete(scanId);
          void syncFromApi(scanId).then((stillActive) => {
            if (!stillActive) return;
            if (reconnectTimersRef.current.has(scanId)) return;
            const timer = setTimeout(() => {
              reconnectTimersRef.current.delete(scanId);
              connect(scanId);
            }, 3000);
            reconnectTimersRef.current.set(scanId, timer);
          });
        };

        socketsRef.current.set(scanId, ws);
      };

      void syncFromApi(scanId).then((stillActive) => {
        if (!stillActive) {
          trackingRef.current.delete(scanId);
          return;
        }
        openWebSocket();
      });
    },
    [closeSocket, syncFromApi],
  );

  const trackScan = useCallback(
    (scanId: string) => {
      connect(scanId);
    },
    [connect],
  );

  const seedFromScan = useCallback((scan: Scan) => {
    setLiveState(scan.id, liveStateFromScan(scan));
    if (ACTIVE_STATUSES.has(scan.status)) {
      connect(scan.id);
    } else {
      closeSocket(scan.id);
    }
  }, [setLiveState, connect, closeSocket]);

  const setOptimisticRunning = useCallback((scanId: string) => {
    setLiveState(scanId, {
      status: "running",
      progress: { phase: "cloning", filesScanned: 0, filesInRepo: 0, findingsCount: 0 },
      summary: null,
      error: null,
    });
    connect(scanId);
  }, [setLiveState, connect]);

  const clearScanState = useCallback((scanId: string) => {
    setStates((prev) => {
      if (!(scanId in prev)) return prev;
      const next = { ...prev };
      delete next[scanId];
      return next;
    });
    closeSocket(scanId);
  }, [closeSocket]);

  const getLiveState = useCallback(
    (scanId: string) => states[scanId],
    [states],
  );

  // Stable poll loop — reads active IDs from ref, never restarts on every progress tick.
  useEffect(() => {
    const interval = setInterval(() => {
      for (const [scanId, state] of Object.entries(statesRef.current)) {
        if (ACTIVE_STATUSES.has(state.status)) {
          void syncFromApi(scanId);
        }
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [syncFromApi]);

  useEffect(() => () => {
    for (const scanId of socketsRef.current.keys()) {
      closeSocket(scanId);
    }
  }, [closeSocket]);

  const value = useMemo(
    () => ({ getLiveState, trackScan, seedFromScan, setOptimisticRunning, clearScanState }),
    [getLiveState, trackScan, seedFromScan, setOptimisticRunning, clearScanState],
  );

  return (
    <ScanProgressContext.Provider value={value}>
      {children}
    </ScanProgressContext.Provider>
  );
}

/** Subscribe to live state for a scan — re-renders only when that scan's state changes. */
export function useScanLiveState(scanId: string | undefined): ScanLiveState | undefined {
  const ctx = useContext(ScanProgressContext);
  if (!ctx) {
    throw new Error("useScanLiveState must be used within ScanProgressProvider");
  }
  return scanId ? ctx.getLiveState(scanId) : undefined;
}

export function useScanProgress(): ScanProgressContextValue {
  const ctx = useContext(ScanProgressContext);
  if (!ctx) {
    throw new Error("useScanProgress must be used within ScanProgressProvider");
  }
  return ctx;
}
