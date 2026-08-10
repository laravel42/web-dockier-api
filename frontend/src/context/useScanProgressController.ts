import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchScanSnapshot } from "../services/scan-sync";
import { getScanWebSocketUrl, type ScanWsMessage } from "../services/scan-websocket";
import { getToken } from "../services/session";
import type { Scan, ScanStatus } from "../types";
import {
  ACTIVE_STATUSES,
  POLL_INTERVAL_MS,
  applyMessage,
  liveStateEqual,
  liveStateFromScan,
  mergeLiveWithScan,
  type ScanLiveState,
} from "./scanProgressState";
import { useWebSocketManager } from "../hooks/useWebSocketManager";

export interface ScanProgressContextValue {
  states: Record<string, ScanLiveState>;
  trackScan: (scanId: string) => void;
  seedFromScan: (scan: Scan) => void;
  setOptimisticRunning: (scanId: string) => void;
  clearScanState: (scanId: string) => void;
}

/**
 * Owns all scan progress state: the per-scan live state map, the WebSocket
 * connections (with reconnect/backoff), and the polling fallback. Returns the
 * value object consumed by `ScanProgressProvider`. Kept as a hook so the
 * provider component stays a thin shell.
 */
export function useScanProgressController(): ScanProgressContextValue {
  const [states, setStates] = useState<Record<string, ScanLiveState>>({});
  const statesRef = useRef(states);

  useEffect(() => {
    statesRef.current = states;
  }, [states]);

  const syncFromApi = useCallback(async (scanId: string): Promise<boolean> => {
    const scan = await fetchScanSnapshot(scanId);
    if (!scan) {
      const local = statesRef.current[scanId];
      return local ? ACTIVE_STATUSES.has(local.status) : false;
    }

    const fromApi = liveStateFromScan(scan);
    setStates((prev) => {
      const merged = mergeLiveWithScan(prev[scanId], fromApi);
      if (liveStateEqual(prev[scanId], merged)) return prev;
      return { ...prev, [scanId]: merged };
    });
    return ACTIVE_STATUSES.has(scan.status);
  }, []);

  // ─── WebSocket Manager ─────────────────────────────────────────

  const { open: openWs, close: closeWs, isOpen: isWsOpen } = useWebSocketManager<ScanWsMessage>({
    getUrl: (scanId) => {
      const token = getToken();
      if (!token) return null;
      return getScanWebSocketUrl(scanId, token);
    },
    onMessage: (scanId, message) => {
      if (message.scanId !== scanId) return;
      setStates((prev) => {
        const next = applyMessage(prev[scanId], message);
        if (liveStateEqual(prev[scanId], next)) return prev;
        return { ...prev, [scanId]: next };
      });

      if (message.type === "status" && !ACTIVE_STATUSES.has(message.status as ScanStatus)) {
        closeWs(scanId);
      }
    },
    onClose: (scanId) => {
      void syncFromApi(scanId);
    },
    shouldReconnect: (scanId) => {
      return ACTIVE_STATUSES.has(statesRef.current[scanId]?.status ?? "");
    },
    reconnectDelay: 3000,
  });

  // ─── Public API ────────────────────────────────────────────────

  const connect = useCallback(
    (scanId: string) => {
      if (!isWsOpen(scanId)) {
        openWs(scanId);
      }
      void syncFromApi(scanId);
    },
    [openWs, isWsOpen, syncFromApi],
  );

  const trackScan = useCallback(
    (scanId: string) => {
      connect(scanId);
    },
    [connect],
  );

  const seedFromScan = useCallback((scan: Scan) => {
    setStates((prev) => {
      const merged = mergeLiveWithScan(prev[scan.id], liveStateFromScan(scan));
      if (liveStateEqual(prev[scan.id], merged)) return prev;
      return { ...prev, [scan.id]: merged };
    });
    if (ACTIVE_STATUSES.has(scan.status)) {
      connect(scan.id);
    } else {
      closeWs(scan.id);
    }
  }, [connect, closeWs]);

  const setOptimisticRunning = useCallback((scanId: string) => {
    setStates((prev) => {
      const next: ScanLiveState = {
        status: "running",
        progress: { phase: "cloning", filesScanned: 0, filesInRepo: 0, findingsCount: 0 },
        summary: null,
        error: null,
      };
      if (liveStateEqual(prev[scanId], next)) return prev;
      return { ...prev, [scanId]: next };
    });
    connect(scanId);
  }, [connect]);

  const clearScanState = useCallback((scanId: string) => {
    setStates((prev) => {
      if (!(scanId in prev)) return prev;
      const next = { ...prev };
      delete next[scanId];
      return next;
    });
    closeWs(scanId);
  }, [closeWs]);

  // ─── Polling Fallback ──────────────────────────────────────────

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

  return useMemo(
    () => ({ states, trackScan, seedFromScan, setOptimisticRunning, clearScanState }),
    [states, trackScan, seedFromScan, setOptimisticRunning, clearScanState],
  );
}
