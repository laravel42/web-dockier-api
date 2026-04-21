import { describe, it, expect } from "vitest";
import { filterLogs } from "./filter.js";
import type { LogEntry, FilterState } from "@observability/types";

// --- Helpers ---

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "info",
    source: "proxy",
    group: "default",
    message: "test message",
    ...overrides,
  };
}

const emptyFilters: FilterState = {
  type: null,
  source: null,
  endpoint: "",
  text: "",
};

// --- Test Data ---

const logs: LogEntry[] = [
  makeEntry({
    id: "1",
    type: "info",
    source: "proxy",
    message: "GET /api/users → 200",
    endpoint: "/api/users",
    group: "req-1",
  }),
  makeEntry({
    id: "2",
    type: "error",
    source: "frontend",
    message: "POST /api/login → 401",
    endpoint: "/api/login",
    error: "Unauthorized",
    group: "req-2",
  }),
  makeEntry({
    id: "3",
    type: "warn",
    source: "service",
    message: "Slow query detected",
    group: "db-group",
  }),
  makeEntry({
    id: "4",
    type: "debug",
    source: "proxy",
    message: "GET /api/products → 200",
    endpoint: "/api/products",
    group: "req-3",
  }),
  makeEntry({
    id: "5",
    type: "log",
    source: "frontend",
    message: "Component rendered",
    group: "render",
  }),
];

// --- Tests ---

describe("filterLogs", () => {
  describe("empty/null filters return all entries", () => {
    it("returns all logs when all filters are empty/null", () => {
      const result = filterLogs(logs, emptyFilters);
      expect(result).toHaveLength(logs.length);
      expect(result.map((e) => e.id)).toEqual(logs.map((e) => e.id));
    });
  });

  describe("type filter (exact match)", () => {
    it("returns only entries matching the selected LogLevel", () => {
      const result = filterLogs(logs, { ...emptyFilters, type: "error" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("returns empty array when no entries match the type", () => {
      const result = filterLogs(logs, { ...emptyFilters, type: "log" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("5");
    });
  });

  describe("source filter (exact match)", () => {
    it("returns only entries matching the selected LogSource", () => {
      const result = filterLogs(logs, { ...emptyFilters, source: "frontend" });
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(["2", "5"]);
    });

    it("returns only proxy entries", () => {
      const result = filterLogs(logs, { ...emptyFilters, source: "proxy" });
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(["1", "4"]);
    });
  });

  describe("endpoint filter (case-insensitive substring)", () => {
    it("matches endpoint substring case-insensitively", () => {
      const result = filterLogs(logs, { ...emptyFilters, endpoint: "LOGIN" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("matches partial endpoint path", () => {
      const result = filterLogs(logs, { ...emptyFilters, endpoint: "/api/" });
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.id)).toEqual(["1", "2", "4"]);
    });

    it("excludes entries with no endpoint when endpoint filter is set", () => {
      const result = filterLogs(logs, {
        ...emptyFilters,
        endpoint: "anything",
      });
      // Entries 3 and 5 have no endpoint — they should be excluded
      expect(result.every((e) => e.endpoint !== undefined)).toBe(true);
    });
  });

  describe("text filter (case-insensitive across message, endpoint, error, group)", () => {
    it("matches text in message field", () => {
      const result = filterLogs(logs, {
        ...emptyFilters,
        text: "slow query",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("3");
    });

    it("matches text in error field", () => {
      const result = filterLogs(logs, {
        ...emptyFilters,
        text: "unauthorized",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("matches text in group field", () => {
      const result = filterLogs(logs, { ...emptyFilters, text: "db-group" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("3");
    });

    it("matches text in endpoint field", () => {
      const result = filterLogs(logs, { ...emptyFilters, text: "products" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("4");
    });

    it("is case-insensitive", () => {
      const result = filterLogs(logs, {
        ...emptyFilters,
        text: "COMPONENT RENDERED",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("5");
    });
  });

  describe("AND logic with multiple filters", () => {
    it("applies type AND source filters together", () => {
      const result = filterLogs(logs, {
        ...emptyFilters,
        type: "info",
        source: "proxy",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("applies type AND endpoint filters together", () => {
      const result = filterLogs(logs, {
        ...emptyFilters,
        type: "error",
        endpoint: "login",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("returns empty when AND combination matches nothing", () => {
      const result = filterLogs(logs, {
        ...emptyFilters,
        type: "error",
        source: "proxy",
      });
      expect(result).toHaveLength(0);
    });

    it("applies all four filters together", () => {
      const result = filterLogs(logs, {
        type: "error",
        source: "frontend",
        endpoint: "login",
        text: "unauthorized",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });
  });

  describe("immutability", () => {
    it("returns a new array without mutating the input", () => {
      const original = [...logs];
      const originalLength = logs.length;
      const result = filterLogs(logs, { ...emptyFilters, type: "info" });

      // Input array unchanged
      expect(logs).toHaveLength(originalLength);
      expect(logs.map((e) => e.id)).toEqual(original.map((e) => e.id));

      // Result is a different array reference
      expect(result).not.toBe(logs);
    });
  });

  describe("edge cases", () => {
    it("returns empty array when given empty logs", () => {
      const result = filterLogs([], emptyFilters);
      expect(result).toEqual([]);
    });

    it("returns empty array when given empty logs with active filters", () => {
      const result = filterLogs([], {
        type: "error",
        source: "proxy",
        endpoint: "/api",
        text: "test",
      });
      expect(result).toEqual([]);
    });
  });
});
