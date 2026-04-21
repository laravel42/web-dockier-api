import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { LogEntry } from "@observability/types";
import { createProxyHandler } from "../proxy-handler.js";

/**
 * Property-based tests for log entry completeness.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5**
 *
 * Property 14: Log Entry Completeness
 * For any HTTP request intercepted by the proxy, the resulting LogEntry SHALL
 * contain the request method, URL endpoint, source "proxy", a valid UUID v4 id,
 * and a positive timestamp.
 */

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

/** Arbitrary for a random HTTP method. */
const methodArb = fc.constantFrom(...HTTP_METHODS);

/**
 * Arbitrary for a random URL path segment.
 * Generates paths like /abc, /foo/bar, /x/y/z using safe URL characters.
 */
const pathArb = fc
  .array(
    fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,15}$/),
    { minLength: 1, maxLength: 4 }
  )
  .map((segments) => "/" + segments.join("/"));

let targetServer: FastifyInstance;
let proxyServer: FastifyInstance;
let proxyPort: number;
let logEntries: LogEntry[];

beforeAll(async () => {
  // Start a mock target server that accepts any method/path and echoes back
  targetServer = Fastify();

  targetServer.all("/*", async (req, reply) => {
    reply.status(200).send({ ok: true, method: req.method, url: req.url });
  });

  const targetAddress = await targetServer.listen({ port: 0, host: "127.0.0.1" });
  const targetPort = Number(new URL(targetAddress).port);

  // Start the proxy server with an onLogEntry callback to capture entries
  logEntries = [];
  proxyServer = Fastify();
  await proxyServer.register(cors);

  const handler = createProxyHandler(`http://127.0.0.1:${targetPort}`, {
    onLogEntry: (entry) => logEntries.push(entry),
  });

  for (const m of HTTP_METHODS) {
    proxyServer.route({ method: m, url: "/*", handler });
  }

  const proxyAddress = await proxyServer.listen({ port: 0, host: "127.0.0.1" });
  proxyPort = Number(new URL(proxyAddress).port);
});

afterAll(async () => {
  await proxyServer.close();
  await targetServer.close();
});

describe("Log Entry Completeness — Property 14", () => {
  /**
   * **Validates: Requirements 1.3, 1.4, 1.5**
   *
   * For any HTTP method and URL path sent through the proxy, the resulting
   * LogEntry SHALL contain:
   * - method matching the request method
   * - endpoint containing the path
   * - source === "proxy"
   * - a valid UUID v4 id
   * - a positive timestamp
   */
  it("every proxied request produces a complete LogEntry with method, endpoint, source, UUID v4 id, and positive timestamp", async () => {
    await fc.assert(
      fc.asyncProperty(methodArb, pathArb, async (method, path) => {
        // Clear captured entries before each request
        logEntries.length = 0;

        const fetchOptions: RequestInit = { method };

        // Add a body for methods that typically carry one
        if (method === "POST" || method === "PUT" || method === "PATCH") {
          fetchOptions.headers = { "content-type": "application/json" };
          fetchOptions.body = JSON.stringify({ test: true });
        }

        const res = await fetch(
          `http://127.0.0.1:${proxyPort}${path}`,
          fetchOptions
        );

        // The proxy should have forwarded successfully
        expect(res.status).toBe(200);

        // Exactly one log entry should have been created
        expect(logEntries).toHaveLength(1);

        const entry = logEntries[0];

        // method matches the request method
        expect(entry.method).toBe(method);

        // endpoint contains the path
        expect(entry.endpoint).toContain(path);

        // source is "proxy"
        expect(entry.source).toBe("proxy");

        // id is a valid UUID v4
        expect(entry.id).toMatch(UUID_V4_REGEX);

        // timestamp is a positive number
        expect(entry.timestamp).toBeGreaterThan(0);
      }),
      { numRuns: 30 }
    );
  });
});
