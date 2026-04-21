import { describe, it, expect } from "vitest";
import { sanitizeHeaders } from "./sanitize-headers.js";

/**
 * Unit tests for sanitizeHeaders() — validates Requirements 2.1, 2.2, 2.3, 2.4
 */
describe("sanitizeHeaders", () => {
  describe("Sensitive header redaction (Requirement 2.1)", () => {
    it("redacts authorization header", () => {
      const result = sanitizeHeaders({ authorization: "Bearer token123" });
      expect(result.authorization).toBe("[REDACTED]");
    });

    it("redacts cookie header", () => {
      const result = sanitizeHeaders({ cookie: "session=abc" });
      expect(result.cookie).toBe("[REDACTED]");
    });

    it("redacts set-cookie header", () => {
      const result = sanitizeHeaders({ "set-cookie": "id=abc; Path=/" });
      expect(result["set-cookie"]).toBe("[REDACTED]");
    });

    it("redacts x-api-key header", () => {
      const result = sanitizeHeaders({ "x-api-key": "secret-key" });
      expect(result["x-api-key"]).toBe("[REDACTED]");
    });

    it("redacts x-auth-token header", () => {
      const result = sanitizeHeaders({ "x-auth-token": "token-value" });
      expect(result["x-auth-token"]).toBe("[REDACTED]");
    });

    it("redacts proxy-authorization header", () => {
      const result = sanitizeHeaders({ "proxy-authorization": "Basic abc" });
      expect(result["proxy-authorization"]).toBe("[REDACTED]");
    });

    it("preserves non-sensitive headers", () => {
      const result = sanitizeHeaders({
        "content-type": "application/json",
        accept: "text/html",
      });
      expect(result["content-type"]).toBe("application/json");
      expect(result.accept).toBe("text/html");
    });
  });

  describe("Case-insensitive matching (Requirement 2.2)", () => {
    it("redacts Authorization with mixed case", () => {
      const result = sanitizeHeaders({ Authorization: "Bearer xyz" });
      expect(result.Authorization).toBe("[REDACTED]");
    });

    it("redacts COOKIE in uppercase", () => {
      const result = sanitizeHeaders({ COOKIE: "session=abc" });
      expect(result.COOKIE).toBe("[REDACTED]");
    });

    it("redacts X-Api-Key with title case", () => {
      const result = sanitizeHeaders({ "X-Api-Key": "my-key" });
      expect(result["X-Api-Key"]).toBe("[REDACTED]");
    });

    it("redacts X-AUTH-TOKEN in uppercase", () => {
      const result = sanitizeHeaders({ "X-AUTH-TOKEN": "tok" });
      expect(result["X-AUTH-TOKEN"]).toBe("[REDACTED]");
    });
  });

  describe("Array header values (Requirement 2.3)", () => {
    it("joins array values with comma-space", () => {
      const result = sanitizeHeaders({
        accept: ["text/html", "application/json"],
      });
      expect(result.accept).toBe("text/html, application/json");
    });

    it("redacts sensitive headers even when value is an array", () => {
      const result = sanitizeHeaders({
        "set-cookie": ["id=abc; Path=/", "lang=en"],
      });
      expect(result["set-cookie"]).toBe("[REDACTED]");
    });
  });

  describe("Undefined values (Requirement 2.4)", () => {
    it("omits headers with undefined values", () => {
      const result = sanitizeHeaders({
        "content-type": "application/json",
        "x-custom": undefined,
      });
      expect(result).toEqual({ "content-type": "application/json" });
      expect("x-custom" in result).toBe(false);
    });

    it("omits sensitive headers with undefined values", () => {
      const result = sanitizeHeaders({
        authorization: undefined,
      });
      expect(result).toEqual({});
      expect("authorization" in result).toBe(false);
    });
  });

  describe("Mixed scenarios", () => {
    it("handles a mix of sensitive, non-sensitive, array, and undefined headers", () => {
      const result = sanitizeHeaders({
        "content-type": "application/json",
        Authorization: "Bearer secret",
        accept: ["text/html", "text/plain"],
        cookie: "session=xyz",
        "x-request-id": "req-123",
        "x-missing": undefined,
      });

      expect(result).toEqual({
        "content-type": "application/json",
        Authorization: "[REDACTED]",
        accept: "text/html, text/plain",
        cookie: "[REDACTED]",
        "x-request-id": "req-123",
      });
    });

    it("returns empty object for empty input", () => {
      const result = sanitizeHeaders({});
      expect(result).toEqual({});
    });

    it("returns empty object when all values are undefined", () => {
      const result = sanitizeHeaders({
        "content-type": undefined,
        accept: undefined,
      });
      expect(result).toEqual({});
    });
  });
});
