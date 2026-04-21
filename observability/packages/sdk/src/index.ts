// @observability/sdk - Frontend instrumentation SDK

import { createLogEntry, type LogLevel, type LogEntry } from "@observability/types";

/**
 * SDK configuration options.
 */
export interface SDKConfig {
  /** WebSocket URL for the proxy log endpoint */
  wsUrl: string;
  /** Whether to intercept fetch and XHR calls */
  captureNetwork: boolean;
  /** Maximum payload size in bytes before truncation */
  maxPayloadSize: number;
}

/**
 * Public interface for the observability SDK.
 */
export interface ObservabilitySDK {
  init(config?: Partial<SDKConfig>): void;
  destroy(): void;
  log(level: LogLevel, message: string, data?: unknown): void;
}

/** Header used to mark SDK's own traffic and prevent infinite logging loops. */
const SDK_MARKER = "X-Observability-SDK";

const DEFAULT_CONFIG: SDKConfig = {
  wsUrl: "ws://localhost:3000/logs",
  captureNetwork: true,
  maxPayloadSize: 50_000,
};

/**
 * Sends a log entry to the proxy via WebSocket. Falls back to HTTP POST
 * if the WebSocket is not open.
 */
function sendEntry(entry: LogEntry, ws: WebSocket | null, config: SDKConfig): void {
  const message = JSON.stringify(entry);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(message);
    return;
  }

  // HTTP fallback — fire-and-forget, marked with SDK header to avoid self-logging
  try {
    const originalFetch = (globalThis as Record<string, unknown>).__observability_original_fetch__ as typeof fetch | undefined;
    const fetchFn = originalFetch ?? fetch;
    fetchFn(config.wsUrl.replace(/^ws/, "http"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SDK_MARKER]: "1",
      },
      body: message,
    }).catch(() => {
      // Silently ignore — observability should never break the app
    });
  } catch {
    // Silently ignore
  }
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps `globalThis.fetch` to intercept all fetch calls and create log entries.
 * Requests marked with the `X-Observability-SDK` header are passed through
 * without logging to prevent infinite loops.
 */
export function wrapFetch(
  sdk: ObservabilitySDK,
  originalFetch: typeof fetch,
): typeof fetch {
  return async function wrappedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // Guard: skip logging SDK's own traffic
    if (init?.headers) {
      // Handle plain object headers
      if (
        typeof init.headers === "object" &&
        !Array.isArray(init.headers) &&
        !(init.headers instanceof Headers)
      ) {
        if ((init.headers as Record<string, string>)[SDK_MARKER]) {
          return originalFetch(input, init);
        }
      }
      // Handle Headers instance
      if (init.headers instanceof Headers && init.headers.has(SDK_MARKER)) {
        return originalFetch(input, init);
      }
      // Handle array-of-tuples headers
      if (Array.isArray(init.headers)) {
        const found = init.headers.some(
          ([key]) => key === SDK_MARKER,
        );
        if (found) return originalFetch(input, init);
      }
    }

    const startTime = Date.now();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const method = init?.method ?? "GET";

    let response: Response;
    try {
      response = await originalFetch(input, init);
    } catch (err) {
      // Network error
      const errorEntry = createLogEntry({
        type: "error",
        source: "frontend",
        message: `${method} ${url} — Network Error`,
        method,
        endpoint: url,
        error: (err as Error).message,
        duration: Date.now() - startTime,
      });
      sdk.log("error", errorEntry.message, errorEntry);
      throw err; // Re-throw so app behavior is unchanged
    }

    const duration = Date.now() - startTime;
    const logType: LogLevel = response.ok ? "info" : "warn";
    const logEntry = createLogEntry({
      type: logType,
      source: "frontend",
      message: `${method} ${url} → ${response.status} (${duration}ms)`,
      method,
      endpoint: url,
      status: response.status,
      duration,
    });
    sdk.log(logType, logEntry.message, logEntry);

    return response;
  };
}

// ---------------------------------------------------------------------------
// XHR wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps `XMLHttpRequest.prototype.open` and `.send` to intercept all XHR calls
 * and create log entries. Requests marked with the `X-Observability-SDK` header
 * are skipped.
 */
export function wrapXHR(
  sdk: ObservabilitySDK,
  OriginalXHR: typeof XMLHttpRequest,
): void {
  const originalOpen = OriginalXHR.prototype.open;
  const originalSend = OriginalXHR.prototype.send;
  const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

  OriginalXHR.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    // Store metadata on the instance for later use in send()
    (this as XMLHttpRequest & { __obs_method?: string; __obs_url?: string; __obs_skip?: boolean }).__obs_method = method;
    (this as XMLHttpRequest & { __obs_url?: string }).__obs_url =
      typeof url === "string" ? url : url.toString();
    return originalOpen.apply(this, [method, url, ...rest] as Parameters<typeof originalOpen>);
  };

  OriginalXHR.prototype.setRequestHeader = function (name: string, value: string) {
    if (name === SDK_MARKER) {
      (this as XMLHttpRequest & { __obs_skip?: boolean }).__obs_skip = true;
    }
    return originalSetRequestHeader.call(this, name, value);
  };

  OriginalXHR.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as XMLHttpRequest & {
      __obs_method?: string;
      __obs_url?: string;
      __obs_skip?: boolean;
    };

    // Skip SDK's own traffic
    if (xhr.__obs_skip) {
      return originalSend.call(this, body);
    }

    const method = xhr.__obs_method ?? "GET";
    const url = xhr.__obs_url ?? "";
    const startTime = Date.now();

    const onLoadEnd = () => {
      const duration = Date.now() - startTime;
      const status = this.status;

      if (status === 0) {
        // Network error (status 0 means the request failed entirely)
        const errorEntry = createLogEntry({
          type: "error",
          source: "frontend",
          message: `${method} ${url} — Network Error`,
          method,
          endpoint: url,
          error: "XHR request failed",
          duration,
        });
        sdk.log("error", errorEntry.message, errorEntry);
      } else {
        const logType: LogLevel = status >= 200 && status < 400 ? "info" : "warn";
        const logEntry = createLogEntry({
          type: logType,
          source: "frontend",
          message: `${method} ${url} → ${status} (${duration}ms)`,
          method,
          endpoint: url,
          status,
          duration,
        });
        sdk.log(logType, logEntry.message, logEntry);
      }

      this.removeEventListener("loadend", onLoadEnd);
    };

    this.addEventListener("loadend", onLoadEnd);
    return originalSend.call(this, body);
  };
}

// ---------------------------------------------------------------------------
// initLogger — main entry point
// ---------------------------------------------------------------------------

/**
 * Initializes the observability SDK. Wraps `fetch` and `XMLHttpRequest` to
 * intercept network calls and send structured log entries to the proxy via
 * WebSocket.
 *
 * @returns An `ObservabilitySDK` instance with `init`, `destroy`, and `log` methods.
 */
export function initLogger(config?: Partial<SDKConfig>): ObservabilitySDK {
  const resolvedConfig: SDKConfig = { ...DEFAULT_CONFIG, ...config };

  // Store originals for restoration in destroy()
  const originalFetch = globalThis.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  // Expose original fetch for the HTTP fallback in sendEntry()
  (globalThis as Record<string, unknown>).__observability_original_fetch__ = originalFetch;

  let ws: WebSocket | null = null;

  // Connect WebSocket
  try {
    ws = new WebSocket(resolvedConfig.wsUrl);
    ws.onerror = () => {
      // Silently handle — observability should never break the app
    };
  } catch {
    // WebSocket not available or URL invalid — will use HTTP fallback
  }

  const sdk: ObservabilitySDK = {
    init(overrideConfig?: Partial<SDKConfig>) {
      if (overrideConfig) {
        Object.assign(resolvedConfig, overrideConfig);
      }
    },

    destroy() {
      // Restore original functions
      globalThis.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
      XMLHttpRequest.prototype.setRequestHeader = originalXHRSetRequestHeader;
      delete (globalThis as Record<string, unknown>).__observability_original_fetch__;

      // Close WebSocket
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    log(level: LogLevel, message: string, data?: unknown) {
      const entry =
        data && typeof data === "object" && "id" in data && "source" in data
          ? (data as LogEntry)
          : createLogEntry({
              type: level,
              source: "frontend",
              message,
            });
      sendEntry(entry, ws, resolvedConfig);
    },
  };

  // Wrap fetch and XHR if captureNetwork is enabled
  if (resolvedConfig.captureNetwork) {
    globalThis.fetch = wrapFetch(sdk, originalFetch);
    wrapXHR(sdk, XMLHttpRequest);
  }

  return sdk;
}
