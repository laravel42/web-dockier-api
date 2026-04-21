import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { filterLogs } from "../utils/filter.js";
import type {
  LogEntry,
  LogLevel,
  LogSource,
  FilterState,
} from "@observability/types";

/**
 * Property-based tests for the Filter Engine
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**
 *
 * Property 3: Filter Correctness (AND Logic Subset)
 * Property 4: Filter Identity
 * Property 5: Filter Purity
 */

// --- Arbitraries ---

const logLevelArb: fc.Arbitrary<LogLevel> = fc.constantFrom(
  "log",
  "info",
  "debug",
  "warn",
  "error"
);

const logSourceArb: fc.Arbitrary<LogSource> = fc.constantFrom(
  "proxy",
  "frontend",
  "service"
);

/** Generates a minimal valid LogEntry with optional HTTP fields. */
const logEntryArb: fc.Arbitrary<LogEntry> = fc
  .record({
    id: fc.uuid(),
    timestamp: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    type: logLevelArb,
    source: logSourceArb,
    group: fc.string({ minLength: 1, maxLength: 30 }),
    message: fc.string({ minLength: 1, maxLength: 100 }),
    endpoint: fc.option(fc.string({ minLength: 1, maxLength: 60 }), {
      nil: undefined,
    }),
    error: fc.option(fc.string({ minLength: 1, maxLength: 60 }), {
      nil: undefined,
    }),
  })
  .map((r) => r as LogEntry);

/** Array of log entries. */
const logArrayArb = fc.array(logEntryArb, { minLength: 0, maxLength: 50 });

/** Generates a random FilterState where each filter may or may not be active. */
const filterStateArb: fc.Arbitrary<FilterState> = fc.record({
  type: fc.option(logLevelArb, { nil: null }),
  source: fc.option(logSourceArb, { nil: null }),
  endpoint: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 20 })),
  text: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 20 })),
});

const emptyFilters: FilterState = {
  type: null,
  source: null,
  endpoint: "",
  text: "",
};

// --- Helpers ---

/**
 * Manually checks whether a single entry matches all active filters.
 * This mirrors the specification logic for independent verification.
 */
function entryMatchesAllFilters(
  entry: LogEntry,
  filters: FilterState
): boolean {
  // Type filter: exact match
  if (filters.type !== null && entry.type !== filters.type) {
    return false;
  }

  // Source filter: exact match
  if (filters.source !== null && entry.source !== filters.source) {
    return false;
  }

  // Endpoint filter: case-insensitive substring
  if (filters.endpoint !== "") {
    if (!entry.endpoint) {
      return false;
    }
    if (
      !entry.endpoint.toLowerCase().includes(filters.endpoint.toLowerCase())
    ) {
      return false;
    }
  }

  // Text filter: case-insensitive across message, endpoint, error, group
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
}

// --- Property 3: Filter Correctness (AND Logic Subset) ---

describe("Filter Engine — Property 3: Filter Correctness (AND Logic Subset)", () => {
  it("every returned entry matches ALL active filters", () => {
    /**
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
     *
     * For any array of LogEntry objects and any combination of active filters,
     * every entry in the result SHALL match all active filters.
     */
    fc.assert(
      fc.property(logArrayArb, filterStateArb, (logs, filters) => {
        const result = filterLogs(logs, filters);

        for (const entry of result) {
          // Type filter check
          if (filters.type !== null) {
            expect(entry.type).toBe(filters.type);
          }

          // Source filter check
          if (filters.source !== null) {
            expect(entry.source).toBe(filters.source);
          }

          // Endpoint filter check
          if (filters.endpoint !== "") {
            expect(entry.endpoint).toBeDefined();
            expect(
              entry.endpoint!.toLowerCase()
            ).toContain(filters.endpoint.toLowerCase());
          }

          // Text filter check
          if (filters.text !== "") {
            const searchable = [
              entry.message,
              entry.endpoint ?? "",
              entry.error ?? "",
              entry.group,
            ]
              .join(" ")
              .toLowerCase();
            expect(searchable).toContain(filters.text.toLowerCase());
          }
        }
      }),
      { numRuns: 300 }
    );
  });

  it("result is always a subset of the input array", () => {
    /**
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
     *
     * The filtered result SHALL only contain entries that exist in the
     * original input array (by reference).
     */
    fc.assert(
      fc.property(logArrayArb, filterStateArb, (logs, filters) => {
        const result = filterLogs(logs, filters);

        expect(result.length).toBeLessThanOrEqual(logs.length);

        for (const entry of result) {
          expect(logs).toContain(entry);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("no matching entry from the input is excluded from the result", () => {
    /**
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
     *
     * Every entry in the input that matches all active filters SHALL
     * appear in the result (completeness).
     */
    fc.assert(
      fc.property(logArrayArb, filterStateArb, (logs, filters) => {
        const result = filterLogs(logs, filters);
        const resultIds = new Set(result.map((e) => e.id));

        for (const entry of logs) {
          if (entryMatchesAllFilters(entry, filters)) {
            expect(resultIds.has(entry.id)).toBe(true);
          }
        }
      }),
      { numRuns: 300 }
    );
  });
});

// --- Property 4: Filter Identity ---

describe("Filter Engine — Property 4: Filter Identity", () => {
  it("empty/null filters return the complete array unchanged", () => {
    /**
     * **Validates: Requirement 8.6**
     *
     * For any array of LogEntry objects, applying empty/null filters
     * (type: null, source: null, endpoint: "", text: "") SHALL return
     * the complete array unchanged.
     */
    fc.assert(
      fc.property(logArrayArb, (logs) => {
        const result = filterLogs(logs, emptyFilters);

        expect(result.length).toBe(logs.length);
        expect(result.map((e) => e.id)).toEqual(logs.map((e) => e.id));
      }),
      { numRuns: 300 }
    );
  });

  it("each entry in the result is the same object reference as in the input", () => {
    /**
     * **Validates: Requirement 8.6**
     *
     * With empty filters, each element in the result SHALL be the same
     * object reference as the corresponding element in the input.
     */
    fc.assert(
      fc.property(logArrayArb, (logs) => {
        const result = filterLogs(logs, emptyFilters);

        for (let i = 0; i < logs.length; i++) {
          expect(result[i]).toBe(logs[i]);
        }
      }),
      { numRuns: 200 }
    );
  });
});

// --- Property 5: Filter Purity ---

describe("Filter Engine — Property 5: Filter Purity", () => {
  it("the original input array is not mutated", () => {
    /**
     * **Validates: Requirement 8.7**
     *
     * For any array of LogEntry objects and any filter state, calling
     * filterLogs SHALL not mutate the original input array.
     */
    fc.assert(
      fc.property(logArrayArb, filterStateArb, (logs, filters) => {
        // Snapshot the original ids and length
        const originalIds = logs.map((e) => e.id);
        const originalLength = logs.length;

        filterLogs(logs, filters);

        expect(logs.length).toBe(originalLength);
        expect(logs.map((e) => e.id)).toEqual(originalIds);
      }),
      { numRuns: 300 }
    );
  });

  it("the result is a different array reference than the input", () => {
    /**
     * **Validates: Requirement 8.7**
     *
     * filterLogs SHALL return a new array, not the same reference as
     * the input array.
     */
    fc.assert(
      fc.property(logArrayArb, filterStateArb, (logs, filters) => {
        const result = filterLogs(logs, filters);

        expect(result).not.toBe(logs);
      }),
      { numRuns: 300 }
    );
  });
});
