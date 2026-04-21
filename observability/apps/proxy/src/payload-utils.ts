/**
 * Payload size calculation and truncation utilities for the observability proxy.
 *
 * These functions ensure accurate UTF-8 byte-length measurement and bounded
 * payload storage in log entries.
 */

/** Shared TextEncoder instance — stateless and safe to reuse. */
const encoder = new TextEncoder();

/**
 * Calculates the UTF-8 byte length of a request/response body.
 *
 * - String bodies are encoded directly.
 * - Non-string bodies are JSON-serialized first.
 * - Returns 0 for null or undefined.
 *
 * @param body - The request or response body to measure
 * @returns The byte length of the body in UTF-8 encoding
 *
 * @see Requirements 14.1, 14.2, 14.3
 */
export function calculatePayloadSize(body: unknown): number {
  if (body === undefined || body === null) return 0;
  if (typeof body === "string") return encoder.encode(body).byteLength;
  return encoder.encode(JSON.stringify(body)).byteLength;
}

/**
 * Truncates a payload if its serialized UTF-8 byte length exceeds `maxBytes`.
 *
 * - Payloads at or below the limit are returned unchanged.
 * - Payloads exceeding the limit are serialized (if not already a string),
 *   truncated to `maxBytes` bytes, and a truncation indicator is appended.
 * - null and undefined pass through unchanged.
 *
 * @param payload  - The payload to potentially truncate
 * @param maxBytes - Maximum allowed byte size (default 50,000)
 * @returns The original payload if within bounds, or a truncated string with indicator
 *
 * @see Requirements 9.1, 9.2, 9.3
 */
export function truncatePayload(
  payload: unknown,
  maxBytes: number = 50_000
): unknown {
  if (payload === undefined || payload === null) return payload;

  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload);

  const bytes = encoder.encode(serialized);
  if (bytes.byteLength <= maxBytes) return payload;

  // Decode back from the truncated byte array to get a valid UTF-8 string
  // that is at most maxBytes bytes long. TextDecoder with `fatal: false`
  // (the default) replaces incomplete multi-byte sequences gracefully.
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const truncatedStr = decoder.decode(bytes.slice(0, maxBytes));

  return `${truncatedStr}... [truncated: ${bytes.byteLength} bytes]`;
}
