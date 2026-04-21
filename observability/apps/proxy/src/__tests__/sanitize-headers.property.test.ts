import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { sanitizeHeaders } from "../sanitize-headers.js";

/**
 * Property-based tests for sanitizeHeaders()
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 *
 * Property 6: Header Sanitization Safety
 * For any HTTP headers object containing sensitive header names
 * (authorization, cookie, set-cookie, x-api-key, x-auth-token,
 * proxy-authorization) in any casing, the sanitizeHeaders function SHALL
 * replace their values with "[REDACTED]" and preserve all non-sensitive
 * header values unchanged. Array header values SHALL be joined with ", ".
 * Undefined values SHALL be omitted.
 */

const SENSITIVE_NAMES = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
] as const;

/** Generate a random casing of a string (e.g. "cookie" → "CoOkIe"). */
const randomCasing = (name: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: name.length, maxLength: name.length })
    .map((flags) =>
      name
        .split("")
        .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join("")
    );

/** Arbitrary that picks a sensitive header name in a random casing. */
const sensitiveKeyArb: fc.Arbitrary<string> = fc
  .constantFrom(...SENSITIVE_NAMES)
  .chain((name) => randomCasing(name));

/** Arbitrary for a non-sensitive header name that won't collide with sensitive names. */
const nonSensitiveKeyArb: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,30}$/)
  .filter((k) => !SENSITIVE_NAMES.includes(k.toLowerCase() as (typeof SENSITIVE_NAMES)[number]));

/** Arbitrary for a non-empty header value string. */
const headerValueArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 200 });

describe("sanitizeHeaders — Property 6: Header Sanitization Safety", () => {
  it("sensitive headers are always redacted regardless of casing", () => {
    fc.assert(
      fc.property(
        sensitiveKeyArb,
        headerValueArb,
        (key, value) => {
          const result = sanitizeHeaders({ [key]: value });
          expect(result[key]).toBe("[REDACTED]");
        }
      ),
      { numRuns: 200 }
    );
  });

  it("non-sensitive headers are preserved unchanged", () => {
    fc.assert(
      fc.property(
        nonSensitiveKeyArb,
        headerValueArb,
        (key, value) => {
          const result = sanitizeHeaders({ [key]: value });
          expect(result[key]).toBe(value);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("array values are joined with ', '", () => {
    const arrayValueArb = fc.array(headerValueArb, { minLength: 1, maxLength: 5 });

    fc.assert(
      fc.property(
        nonSensitiveKeyArb,
        arrayValueArb,
        (key, values) => {
          const result = sanitizeHeaders({ [key]: values });
          expect(result[key]).toBe(values.join(", "));
        }
      ),
      { numRuns: 200 }
    );
  });

  it("undefined values are omitted from output", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (key) => {
          const result = sanitizeHeaders({ [key]: undefined });
          expect(Object.hasOwn(result, key)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("output never contains raw sensitive values", () => {
    // Build a mixed headers object with both sensitive and non-sensitive keys
    const sensitiveEntryArb = fc.tuple(sensitiveKeyArb, headerValueArb);
    const nonSensitiveEntryArb = fc.tuple(nonSensitiveKeyArb, headerValueArb);

    const headersArb = fc
      .tuple(
        fc.array(sensitiveEntryArb, { minLength: 1, maxLength: 4 }),
        fc.array(nonSensitiveEntryArb, { minLength: 0, maxLength: 4 })
      )
      .map(([sensitive, nonSensitive]) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of sensitive) headers[k] = v;
        for (const [k, v] of nonSensitive) headers[k] = v;
        return { headers, sensitiveEntries: sensitive };
      });

    fc.assert(
      fc.property(headersArb, ({ headers, sensitiveEntries }) => {
        const result = sanitizeHeaders(headers);
        const outputValues = Object.values(result);

        for (const [key, originalValue] of sensitiveEntries) {
          // The original sensitive value must not appear in any output value
          // (unless the value happens to be "[REDACTED]" itself, which is fine)
          if (originalValue !== "[REDACTED]") {
            for (const outVal of outputValues) {
              // The sensitive value should not be present as-is in any output
              if (outVal === originalValue) {
                // This output value must NOT belong to the sensitive key
                expect(result[key]).toBe("[REDACTED]");
              }
            }
          }
          // The sensitive key's value must always be "[REDACTED]"
          expect(result[key]).toBe("[REDACTED]");
        }
      }),
      { numRuns: 200 }
    );
  });
});
