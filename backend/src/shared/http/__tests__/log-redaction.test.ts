/**
 * Log Redaction — Unit Tests
 *
 * The point of these is that a JWT carried as `?token=` (the scan WebSocket
 * route's design) never reaches a log line, and that the serializer itself
 * can never throw — a throwing serializer breaks logging entirely.
 */

import { describe, it, expect } from "vitest";
import { LOG_REDACT_PATHS, maskTokenInUrl, redactedReqSerializer } from "../log-redaction.js";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1LTEifQ.c2lnbmF0dXJl";

describe("LOG_REDACT_PATHS", () => {
  it("covers the five credential-bearing headers", () => {
    expect(LOG_REDACT_PATHS).toEqual([
      "req.headers.authorization",
      'req.headers["x-api-key"]',
      'req.headers["x-internal-token"]',
      'req.headers["x-webhook-signature"]',
      "req.headers.cookie",
    ]);
  });
});

describe("maskTokenInUrl", () => {
  it("masks the token on the scan WebSocket URL", () => {
    const masked = maskTokenInUrl("/code-analysis/scans/x/ws?token=abc");

    expect(masked).not.toContain("abc");
    expect(masked).toBe("/code-analysis/scans/x/ws?token=REDACTED");
  });

  it("masks a real-looking JWT", () => {
    const masked = maskTokenInUrl(`/code-analysis/scans/x/ws?token=${JWT}`);

    expect(masked).not.toContain(JWT);
    expect(masked).not.toContain("eyJ");
  });

  it("masks the token when it is not the first query param", () => {
    expect(maskTokenInUrl("/ws?foo=1&token=abc")).toBe("/ws?foo=1&token=REDACTED");
  });

  it("masks every occurrence when the token param repeats", () => {
    const masked = maskTokenInUrl("/ws?token=a&token=b");

    expect(masked).toBe("/ws?token=REDACTED&token=REDACTED");
    expect(masked).not.toMatch(/token=a|token=b/);
  });

  it("leaves a URL with no query string untouched", () => {
    expect(maskTokenInUrl("/path")).toBe("/path");
    expect(maskTokenInUrl("/healthz")).toBe("/healthz");
  });

  it("leaves a query string without a token param untouched", () => {
    expect(maskTokenInUrl("/projects?limit=50&offset=0")).toBe("/projects?limit=50&offset=0");
  });

  it("does not throw on malformed input", () => {
    expect(() => maskTokenInUrl("%%%")).not.toThrow();
    expect(() => maskTokenInUrl("://")).not.toThrow();
    expect(() => maskTokenInUrl("")).not.toThrow();
    expect(() => maskTokenInUrl("?%E0%A4%A")).not.toThrow();
  });

  it("never leaks the token value, whatever the parse outcome", () => {
    for (const url of ["/ws?token=abc", "://?token=abc", "%%%?token=abc", "?token=abc"]) {
      expect(maskTokenInUrl(url)).not.toContain("abc");
    }
  });
});

describe("redactedReqSerializer", () => {
  it("emits the default Fastify fields with a masked url", () => {
    const serialized = redactedReqSerializer({
      method: "GET",
      url: "/code-analysis/scans/x/ws?token=abc",
      host: "api.dockier.dev",
      ip: "203.0.113.7",
      socket: { remoteAddress: "10.0.0.1", remotePort: 54321 },
    });

    expect(serialized).toEqual({
      method: "GET",
      url: "/code-analysis/scans/x/ws?token=REDACTED",
      host: "api.dockier.dev",
      remoteAddress: "203.0.113.7",
      remotePort: 54321,
    });
  });

  it("falls back to the socket and host header when host/ip are absent", () => {
    const serialized = redactedReqSerializer({
      method: "POST",
      url: "/deploy/deployments",
      headers: { host: "localhost:4000" },
      socket: { remoteAddress: "127.0.0.1", remotePort: 100 },
    });

    expect(serialized.host).toBe("localhost:4000");
    expect(serialized.remoteAddress).toBe("127.0.0.1");
  });

  it("does not throw on a request double with missing fields", () => {
    expect(() => redactedReqSerializer({})).not.toThrow();
    expect(() => redactedReqSerializer(null)).not.toThrow();
    expect(() => redactedReqSerializer(undefined)).not.toThrow();

    expect(redactedReqSerializer({})).toEqual({
      method: undefined,
      url: undefined,
      host: undefined,
      remoteAddress: undefined,
      remotePort: undefined,
    });
  });

  it("does not throw when url is not a string", () => {
    expect(() => redactedReqSerializer({ url: 42 })).not.toThrow();
    expect(redactedReqSerializer({ url: 42 }).url).toBeUndefined();
  });
});
