import type { LogEntry } from "@observability/types";

export interface LogGroup {
  group: string;
  entries: LogEntry[];
}

/**
 * Groups log entries by their `group` field, preserving insertion order.
 * Entries with the same `group` value are collected together.
 */
export function groupLogEntries(logs: LogEntry[]): LogGroup[] {
  const map = new Map<string, LogEntry[]>();

  for (const entry of logs) {
    const key = entry.group;
    const existing = map.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }

  const groups: LogGroup[] = [];
  for (const [group, entries] of map) {
    groups.push({ group, entries });
  }

  return groups;
}
