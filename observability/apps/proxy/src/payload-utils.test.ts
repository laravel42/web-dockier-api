import { describe, it, expect } from "vitest";
import { calculatePayloadSize, truncatePayload } from "./payload-utils.js";

/**
 * Unit tests for payload utilities.
 * Validates Requirements 9.1, 9.2, 9.3, 14.1, 14.2, 14.3
 */

describe("calculatePayloadSize", () => {
  describe("null/undefined bodies (Requirement 14.3)", () => {
    it("returns 0 for null", () => {
      expect(calculatePayloadSize(null)).toBe(0);
    });

    it("returns 0 for undefined", () => {
      expect(calculatePayloadSize(undefined)).toBe(0);
    });
  });

  describe("string bodies (Requirement 14.1)", () => {
    it("returns byte length of an ASCII string", () => {
      expect(calculatePayloadSize("hello")).toBe(5);
    });

    it("returns byte length of an empty string", () => {
      expect(calculatePayloadSize("")).toBe(0);
    });

    it("returns correct byte length for multi-byte UTF-8 characters", () => {
      // "é" is 2 bytes in UTF-8, "€" is 3 bytes, "𝄞" (musical symbol) is 4 bytes
      expect(calculatePayloadSize("é")).toBe(2);
      expect(calculatePayloadSize("€")).toBe(3);
      expect(calculatePayloadSize("𝄞")).toBe(4);
    });

    it("returns correct byte length for mixed ASCII and multi-byte", () => {
      // "hello 世界" — "hello " = 6 bytes, "世" = 3 bytes, "界" = 3 bytes = 12
      expect(calculatePayloadSize("hello 世界")).toBe(12);
    });
  });

  describe("non-string bodies (Requirement 14.2)", () => {
    it("returns byte length of JSON-serialized object", () => {
      const obj = { key: "value" };
      const expected = new TextEncoder().encode(JSON.stringify(obj)).byteLength;
      expect(calculatePayloadSize(obj)).toBe(expected);
    });

    it("returns byte length of JSON-serialized array", () => {
      const arr = [1, 2, 3];
      const expected = new TextEncoder().encode(JSON.stringify(arr)).byteLength;
      expect(calculatePayloadSize(arr)).toBe(expected);
    });

    it("returns byte length of JSON-serialized number", () => {
      expect(calculatePayloadSize(42)).toBe(2); // "42"
    });

    it("returns byte length of JSON-serialized boolean", () => {
      expect(calculatePayloadSize(true)).toBe(4); // "true"
      expect(calculatePayloadSize(false)).toBe(5); // "false"
    });
  });
});

describe("truncatePayload", () => {
  describe("null/undefined passthrough (Requirement 9.3)", () => {
    it("returns null unchanged", () => {
      expect(truncatePayload(null)).toBeNull();
    });

    it("returns undefined unchanged", () => {
      expect(truncatePayload(undefined)).toBeUndefined();
    });
  });

  describe("payloads within limit (Requirement 9.2)", () => {
    it("returns a short string unchanged", () => {
      const payload = "short string";
      expect(truncatePayload(payload)).toBe(payload);
    });

    it("returns an object unchanged when serialized size is within limit", () => {
      const payload = { key: "value" };
      expect(truncatePayload(payload)).toBe(payload);
    });

    it("returns payload unchanged when exactly at the byte limit", () => {
      // Create a string that is exactly maxBytes bytes
      const maxBytes = 100;
      const payload = "a".repeat(maxBytes);
      expect(truncatePayload(payload, maxBytes)).toBe(payload);
    });
  });

  describe("payloads exceeding limit (Requirement 9.1)", () => {
    it("truncates a string exceeding the byte limit", () => {
      const maxBytes = 10;
      const payload = "a".repeat(20);
      const result = truncatePayload(payload, maxBytes) as string;

      expect(result).toContain("... [truncated:");
      expect(result).toContain("20 bytes]");
    });

    it("truncates an object whose serialized form exceeds the byte limit", () => {
      const maxBytes = 10;
      const payload = { data: "x".repeat(50) };
      const result = truncatePayload(payload, maxBytes) as string;

      expect(result).toContain("... [truncated:");
      expect(result).toContain("bytes]");
    });

    it("the truncated portion is at most maxBytes bytes", () => {
      const maxBytes = 50;
      const payload = "a".repeat(200);
      const result = truncatePayload(payload, maxBytes) as string;

      // The part before "... [truncated:" should be at most maxBytes bytes
      const truncatedPart = result.split("... [truncated:")[0];
      const truncatedBytes = new TextEncoder().encode(truncatedPart).byteLength;
      expect(truncatedBytes).toBeLessThanOrEqual(maxBytes);
    });

    it("handles multi-byte characters at the truncation boundary", () => {
      // "€" is 3 bytes in UTF-8. If maxBytes falls in the middle of a
      // multi-byte sequence, the decoder should handle it gracefully.
      const maxBytes = 5;
      const payload = "€€€"; // 9 bytes total
      const result = truncatePayload(payload, maxBytes) as string;

      expect(result).toContain("... [truncated: 9 bytes]");
    });

    it("uses default maxBytes of 50,000", () => {
      const payload = "x".repeat(60_000);
      const result = truncatePayload(payload) as string;

      expect(result).toContain("... [truncated: 60000 bytes]");
    });
  });
});
