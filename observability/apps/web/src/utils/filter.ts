import type { LogEntry, FilterState } from "@observability/types";

/**
 * Pure filter function that returns the subset of log entries matching
 * all active filters using AND logic.
 *
 * - `type`: exact match against LogLevel (null = disabled)
 * - `source`: exact match against LogSource (null = disabled)
 * - `endpoint`: case-insensitive substring match ("" = disabled)
 * - `text`: case-insensitive search across message, endpoint, error, group ("" = disabled)
 *
 * Returns a new array — the input is never mutated.
 */
export function filterLogs(
  logs: LogEntry[],
  filters: FilterState
): LogEntry[] {
  return logs.filter((entry) => {
    // Filter by log level type (exact match)
    if (filters.type !== null && entry.type !== filters.type) {
      return false;
    }

    // Filter by source (exact match)
    if (filters.source !== null && entry.source !== filters.source) {
      return false;
    }

    // Filter by endpoint (case-insensitive substring match)
    if (filters.endpoint !== "") {
      if (!entry.endpoint) {
        // Entry has no endpoint — cannot match the endpoint filter
        return false;
      }
      if (
        !entry.endpoint.toLowerCase().includes(filters.endpoint.toLowerCase())
      ) {
        return false;
      }
    }

    // Filter by text search (case-insensitive across message, endpoint, error, group)
    if (filters.text !== "") {
      const searchText = filters.text.toLowerCase();
      const searchable = [
        entry.message,
        entry.endpoint ?? "",
        entry.error ?? "",
        entry.group,
      ]
        .join(" ")
        .toLowerCase();

      if (!searchable.includes(searchText)) {
        return false;
      }
    }

    return true;
  });
}
