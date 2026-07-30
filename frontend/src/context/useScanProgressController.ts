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
  const socketsRef = useRef<Map<string, WebSocket>>(new Map());
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const openWebSocketRef = useRef<(scanId: string) => void>(() => {});

  useEffect(() => {
    statesRef.current = states;
  }, [states]);

  const patchLiveState = useCallback((scanId: string, next: ScanLiveState) => {
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
  }, []);

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

  const openWebSocket = useCallback((scanId: string) => {
    if (socketsRef.current.has(scanId)) return;

    const token = getToken();
    if (!token) return;

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

        if (message.type === "status" && !ACTIVE_STATUSES.has(message.status as ScanStatus)) {
          closeSocket(scanId);
        }
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onclose = () => {
      socketsRef.current.delete(scanId);
      void syncFromApi(scanId).then((stillActive) => {
        const localActive = ACTIVE_STATUSES.has(statesRef.current[scanId]?.status ?? "");
        if (!stillActive && !localActive) return;
        if (reconnectTimersRef.current.has(scanId)) return;
        const timer = setTimeout(() => {
          reconnectTimersRef.current.delete(scanId);
          openWebSocketRef.current(scanId);
        }, 3000);
        reconnectTimersRef.current.set(scanId, timer);
      });
    };

    socketsRef.current.set(scanId, ws);
  }, [closeSocket, syncFromApi]);

  useEffect(() => {
    openWebSocketRef.current = openWebSocket;
  }, [openWebSocket]);

  const connect = useCallback(
    (scanId: string) => {
      if (!socketsRef.current.has(scanId)) {
        openWebSocket(scanId);
      }
      void syncFromApi(scanId);
    },
    [openWebSocket, syncFromApi],
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
      closeSocket(scan.id);
    }
  }, [connect, closeSocket]);

  const setOptimisticRunning = useCallback((scanId: string) => {
    patchLiveState(scanId, {
      status: "running",
      progress: { phase: "cloning", filesScanned: 0, filesInRepo: 0, findingsCount: 0 },
      summary: null,
      error: null,
    });
    connect(scanId);
  }, [patchLiveState, connect]);

  const clearScanState = useCallback((scanId: string) => {
    setStates((prev) => {
      if (!(scanId in prev)) return prev;
      const next = { ...prev };
      delete next[scanId];
      return next;
    });
    closeSocket(scanId);
  }, [closeSocket]);

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

  return useMemo(
    () => ({ states, trackScan, seedFromScan, setOptimisticRunning, clearScanState }),
    [states, trackScan, seedFromScan, setOptimisticRunning, clearScanState],
  );
}
