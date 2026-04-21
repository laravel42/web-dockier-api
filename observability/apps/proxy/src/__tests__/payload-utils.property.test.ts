import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { calculatePayloadSize, truncatePayload } from "../payload-utils.js";

/**
 * Property-based tests for payload utilities.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 14.1, 14.2, 14.3**
 */

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Property 7: Payload Truncation Bound
// ---------------------------------------------------------------------------

describe("truncatePayload — Property 7: Payload Truncation Bound", () => {
  const DEFAULT_MAX_BYTES = 50_000;

  /**
   * **Validates: Requirements 9.2**
   *
   * For any string payload whose UTF-8 byte length is at or below maxBytes,
   * truncatePayload returns the original payload unchanged.
   */
  it("returns the original payload when serialized size is at or below maxBytes", () => {
    // Generate strings whose byte length is guaranteed ≤ DEFAULT_MAX_BYTES.
    // ASCII characters are 1 byte each, so limiting length to DEFAULT_MAX_BYTES
    // ensures we stay within the byte budget.
    const smallPayloadArb = fc.string({
      minLength: 0,
      maxLength: DEFAULT_MAX_BYTES,
      unit: "grapheme",
    }).filter((s) => encoder.encode(s).byteLength <= DEFAULT_MAX_BYTES);

    fc.assert(
      fc.property(smallPayloadArb, (payload) => {
        const result = truncatePayload(payload);
        expect(result).toBe(payload);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 9.1**
   *
   * For any string payload exceeding maxBytes, the truncated portion
   * (before the suffix) is at most maxBytes bytes.
   */
  it("truncated portion is at most maxBytes bytes when payload exceeds limit", () => {
    // Generate a maxBytes value, then build a payload guaranteed to exceed it.
    const exceedingPayloadArb = fc
      .integer({ min: 10, max: 500 })
      .chain((maxBytes) =>
        // ASCII chars are 1 byte each, so minLength > maxBytes guarantees exceeding
        fc
          .string({ minLength: maxBytes + 1, maxLength: maxBytes * 3 })
          .map((payload) => ({ maxBytes, payload }))
      );

    fc.assert(
      fc.property(exceedingPayloadArb, ({ maxBytes, payload }) => {
        const serializedSize = encoder.encode(payload).byteLength;
        // Double-check the payload actually exceeds the limit
        fc.pre(serializedSize > maxBytes);

        const result = truncatePayload(payload, maxBytes) as string;

        // Result must contain the truncation indicator
        expect(result).toContain("... [truncated:");
        expect(result).toContain(`${serializedSize} bytes]`);

        // The portion before the suffix must be at most maxBytes bytes
        const truncatedPart = result.split("... [truncated:")[0];
        const truncatedBytes = encoder.encode(truncatedPart).byteLength;
        expect(truncatedBytes).toBeLessThanOrEqual(maxBytes);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 9.3**
   *
   * null and undefined always pass through unchanged.
   */
  it("null and undefined always pass through unchanged", () => {
    expect(truncatePayload(null)).toBeNull();
    expect(truncatePayload(undefined)).toBeUndefined();

    // Also verify with various maxBytes values
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (maxBytes) => {
        expect(truncatePayload(null, maxBytes)).toBeNull();
        expect(truncatePayload(undefined, maxBytes)).toBeUndefined();
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Payload Size Calculation
// ---------------------------------------------------------------------------

describe("calculatePayloadSize — Property 13: Payload Size Calculation", () => {
  /**
   * **Validates: Requirements 14.1**
   *
   * For any string, calculatePayloadSize returns the same value as
   * TextEncoder.encode(str).byteLength.
   */
  it("returns UTF-8 byte length for any string", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 5000 }), (str) => {
        const expected = encoder.encode(str).byteLength;
        expect(calculatePayloadSize(str)).toBe(expected);
      }),
      { numRuns: 300 }
    );
  });

  /**
   * **Validates: Requirements 14.1**
   *
   * For any unicode string (including multi-byte characters),
   * calculatePayloadSize returns the correct UTF-8 byte length.
   */
  it("returns correct UTF-8 byte length for unicode strings", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500, unit: "grapheme-composite" }),
        (str) => {
          const expected = encoder.encode(str).byteLength;
          expect(calculatePayloadSize(str)).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 14.2**
   *
   * For any JSON-serializable object, calculatePayloadSize returns
   * TextEncoder.encode(JSON.stringify(obj)).byteLength.
   */
  it("returns UTF-8 byte length of JSON serialization for objects", () => {
    const jsonObjectArb = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.oneof(
        fc.string({ maxLength: 100 }),
        fc.integer(),
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.boolean(),
        fc.constant(null)
      ),
      { minKeys: 0, maxKeys: 10 }
    );

    fc.assert(
      fc.property(jsonObjectArb, (obj) => {
        const expected = encoder.encode(JSON.stringify(obj)).byteLength;
        expect(calculatePayloadSize(obj)).toBe(expected);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 14.2**
   *
   * For arrays, calculatePayloadSize returns the UTF-8 byte length
   * of the JSON serialization.
   */
  it("returns UTF-8 byte length of JSON serialization for arrays", () => {
    const jsonArrayArb = fc.array(
      fc.oneof(
        fc.string({ maxLength: 50 }),
        fc.integer(),
        fc.boolean(),
        fc.constant(null)
      ),
      { minLength: 0, maxLength: 20 }
    );

    fc.assert(
      fc.property(jsonArrayArb, (arr) => {
        const expected = encoder.encode(JSON.stringify(arr)).byteLength;
        expect(calculatePayloadSize(arr)).toBe(expected);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 14.3**
   *
   * null and undefined always return 0.
   */
  it("returns 0 for null and undefined", () => {
    expect(calculatePayloadSize(null)).toBe(0);
    expect(calculatePayloadSize(undefined)).toBe(0);
  });
});
