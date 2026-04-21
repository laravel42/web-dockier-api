import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createLogEntry, type LogLevel, type LogSource } from "../index.js";

/**
 * Property 10: createLogEntry Factory Correctness
 *
 * Validates: Requirements 3.3, 3.4
 *
 * For any valid combination of type (LogLevel), source (LogSource), and message
 * (non-empty string), calling createLogEntry SHALL return a LogEntry with a valid
 * UUID v4 id, a positive timestamp, and group defaulting to "default". When
 * additional fields are provided, they SHALL appear in the returned LogEntry,
 * overriding defaults.
 */

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const nonEmptyStringArb = fc.string({ minLength: 1 });

describe("Property 10: createLogEntry Factory Correctness", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * Every call returns a valid UUID v4 id.
   */
  it("should return a valid UUID v4 id for any valid input", () => {
    fc.assert(
      fc.property(logLevelArb, logSourceArb, nonEmptyStringArb, (type, source, message) => {
        const entry = createLogEntry({ type, source, message });
        expect(entry.id).toMatch(UUID_V4_REGEX);
      })
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Every call returns a positive timestamp.
   */
  it("should return a positive timestamp for any valid input", () => {
    fc.assert(
      fc.property(logLevelArb, logSourceArb, nonEmptyStringArb, (type, source, message) => {
        const entry = createLogEntry({ type, source, message });
        expect(entry.timestamp).toBeGreaterThan(0);
      })
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Group defaults to "default" when not provided.
   */
  it('should default group to "default" when not provided', () => {
    fc.assert(
      fc.property(logLevelArb, logSourceArb, nonEmptyStringArb, (type, source, message) => {
        const entry = createLogEntry({ type, source, message });
        expect(entry.group).toBe("default");
      })
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Two calls with the same input produce different ids.
   */
  it("should produce different ids for two calls with the same input", () => {
    fc.assert(
      fc.property(logLevelArb, logSourceArb, nonEmptyStringArb, (type, source, message) => {
        const entry1 = createLogEntry({ type, source, message });
        const entry2 = createLogEntry({ type, source, message });
        expect(entry1.id).not.toBe(entry2.id);
      })
    );
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * When additional fields are provided, they override defaults.
   */
  it("should include additional fields and override defaults when provided", () => {
    const httpMethodArb = fc.constantFrom("GET", "POST", "PUT", "DELETE", "PATCH");
    const statusArb = fc.integer({ min: 100, max: 599 });
    const groupArb = fc.string({ minLength: 1 });

    fc.assert(
      fc.property(
        logLevelArb,
        logSourceArb,
        nonEmptyStringArb,
        httpMethodArb,
        statusArb,
        groupArb,
        (type, source, message, method, status, group) => {
          const entry = createLogEntry({ type, source, message, method, status, group });

          // Required fields are preserved
          expect(entry.type).toBe(type);
          expect(entry.source).toBe(source);
          expect(entry.message).toBe(message);

          // Additional fields appear in the result
          expect(entry.method).toBe(method);
          expect(entry.status).toBe(status);

          // Group override takes effect instead of "default"
          expect(entry.group).toBe(group);

          // Auto-generated fields are still valid
          expect(entry.id).toMatch(UUID_V4_REGEX);
          expect(entry.timestamp).toBeGreaterThan(0);
        }
      )
    );
  });
});
