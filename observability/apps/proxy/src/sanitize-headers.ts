/**
 * Header sanitization for the observability proxy.
 *
 * Redacts sensitive header values to prevent credentials from being
 * exposed in log entries displayed on the dashboard.
 */

/** Headers whose values must be replaced with "[REDACTED]". */
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

/**
 * Sanitizes HTTP headers for safe inclusion in log entries.
 *
 * - Sensitive headers are replaced with `"[REDACTED]"`
 * - Header name matching is case-insensitive
 * - Array values are joined with `", "`
 * - Headers with `undefined` values are omitted
 *
 * @param headers - Raw HTTP headers (values may be string, string[], or undefined)
 * @returns A new object with all values as strings, sensitive ones redacted
 */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;

    const normalizedKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = Array.isArray(value) ? value.join(", ") : value;
    }
  }

  return sanitized;
}
