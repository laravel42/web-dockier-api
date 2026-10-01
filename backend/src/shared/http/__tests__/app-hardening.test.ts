/**
 * App-Level Hardening — Integration Tests
 *
 * Covers three additions that live on the Fastify factory rather than in any
 * one route: static security response headers, the x-request-id passthrough,
 * and the /readyz readiness endpoint.
 *
 * These boot the real app via buildApp so they fail if the options are dropped.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestEnv } from "../../__tests__/test-helpers.js";

vi.mock("../../config.js", () => ({ env: createTestEnv() }));
vi.mock("../../supabase/client.js", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() } },
}));

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("auth");

  // Fastify does not echo the request id in a response header, so expose it
  // through a route to assert on what the logger and the queue actually see.
  // Must be registered before the first inject() boots the instance.
  app.get("/__request-id", async (request) => ({ id: request.id }));

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("security response headers", () => {
  it("sets the static headers on an API response", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
  });

  it("sets them on an error response too", async () => {
    const res = await app.inject({ method: "GET", url: "/__does-not-exist" });

    expect(res.statusCode).toBe(404);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("leaves the swagger-ui subtree alone so its own CSP applies", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/static/index.html" });

    // Whatever swagger-ui answers, the hook must not have stamped our headers.
    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(res.headers["referrer-policy"]).toBeUndefined();
  });
});

describe("x-request-id passthrough", () => {
  it("adopts an inbound request id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/__request-id",
      headers: { "x-request-id": "trace-from-the-frontend" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("trace-from-the-frontend");
  });

  it("generates a unique id when the header is absent", async () => {
    const first = await app.inject({ method: "GET", url: "/__request-id" });
    const second = await app.inject({ method: "GET", url: "/__request-id" });

    const a = first.json().id as string;
    const b = second.json().id as string;

    // A UUID, not the "req-N" per-process counter Fastify defaults to.
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("health and readiness", () => {
  it("keeps /healthz byte-identical for existing platform probes", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "auth" });
  });

  it("reports queue state on /readyz", async () => {
    const res = await app.inject({ method: "GET", url: "/readyz" });
    const body = res.json();

    // The queue is never started in tests, so this is the degraded branch.
    expect(res.statusCode).toBe(503);
    expect(body).toEqual({ status: "degraded", service: "auth", queue: "unavailable" });
  });

  it("reports ready when the queue is up", async () => {
    const queue = await import("../../database/queue.js");
    const spy = vi.spyOn(queue, "isQueueReady").mockReturnValue(true);

    try {
      const res = await app.inject({ method: "GET", url: "/readyz" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ready", service: "auth", queue: "ready" });
    } finally {
      spy.mockRestore();
    }
  });
});
