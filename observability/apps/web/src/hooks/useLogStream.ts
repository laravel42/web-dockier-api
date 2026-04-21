import { useState, useEffect, useCallback, useRef } from "react";
import type { LogEntry, WebSocketMessage } from "@observability/types";

const MAX_LOGS = 10_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Hook that connects to the proxy WebSocket and manages the log store.
 *
 * - Populates the store with the initial batch on connection
 * - Appends new log entries on `type: "log"` messages
 * - Trims oldest entries when the store exceeds MAX_LOGS
 * - Supports pause/resume/clear controls
 * - Reconnects with exponential backoff (1s, 2s, 4s, … up to 30s)
 * - Exposes `isConnected` for UI status indicator
 */
export function useLogStream(wsUrl: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const pausedRef = useRef(false);
  const bufferRef = useRef<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) return;
        setIsConnected(true);
        // Reset backoff on successful connection
        backoffRef.current = INITIAL_BACKOFF_MS;
      };

      ws.onmessage = (event) => {
        if (unmountedRef.current) return;

        const msg: WebSocketMessage = JSON.parse(event.data);

        if (pausedRef.current) {
          if (msg.type === "log")
            bufferRef.current.push(msg.payload as LogEntry);
          if (msg.type === "batch")
            bufferRef.current.push(...(msg.payload as LogEntry[]));
          return;
        }

        setLogs((prev) => {
          const newLogs =
            msg.type === "batch"
              ? [...prev, ...(msg.payload as LogEntry[])]
              : [...prev, msg.payload as LogEntry];
          return newLogs.slice(-MAX_LOGS);
        });
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setIsConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (unmountedRef.current) return;
        setIsConnected(false);
        // The browser will fire onclose after onerror, so reconnect is
        // handled there. We just update the status eagerly.
      };
    }

    function scheduleReconnect() {
      if (unmountedRef.current) return;

      const delay = backoffRef.current;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        // Double the backoff for next attempt, capped at MAX_BACKOFF_MS
        backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
        connect();
      }, delay);
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [wsUrl]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setLogs((prev) => [...prev, ...bufferRef.current].slice(-MAX_LOGS));
    bufferRef.current = [];
    setIsPaused(false);
  }, []);

  const clear = useCallback(() => {
    setLogs([]);
    bufferRef.current = [];
  }, []);

  return { logs, isPaused, isConnected, pause, resume, clear };
}
