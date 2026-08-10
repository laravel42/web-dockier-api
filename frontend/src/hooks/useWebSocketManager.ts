import { useCallback, useEffect, useRef } from "react";

/**
 * Options for the WebSocket manager hook.
 */
export interface UseWebSocketManagerOptions<T> {
  /** Build the WebSocket URL for a given connection key. Return null to skip connection. */
  getUrl: (key: string) => string | null;
  /** Called when a message is received. Parsing from raw string is the caller's responsibility. */
  onMessage: (key: string, data: T) => void;
  /** Called when a connection closes. Return true to allow reconnection. */
  shouldReconnect?: (key: string) => boolean;
  /** Called after a connection closes (before reconnect decision). */
  onClose?: (key: string) => void;
  /** Delay in ms before attempting reconnection. Default: 3000 */
  reconnectDelay?: number;
  /** Parse the raw MessageEvent data into the typed message. Default: JSON.parse */
  parse?: (raw: string) => T;
}

/**
 * Manages multiple keyed WebSocket connections with automatic reconnection.
 *
 * Designed for scenarios where several independent WebSocket connections
 * are maintained simultaneously (e.g., one per active scan or deployment).
 *
 * Returns imperative open/close functions. The hook handles:
 * - Deduplication (won't open a second socket for the same key)
 * - Auto-reconnect on unexpected close (gated by shouldReconnect)
 * - Cleanup of all sockets and timers on unmount
 *
 * @example
 * ```ts
 * const { open, close, closeAll } = useWebSocketManager<ScanWsMessage>({
 *   getUrl: (scanId) => getScanWebSocketUrl(scanId, token),
 *   onMessage: (scanId, msg) => dispatch(msg),
 *   shouldReconnect: (scanId) => isStillActive(scanId),
 * });
 * ```
 */
export function useWebSocketManager<T>(options: UseWebSocketManagerOptions<T>) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const socketsRef = useRef<Map<string, WebSocket>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Ref to the latest `open` function so reconnect timers always call the current version
  const openRef = useRef<(key: string) => void>(() => {});

  const close = useCallback((key: string) => {
    const timer = timersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(key);
    }
    const socket = socketsRef.current.get(key);
    if (socket) {
      socket.onclose = null;
      socket.close();
      socketsRef.current.delete(key);
    }
  }, []);

  const open = useCallback((key: string) => {
    if (socketsRef.current.has(key)) return;

    const url = optionsRef.current.getUrl(key);
    if (!url) return;

    const parse = optionsRef.current.parse ?? ((raw: string) => JSON.parse(raw) as T);
    const reconnectDelay = optionsRef.current.reconnectDelay ?? 3000;

    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const message = parse(event.data as string);
        optionsRef.current.onMessage(key, message);
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onclose = () => {
      socketsRef.current.delete(key);
      optionsRef.current.onClose?.(key);

      const shouldReconnect = optionsRef.current.shouldReconnect?.(key) ?? false;
      if (!shouldReconnect) return;
      if (timersRef.current.has(key)) return;

      const timer = setTimeout(() => {
        timersRef.current.delete(key);
        openRef.current(key);
      }, reconnectDelay);
      timersRef.current.set(key, timer);
    };

    socketsRef.current.set(key, ws);
  }, []);

  // Keep openRef pointing at the latest `open`
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const closeAll = useCallback(() => {
    for (const key of socketsRef.current.keys()) {
      close(key);
    }
  }, [close]);

  const isOpen = useCallback((key: string) => {
    return socketsRef.current.has(key);
  }, []);

  // Cleanup all on unmount
  useEffect(() => () => { closeAll(); }, [closeAll]);

  return { open, close, closeAll, isOpen };
}
