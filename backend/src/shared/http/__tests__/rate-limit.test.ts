/**
 * In-Memory Rate Limiter — Unit Tests
 *
 * `rateLimit()` and `tenantRateLimit()` are Fastify preHandlers, so these tests
 * drive them with minimal request/reply doubles (the style used by
 * security-guards.test.ts) and record the headers each call sets.
 *
 * These tests pin EXISTING behaviour.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { rateLimit, tenantRateLimit, clearRateLimitStore } from "../rate-limit.js";

interface Doubles {
  request: FastifyRequest;
  reply: FastifyReply;
  headers: Record<string, unknown>;
  tooMany: string[];
}

/** Minimal request/reply doubles recording headers and 429 responses. */
function doubles(opts: { ip?: string; tenantId?: string | null; withAuth?: boolean } = {}): Doubles {
  const headers: Record<string, unknown> = {};
  const tooMany: string[] = [];

  const auth = opts.withAuth === false
    ? undefined
    : { tenantId: "tenantId" in opts ? opts.tenantId : "tenant-a" };

  const request = {
    ip: opts.ip ?? "10.0.0.1",
    ...(auth ? { auth } : {}),
  } as unknown as FastifyRequest;

  const reply = {
    header: (name: string, value: unknown) => {
      headers[name] = value;
      return reply;
    },
    tooManyRequests: (msg: string) => {
      tooMany.push(msg);
      return reply;
    },
  } as unknown as FastifyReply;

  return { request, reply, headers, tooMany };
}

beforeEach(() => {
  clearRateLimitStore();
});

describe("rateLimit", () => {
  it("sets limit and remaining headers on the first request", async () => {
    const limiter = rateLimit({ max: 3, windowMs: 60_000, prefix: "first" });
    const { request, reply, headers, tooMany } = doubles();

    await limiter(request, reply);

    expect(headers).toEqual({ "X-RateLimit-Limit": 3, "X-RateLimit-Remaining": 2 });
    expect(tooMany).toEqual([]);
  });

  it("uses the documented defaults (max 5, prefix rl)", async () => {
    const limiter = rateLimit();
    const { request, reply, headers } = doubles();

    await limiter(request, reply);

    expect(headers["X-RateLimit-Limit"]).toBe(5);
    expect(headers["X-RateLimit-Remaining"]).toBe(4);
  });

  it("decrements remaining on each subsequent request", async () => {
    const limiter = rateLimit({ max: 3, windowMs: 60_000, prefix: "decrement" });
    const remaining: unknown[] = [];

    for (let i = 0; i < 3; i++) {
      const { request, reply, headers } = doubles();
      await limiter(request, reply);
      remaining.push(headers["X-RateLimit-Remaining"]);
    }

    expect(remaining).toEqual([2, 1, 0]);
  });

  it("rejects the (max + 1)-th request with a Retry-After header", async () => {
    const limiter = rateLimit({ max: 2, windowMs: 60_000, prefix: "exceed" });

    for (let i = 0; i < 2; i++) {
      const allowed = doubles();
      await limiter(allowed.request, allowed.reply);
      expect(allowed.tooMany).toEqual([]);
    }

    const { request, reply, headers, tooMany } = doubles();
    await limiter(request, reply);

    expect(tooMany).toEqual(["Too many requests. Please try again later."]);
    expect(headers["X-RateLimit-Limit"]).toBe(2);
    expect(headers["X-RateLimit-Remaining"]).toBe(0);
    expect(headers["Retry-After"]).toBeTypeOf("number");
    expect(headers["Retry-After"] as number).toBeGreaterThan(0);
    expect(headers["Retry-After"] as number).toBeLessThanOrEqual(60);
  });

  it("keeps a separate bucket per request.ip", async () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000, prefix: "per-ip" });

    const first = doubles({ ip: "10.0.0.1" });
    await limiter(first.request, first.reply);

    const other = doubles({ ip: "10.0.0.2" });
    await limiter(other.request, other.reply);

    expect(other.tooMany).toEqual([]);
    expect(other.headers["X-RateLimit-Remaining"]).toBe(0);

    const repeat = doubles({ ip: "10.0.0.1" });
    await limiter(repeat.request, repeat.reply);
    expect(repeat.tooMany).toHaveLength(1);
  });

  it("keeps a separate bucket per prefix", async () => {
    const one = rateLimit({ max: 1, windowMs: 60_000, prefix: "alpha" });
    const two = rateLimit({ max: 1, windowMs: 60_000, prefix: "beta" });

    const a = doubles();
    await one(a.request, a.reply);

    const b = doubles();
    await two(b.request, b.reply);

    expect(b.tooMany).toEqual([]);
    expect(b.headers["X-RateLimit-Remaining"]).toBe(0);
  });

  describe("window reset", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("starts a fresh window once the previous one has elapsed", async () => {
      const limiter = rateLimit({ max: 1, windowMs: 1_000, prefix: "window" });

      const first = doubles();
      await limiter(first.request, first.reply);

      const blocked = doubles();
      await limiter(blocked.request, blocked.reply);
      expect(blocked.tooMany).toHaveLength(1);

      vi.advanceTimersByTime(1_001);

      const afterReset = doubles();
      await limiter(afterReset.request, afterReset.reply);
      expect(afterReset.tooMany).toEqual([]);
      expect(afterReset.headers["X-RateLimit-Remaining"]).toBe(0);
    });
  });
});

describe("tenantRateLimit", () => {
  it("keys on request.auth.tenantId", async () => {
    const limiter = tenantRateLimit({ max: 1, windowMs: 60_000, prefix: "tenant" });

    const a = doubles({ tenantId: "tenant-a" });
    await limiter(a.request, a.reply);
    expect(a.tooMany).toEqual([]);

    const b = doubles({ tenantId: "tenant-b" });
    await limiter(b.request, b.reply);
    expect(b.tooMany).toEqual([]);

    // Same tenant from a different IP still shares the bucket.
    const aAgain = doubles({ tenantId: "tenant-a", ip: "198.51.100.7" });
    await limiter(aAgain.request, aAgain.reply);
    expect(aAgain.tooMany).toEqual(["Rate limit exceeded for your organization. Please try again later."]);
  });

  it("uses the documented defaults (max 10, prefix trl)", async () => {
    const limiter = tenantRateLimit();
    const { request, reply, headers } = doubles();

    await limiter(request, reply);

    expect(headers["X-RateLimit-Limit"]).toBe(10);
    expect(headers["X-RateLimit-Remaining"]).toBe(9);
  });

  it("skips entirely — no headers, no rejection — when request.auth is absent", async () => {
    const limiter = tenantRateLimit({ max: 1, windowMs: 60_000, prefix: "no-auth" });

    for (let i = 0; i < 3; i++) {
      const { request, reply, headers, tooMany } = doubles({ withAuth: false });
      await limiter(request, reply);
      expect(headers).toEqual({});
      expect(tooMany).toEqual([]);
    }
  });

  it("skips when tenantId is null", async () => {
    const limiter = tenantRateLimit({ max: 1, windowMs: 60_000, prefix: "null-tenant" });
    const { request, reply, headers, tooMany } = doubles({ tenantId: null });

    await limiter(request, reply);

    expect(headers).toEqual({});
    expect(tooMany).toEqual([]);
  });
});
