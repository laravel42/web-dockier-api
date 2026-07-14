/**
 * Lightweight In-Memory Rate Limiter
 *
 * Provides IP-based rate limiting for public-facing auth endpoints.
 * Uses a fixed-window counter stored via MemoryCache with automatic cleanup.
 *
 * Security notes:
 * - Uses Fastify's request.ip which respects the app's trustProxy setting.
 *   Do NOT read X-Forwarded-For directly — it can be spoofed by clients
 *   unless a trusted reverse proxy is configured to overwrite it.
 * - Store is capped at maxSize to prevent memory exhaustion from
 *   distributed attacks with many unique IPs.
 *
 * For horizontal scaling, replace with Redis-backed implementation.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { MemoryCache } from "./memory-cache.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new MemoryCache<RateLimitEntry>({ maxSize: 10_000, sweepIntervalMs: 60_000 });

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. Default: 5 */
  max?: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
  /** Custom key prefix to separate different limiters. Default: "rl" */
  prefix?: string;
}

/**
 * Create a Fastify preHandler that enforces rate limiting.
 *
 * @example
 * ```ts
 * app.post("/auth/register/start", {
 *   preHandler: rateLimit({ max: 5, windowMs: 60_000 }),
 *   ...
 * }, handler);
 * ```
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const { max = 5, windowMs = 60_000, prefix = "rl" } = options;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const ip = request.ip;
    const key = `${prefix}:${ip}`;
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      // First request in this window or window expired
      const newEntry = { count: 1, resetAt: now + windowMs };
      store.set(key, newEntry, windowMs);
      reply.header("X-RateLimit-Limit", max);
      reply.header("X-RateLimit-Remaining", max - 1);
      return;
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      reply.header("Retry-After", retryAfterSec);
      reply.header("X-RateLimit-Limit", max);
      reply.header("X-RateLimit-Remaining", 0);
      return reply.tooManyRequests("Too many requests. Please try again later.");
    }

    reply.header("X-RateLimit-Limit", max);
    reply.header("X-RateLimit-Remaining", max - entry.count);
  };
}

/**
 * Create a Fastify preHandler that enforces per-tenant rate limiting.
 *
 * Unlike `rateLimit()` which keys on IP, this keys on the authenticated
 * tenant ID — preventing a single organization from triggering excessive
 * expensive operations (scans, deployments, builds) regardless of how
 * many IPs or users they have.
 *
 * IMPORTANT: Must be placed AFTER auth middleware (requirePermission) in
 * the preHandler array so that `request.auth` is available.
 *
 * @example
 * ```ts
 * app.post("/deploy/deployments", {
 *   preHandler: [app.requirePermission(PERMISSIONS.DEPLOY_CREATE), tenantRateLimit({ max: 10, windowMs: 60_000 })],
 *   ...
 * }, handler);
 * ```
 */
export function tenantRateLimit(options: RateLimitOptions = {}) {
  const { max = 10, windowMs = 60_000, prefix = "trl" } = options;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const tenantId = request.auth?.tenantId;
    if (!tenantId) return; // Skip if auth hasn't resolved (shouldn't happen after requirePermission)

    const key = `${prefix}:${tenantId}`;
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      const newEntry = { count: 1, resetAt: now + windowMs };
      store.set(key, newEntry, windowMs);
      reply.header("X-RateLimit-Limit", max);
      reply.header("X-RateLimit-Remaining", max - 1);
      return;
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      reply.header("Retry-After", retryAfterSec);
      reply.header("X-RateLimit-Limit", max);
      reply.header("X-RateLimit-Remaining", 0);
      return reply.tooManyRequests("Rate limit exceeded for your organization. Please try again later.");
    }

    reply.header("X-RateLimit-Limit", max);
    reply.header("X-RateLimit-Remaining", max - entry.count);
  };
}

/**
 * Clear all rate limit entries. Useful for testing.
 */
export function clearRateLimitStore(): void {
  store.clear();
}
