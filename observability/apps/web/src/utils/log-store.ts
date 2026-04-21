import type { LogEntry } from "@observability/types";

/**
 * Maximum number of log entries the frontend store should hold.
 */
export const DEFAULT_MAX_LOG_STORE_SIZE = 10_000;

/**
 * Pure function that concatenates current logs with new entries and trims
 * to the most recent `maxSize` entries when the total exceeds the limit.
 *
 * This encapsulates the core trimming logic used by the `useLogStream` hook
 * so it can be tested independently of React state and WebSocket concerns.
 *
 * @param currentLogs - The existing log entries in the store
 * @param newEntries  - New log entries to append
 * @param maxSize     - Maximum store capacity (defaults to 10,000)
 * @returns The combined array, trimmed to the last `maxSize` entries if needed
 */
export function trimLogStore(
  currentLogs: LogEntry[],
  newEntries: LogEntry[],
  maxSize: number = DEFAULT_MAX_LOG_STORE_SIZE
): LogEntry[] {
  const combined = [...currentLogs, ...newEntries];
  if (combined.length <= maxSize) {
    return combined;
  }
  return combined.slice(-maxSize);
}
