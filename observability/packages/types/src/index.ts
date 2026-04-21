// @observability/types - Shared type definitions

/**
 * Log severity level.
 */
export type LogLevel = "log" | "info" | "debug" | "warn" | "error";

/**
 * Origin of a log entry.
 */
export type LogSource = "proxy" | "frontend" | "service";

/**
 * Structured record representing a single log event.
 */
export interface LogEntry {
  /** UUID v4 identifier */
  id: string;
  /** Epoch milliseconds (Date.now()) */
  timestamp: number;
  /** Log severity */
  type: LogLevel;
  /** Origin of the log entry */
  source: LogSource;
  /** Grouping key, defaults to "default" */
  group: string;
  /** Human-readable log message */
  message: string;

  // HTTP-specific fields (optional)
  /** HTTP method (GET, POST, etc.) */
  method?: string;
  /** Request URL path */
  endpoint?: string;
  /** Parsed query parameters */
  query?: Record<string, unknown>;
  /** Request body (truncated if >50kb) */
  body?: unknown;
  /** Response body (truncated if >50kb) */
  response?: unknown;
  /** Sanitized request headers */
  requestHeaders?: Record<string, string>;
  /** Response headers from target */
  responseHeaders?: Record<string, string>;

  // Metrics (optional)
  /** HTTP status code (100-599) */
  status?: number;
  /** Request duration in milliseconds (non-negative) */
  duration?: number;
  /** Body size in bytes (non-negative) */
  payloadSize?: number;

  // Error tracking (optional)
  /** Error message or stack trace */
  error?: string;
}

/**
 * WebSocket message types for log streaming.
 */
export type WebSocketMessage =
  | { type: "log"; payload: LogEntry }
  | { type: "batch"; payload: LogEntry[] }
  | { type: "clear"; payload: null };

/**
 * State of the dashboard filter controls.
 */
export interface FilterState {
  type: LogLevel | null;
  source: LogSource | null;
  endpoint: string;
  text: string;
}

/**
 * Factory function that creates a complete LogEntry with sensible defaults.
 *
 * Auto-generates a UUID v4 `id`, sets `timestamp` to the current epoch ms,
 * and defaults `group` to `"default"`. All defaults can be overridden via
 * the partial input.
 */
export function createLogEntry(
  partial: Partial<LogEntry> & Pick<LogEntry, "type" | "source" | "message">
): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    group: "default",
    ...partial,
  };
}

/**
 * Payload for exporting log entries to Kiro's AI context.
 */
export interface KiroContextPayload {
  entries: LogEntry[];
  metadata: {
    /** Epoch milliseconds when the export was created */
    exportedAt: number;
    /** Number of entries (must equal entries.length) */
    count: number;
    /** Constant identifying the origin system */
    source: "observability";
    /** Active filters at time of export */
    filters?: FilterState;
    /** User-provided annotation (max 500 chars) */
    description?: string;
  };
}
