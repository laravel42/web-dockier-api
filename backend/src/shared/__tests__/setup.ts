/**
 * Global test setup/teardown for the backend test suite.
 *
 * Handles cleanup of in-memory stores (rate limiter) that use timers
 * and accumulate state across test files.
 *
 * NOTE: Permission cache cleanup is handled by individual test files
 * because the authorization module imports supabaseAdmin which requires
 * config mocking. The rate limiter module is self-contained and can
 * be imported safely without config initialization.
 *
 * Without this:
 * - Rate limiter entries from one test could cause a subsequent test
 *   to hit a limit unexpectedly (flaky failures)
 * - MemoryCache sweep timers could keep the process alive briefly
 *   after tests finish (cosmetic, since timers are unref'd)
 */

import { afterAll, beforeEach } from "vitest";
import { clearRateLimitStore, destroyRateLimitStore } from "../http/rate-limit.js";

beforeEach(() => {
  clearRateLimitStore();
});

afterAll(() => {
  destroyRateLimitStore();
});
