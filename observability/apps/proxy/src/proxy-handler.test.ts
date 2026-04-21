import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { LogEntry } from "@observability/types";
import { createProxyHandler } from "./proxy-handler.js";

/**
 * Tests for the proxy handler — validates Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6:
 * - Forwards requests to TARGET_URL with same method, headers, and body
 * - Returns proxied response with same status code, headers, and body
 * - Returns 502 when target is unreachable
 * - Creates LogEntry with source: "proxy" for each request/response cycle
 * - Captures method, URL, query, sanitized headers, body, payload size, status, duration
 */

let targetServer: FastifyInstance;
let proxyServer: FastifyInstance;
let targetPort: number;
let proxyPort: number;

beforeAll(async () => {
  // Start a mock target server
  targetServer = Fastify();

  targetServer.get("/hello", async (_req, reply) => {
    reply.header("x-custom", "target-value");
    return { message: "hello from target" };
  });

  targetServer.post("/echo", async (req, reply) => {
    reply.status(201).header("x-echo", "true");
    return { received: req.body };
  });

  targetServer.get("/error", async (_req, reply) => {
    reply.status(500);
    return { error: "internal server error" };
  });

  targetServer.delete("/resource/42", async (_req, reply) => {
    reply.status(204).send();
  });

  targetServer.get("/with-query", async (req, reply) => {
    return { query: req.query };
  });

  const targetAddress = await targetServer.listen({ port: 0, host: "127.0.0.1" });
  targetPort = Number(new URL(targetAddress).port);

  // Start the proxy server pointing at the target
  proxyServer = Fastify();
  await proxyServer.register(cors);
  const proxyHandler = createProxyHandler(`http://127.0.0.1:${targetPort}`);
  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
  for (const method of methods) {
    proxyServer.route({ method, url: "/*", handler: proxyHandler });
  }

  const proxyAddress = await proxyServer.listen({ port: 0, host: "127.0.0.1" });
  proxyPort = Number(new URL(proxyAddress).port);
});

afterAll(async () => {
  await proxyServer.close();
  await targetServer.close();
});

describe("Proxy Handler", () => {
  describe("Request forwarding (Requirement 1.1)", () => {
    it("forwards GET requests and returns target response", async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/hello`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ message: "hello from target" });
    });

    it("forwards POST requests with body", async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/echo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: "test" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ received: { data: "test" } });
    });

    it("forwards DELETE requests", async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/resource/42`, {
        method: "DELETE",
      });
      expect(res.status).toBe(204);
    });

    it("forwards query parameters", async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/with-query?foo=bar&baz=1`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { query: Record<string, string> };
      expect(body.query).toEqual({ foo: "bar", baz: "1" });
    });
  });

  describe("Response forwarding (Requirement 1.2)", () => {
    it("returns the same status code from target", async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/error`);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: "internal server error" });
    });

    it("forwards custom response headers from target", async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/hello`);
      expect(res.headers.get("x-custom")).toBe("target-value");
    });
  });

  describe("Target unreachable — 502 (Requirement 1.6)", () => {
    it("returns 502 when target is unreachable", async () => {
      // Create a proxy pointing to a non-existent server
      const badProxy = Fastify();
      await badProxy.register(cors);
      const badHandler = createProxyHandler("http://127.0.0.1:19999");
      const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
      for (const method of methods) {
        badProxy.route({ method, url: "/*", handler: badHandler });
      }
      const badAddress = await badProxy.listen({ port: 0, host: "127.0.0.1" });
      const badPort = Number(new URL(badAddress).port);

      try {
        const res = await fetch(`http://127.0.0.1:${badPort}/anything`);
        expect(res.status).toBe(502);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Bad Gateway");
      } finally {
        await badProxy.close();
      }
    });
  });

  describe("CORS support", () => {
    it("responds to preflight OPTIONS requests with CORS headers", async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/hello`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "GET",
        },
      });
      // @fastify/cors should handle this
      expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
    });
  });

  describe("LogEntry creation (Requirements 1.3, 1.4, 1.5)", () => {
    it("creates a LogEntry with source proxy for successful requests", async () => {
      const entries: LogEntry[] = [];
      const logProxy = Fastify();
      await logProxy.register(cors);
      const handler = createProxyHandler(`http://127.0.0.1:${targetPort}`, {
        onLogEntry: (entry) => entries.push(entry),
      });
      for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"] as const) {
        logProxy.route({ method: m, url: "/*", handler });
      }
      const addr = await logProxy.listen({ port: 0, host: "127.0.0.1" });
      const port = Number(new URL(addr).port);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/hello`);
        expect(res.status).toBe(200);

        expect(entries).toHaveLength(1);
        const entry = entries[0];
        expect(entry.source).toBe("proxy");
        expect(entry.type).toBe("info");
        expect(entry.method).toBe("GET");
        expect(entry.endpoint).toBe("/hello");
        expect(entry.status).toBe(200);
        expect(entry.duration).toBeGreaterThanOrEqual(0);
        expect(entry.id).toBeDefined();
        expect(entry.timestamp).toBeGreaterThan(0);
        expect(entry.message).toContain("GET");
        expect(entry.message).toContain("200");
      } finally {
        await logProxy.close();
      }
    });

    it("captures method, query, body, payloadSize, status, and duration", async () => {
      const entries: LogEntry[] = [];
      const logProxy = Fastify();
      await logProxy.register(cors);
      const handler = createProxyHandler(`http://127.0.0.1:${targetPort}`, {
        onLogEntry: (entry) => entries.push(entry),
      });
      for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"] as const) {
        logProxy.route({ method: m, url: "/*", handler });
      }
      const addr = await logProxy.listen({ port: 0, host: "127.0.0.1" });
      const port = Number(new URL(addr).port);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/echo`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: "test" }),
        });
        expect(res.status).toBe(201);

        expect(entries).toHaveLength(1);
        const entry = entries[0];
        expect(entry.method).toBe("POST");
        expect(entry.endpoint).toContain("/echo");
        expect(entry.status).toBe(201);
        expect(entry.duration).toBeGreaterThanOrEqual(0);
        expect(entry.payloadSize).toBeGreaterThan(0);
        expect(entry.response).toBeDefined();
      } finally {
        await logProxy.close();
      }
    });

    it("sets type to error for 4xx/5xx responses", async () => {
      const entries: LogEntry[] = [];
      const logProxy = Fastify();
      await logProxy.register(cors);
      const handler = createProxyHandler(`http://127.0.0.1:${targetPort}`, {
        onLogEntry: (entry) => entries.push(entry),
      });
      for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"] as const) {
        logProxy.route({ method: m, url: "/*", handler });
      }
      const addr = await logProxy.listen({ port: 0, host: "127.0.0.1" });
      const port = Number(new URL(addr).port);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/error`);
        expect(res.status).toBe(500);

        expect(entries).toHaveLength(1);
        expect(entries[0].type).toBe("error");
        expect(entries[0].status).toBe(500);
      } finally {
        await logProxy.close();
      }
    });

    it("creates an error LogEntry when target is unreachable (Requirement 1.6)", async () => {
      const entries: LogEntry[] = [];
      const badProxy = Fastify();
      await badProxy.register(cors);
      const handler = createProxyHandler("http://127.0.0.1:19999", {
        onLogEntry: (entry) => entries.push(entry),
      });
      for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"] as const) {
        badProxy.route({ method: m, url: "/*", handler });
      }
      const addr = await badProxy.listen({ port: 0, host: "127.0.0.1" });
      const port = Number(new URL(addr).port);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/anything`);
        expect(res.status).toBe(502);

        expect(entries).toHaveLength(1);
        const entry = entries[0];
        expect(entry.source).toBe("proxy");
        expect(entry.type).toBe("error");
        expect(entry.method).toBe("GET");
        expect(entry.endpoint).toBe("/anything");
        expect(entry.error).toBeDefined();
        expect(entry.duration).toBeGreaterThanOrEqual(0);
        expect(entry.message).toContain("Proxy error");
      } finally {
        await badProxy.close();
      }
    });
  });
});
