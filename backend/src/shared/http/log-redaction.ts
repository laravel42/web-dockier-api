/**
 * Log Redaction
 *
 * Request logs are the easiest place to leak a credential: pino's default
 * `req` serializer writes the full URL, and the scan WebSocket route carries
 * its JWT as a `?token=` query param
 * (services/code-analysis/routes/websocket.ts). Auth headers are just as bad
 * once request logging is turned up.
 *
 * This module keeps both fixes in one testable place: a redact path list for
 * the headers and a `req` serializer that masks the token query param. It is
 * applied to BOTH logger configurations — the Fastify request logger in
 * app.ts and the standalone worker logger in shared/logger.ts.
 */

/**
 * pino `redact.paths` for request headers that carry credentials.
 *
 * Hyphenated keys need pino's bracket-quote syntax.
 */
export const LOG_REDACT_PATHS: string[] = [
  "req.headers.authorization",
  'req.headers["x-api-key"]',
  'req.headers["x-internal-token"]',
  'req.headers["x-webhook-signature"]',
  "req.headers.cookie",
];

/** The value written in place of a redacted credential. */
export const LOG_CENSOR = "REDACTED";

/**
 * Replace the value of every `token` query param with `REDACTED`, keeping the
 * key so the shape of the logged URL is still recognisable.
 *
 * Never throws: a serializer that throws takes down logging entirely, so
 * malformed input is returned unchanged (or trimmed to its path prefix).
 */
export function maskTokenInUrl(url: string): string {
  if (typeof url !== "string" || url === "") return url;

  const queryStart = url.indexOf("?");
  if (queryStart === -1) return url;

  try {
    const parsed = new URL(url, "http://localhost");
    if (!parsed.searchParams.has("token")) return url;

    // set() collapses repeats into a single entry, which would silently drop
    // the extra params — rewrite each occurrence instead.
    const masked = new URLSearchParams();
    for (const [key, value] of parsed.searchParams) {
      masked.append(key, key === "token" ? LOG_CENSOR : value);
    }

    return `${url.slice(0, queryStart)}?${masked.toString()}`;
  } catch {
    // Unparseable query — drop it rather than risk logging a raw token.
    return url.slice(0, queryStart);
  }
}

/**
 * The subset of pino's default request log fields this serializer emits.
 *
 * The index signature is required: pino's `serializers.req` type expects a
 * record, and without it Fastify's logger-options overload fails to match.
 */
export interface SerializedRequest {
  [key: string]: unknown;
  method?: string;
  url?: string;
  host?: string;
  remoteAddress?: string;
  remotePort?: number;
}

/** The shape the serializer reads — kept loose because pino calls it with raw objects. */
interface SerializableRequest {
  method?: string;
  url?: string;
  host?: string;
  hostname?: string;
  headers?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string; remotePort?: number };
}

/**
 * pino `serializers.req` replacement that preserves the fields Fastify's
 * default serializer emits, with the URL run through `maskTokenInUrl`.
 *
 * Wrapped defensively: any unexpected request shape degrades to an empty
 * record rather than breaking every log line.
 */
export function redactedReqSerializer(req: unknown): SerializedRequest {
  try {
    const request = (req ?? {}) as SerializableRequest;
    const url = typeof request.url === "string" ? maskTokenInUrl(request.url) : undefined;

    return {
      method: request.method,
      url,
      host: request.host ?? request.hostname ?? (request.headers?.host as string | undefined),
      remoteAddress: request.ip ?? request.socket?.remoteAddress,
      remotePort: request.socket?.remotePort,
    };
  } catch {
    return {};
  }
}
