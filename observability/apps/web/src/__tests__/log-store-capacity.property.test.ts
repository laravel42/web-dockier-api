import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { trimLogStore, DEFAULT_MAX_LOG_STORE_SIZE } from "../utils/log-store.js";
import type { LogEntry, LogLevel, LogSource } from "@observability/types";

/**
 * Property-based tests for Frontend Log Store Capacity
 *
 * **Validates: Requirement 6.5**
 *
 * Property 9: Frontend Log Store Capacity
 * For any sequence of incoming log entries received by the Dashboard,
 * the Log_Store size SHALL remain at or below 10,000 entries. When the
 * store exceeds 10,000 entries, the oldest entries SHALL be trimmed.
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

/** Generates a minimal valid LogEntry with a unique id. */
const logEntryArb: fc.Arbitrary<LogEntry> = fc
  .record({
    id: fc.uuid(),
    timestamp: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    type: logLevelArb,
    source: logSourceArb,
    group: fc.string({ minLength: 1, maxLength: 20 }),
    message: fc.string({ minLength: 1, maxLength: 100 }),
  })
  .map((r) => r as LogEntry);

/** Array of log entries with configurable length. */
const logArrayArb = (maxLen: number) =>
  fc.array(logEntryArb, { minLength: 0, maxLength: maxLen });

/** A reasonable maxSize for property tests (keep small for speed). */
const maxSizeArb = fc.integer({ min: 1, max: 500 });

// --- Property Tests ---

describe("Frontend Log Store — Property 9: Frontend Log Store Capacity", () => {
  it("result length never exceeds maxSize for any combination of current logs and new entries", () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * For any currentLogs and newEntries arrays and any maxSize,
     * trimLogStore SHALL return an array whose length is at most maxSize.
     */
    fc.assert(
      fc.property(
        logArrayArb(300),
        logArrayArb(300),
        maxSizeArb,
        (currentLogs, newEntries, maxSize) => {
          const result = trimLogStore(currentLogs, newEntries, maxSize);
          expect(result.length).toBeLessThanOrEqual(maxSize);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("when total entries exceed maxSize, only the most recent maxSize entries are kept", () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * When currentLogs.length + newEntries.length > maxSize, the result
     * SHALL contain exactly maxSize entries and they SHALL be the last
     * maxSize entries from the concatenation of currentLogs and newEntries.
     */
    fc.assert(
      fc.property(
        logArrayArb(300),
        logArrayArb(300),
        maxSizeArb,
        (currentLogs, newEntries, maxSize) => {
          const combined = [...currentLogs, ...newEntries];
          const result = trimLogStore(currentLogs, newEntries, maxSize);

          if (combined.length > maxSize) {
            // Exactly maxSize entries kept
            expect(result.length).toBe(maxSize);
            // They are the most recent (last) maxSize entries
            const expected = combined.slice(-maxSize);
            expect(result.map((e) => e.id)).toEqual(expected.map((e) => e.id));
          } else {
            // All entries preserved
            expect(result.length).toBe(combined.length);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("preserves insertion order — entries appear in the same relative order as the input", () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * The result of trimLogStore SHALL maintain the same relative ordering
     * as the concatenation of currentLogs followed by newEntries.
     */
    fc.assert(
      fc.property(
        logArrayArb(300),
        logArrayArb(300),
        maxSizeArb,
        (currentLogs, newEntries, maxSize) => {
          const combined = [...currentLogs, ...newEntries];
          const result = trimLogStore(currentLogs, newEntries, maxSize);

          // Every entry in result should appear in combined in the same order
          let combinedIdx = 0;
          for (const entry of result) {
            while (
              combinedIdx < combined.length &&
              combined[combinedIdx].id !== entry.id
            ) {
              combinedIdx++;
            }
            // Must have found the entry
            expect(combinedIdx).toBeLessThan(combined.length);
            combinedIdx++;
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("capacity invariant holds with the default 10,000 limit", () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * Using the default maxSize of 10,000, simulating multiple batches
     * of incoming entries SHALL never produce a store exceeding 10,000.
     */
    fc.assert(
      fc.property(
        fc.array(logArrayArb(200), { minLength: 1, maxLength: 20 }),
        (batches) => {
          let store: LogEntry[] = [];
          for (const batch of batches) {
            store = trimLogStore(store, batch, DEFAULT_MAX_LOG_STORE_SIZE);
            expect(store.length).toBeLessThanOrEqual(DEFAULT_MAX_LOG_STORE_SIZE);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
