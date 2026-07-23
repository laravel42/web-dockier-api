/**
 * Shared timestamp utilities.
 *
 * Centralizes the date formatting patterns used across deploy pipelines,
 * logging, and database operations.
 */

/**
 * Human-readable log timestamp: "YYYY-MM-DD HH:MM:SS"
 *
 * Used in deploy logs, build logs, and structured log lines
 * that are persisted to the database and shown in the UI.
 */
export function logTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Full ISO 8601 timestamp for database columns.
 *
 * e.g. "2025-06-23T14:30:00.000Z"
 */
export function nowIso(): string {
  return new Date().toISOString();
}
