import type { FastifyRequest, FastifyReply, RouteHandlerMethod } from "fastify";
import type { LogEntry } from "@observability/types";
import { createLogEntry } from "@observability/types";
import { sanitizeHeaders } from "./sanitize-headers.js";
import { calculatePayloadSize, truncatePayload } from "./payload-utils.js";

/**
 * Options for the proxy handler.
 */
export interface ProxyHandlerOptions {
  /** Called with each LogEntry created during a request/response cycle. */
  onLogEntry?: (entry: LogEntry) => void;
}

/**
 * Creates a catch-all proxy route handler that forwards requests to the target URL.
 *
 * Captures request/response metadata and creates a LogEntry with `source: "proxy"`
 * for each request/response cycle. Header sanitization ensures sensitive values
 * (authorization, cookies, etc.) are redacted before inclusion in log entries.
 *
 * On target unreachable, returns HTTP 502 and broadcasts an error LogEntry.
 */
export function createProxyHandler(
  targetUrl: string,
  options?: ProxyHandlerOptions
): RouteHandlerMethod {
  const onLogEntry = options?.onLogEntry;

  return async function proxyHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();

    // Build the target URL from the original request
    const url = new URL(request.url, targetUrl);

    // Capture request metadata
    const method = request.method;
    const endpoint = request.url;
    const query = request.query as Record<string, unknown>;
    const sanitizedHeaders = sanitizeHeaders(request.headers);

    // Prepare headers — copy from incoming request, remove host header
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (value === undefined) continue;
      // Skip hop-by-hop headers that shouldn't be forwarded
      if (key.toLowerCase() === "host") continue;
      if (key.toLowerCase() === "connection") continue;
      headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }

    // Prepare body — only send body for methods that support it
    let body: string | undefined;
    if (
      request.body !== undefined &&
      request.body !== null
    ) {
      body =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);
    }

    const payloadSize = calculatePayloadSize(request.body);

    let targetResponse: Response;
    try {
      targetResponse = await fetch(url.toString(), {
        method: request.method,
        headers,
        body,
      });
    } catch (err) {
      // Target unreachable — return 502 Bad Gateway
      const duration = Date.now() - startTime;

      const errorEntry = createLogEntry({
        type: "error",
        source: "proxy",
        message: `Proxy error: ${(err as Error).message}`,
        method,
        endpoint,
        error: (err as Error).stack ?? (err as Error).message,
        duration,
      });

      onLogEntry?.(errorEntry);

      request.log.error(
        { err, duration },
        `Proxy error: target unreachable at ${url.toString()}`
      );
      return reply.status(502).send({
        error: "Bad Gateway",
        message: `Target server at ${targetUrl} is unreachable`,
      });
    }

    const duration = Date.now() - startTime;

    // Read the response body
    const responseBody = await targetResponse.text();
    const status = targetResponse.status;

    // Capture response headers for the log entry
    const respHeaders: Record<string, string> = {};
    targetResponse.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    // Create and broadcast log entry
    const logEntry = createLogEntry({
      type: status >= 400 ? "error" : "info",
      source: "proxy",
      message: `${method} ${endpoint} → ${status} (${duration}ms)`,
      method,
      endpoint,
      query,
      body: truncatePayload(request.body),
      response: truncatePayload(responseBody),
      requestHeaders: sanitizedHeaders,
      responseHeaders: respHeaders,
      status,
      duration,
      payloadSize,
    });

    onLogEntry?.(logEntry);

    // Copy response headers from target (skip hop-by-hop for forwarding)
    const forwardHeaders: Record<string, string> = {};
    targetResponse.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (
        lower === "transfer-encoding" ||
        lower === "connection" ||
        lower === "keep-alive"
      ) {
        return;
      }
      forwardHeaders[key] = value;
    });

    request.log.info(
      { method, url: request.url, status, duration },
      `${method} ${request.url} → ${status} (${duration}ms)`
    );

    // Return the proxied response
    reply.status(status).headers(forwardHeaders).send(responseBody);
  };
}
