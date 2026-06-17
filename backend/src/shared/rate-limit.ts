/**
 * Lightweight In-Memory Rate Limiter
 *
 * Provides IP-based rate limiting for public-facing auth endpoints.
 * Uses a fixed-window counter stored in memory with automatic cleanup.
 *
 * Security notes:
 * - Uses Fastify's request.ip which respects the app's trustProxy setting.
 *   Do NOT read X-Forwarded-For directly — it can be spoofed by clients
 *   unless a trusted reverse proxy is configured to overwrite it.
 * - Store is capped at MAX_STORE_SIZE to prevent memory exhaustion from
 *   distributed attacks with many unique IPs.
 *
 * For horizontal scaling, replace with Redis-backed implementation.
 */

import type { FastifyRequest, FastifyReply } from "fastify";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/** Maximum number of tracked IPs. Beyond this, oldest entries are evicted. */
const MAX_STORE_SIZE = 10_000;

// Periodic cleanup of expired entries (every 60s)
const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow Node to exit even if this timer is running
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * Evict the oldest entries when the store exceeds MAX_STORE_SIZE.
 * Map iteration order is insertion order, so the first entries are oldest.
 */
function evictIfNeeded() {
  if (store.size <= MAX_STORE_SIZE) return;
  const excess = store.size - MAX_STORE_SIZE;
  let removed = 0;
  for (const key of store.keys()) {
    if (removed >= excess) break;
    store.delete(key);
    removed++;
  }
}

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
  ensureCleanup();

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const ip = request.ip;
    const key = `${prefix}:${ip}`;
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      // First request in this window or window expired
      store.set(key, { count: 1, resetAt: now + windowMs });
      evictIfNeeded();
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
  ensureCleanup();

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const tenantId = request.auth?.tenantId;
    if (!tenantId) return; // Skip if auth hasn't resolved (shouldn't happen after requirePermission)

    const key = `${prefix}:${tenantId}`;
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      evictIfNeeded();
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
