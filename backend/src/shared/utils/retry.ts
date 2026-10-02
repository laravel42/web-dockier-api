/**
 * Structured Retry Utility
 *
 * Provides a reusable retry wrapper for external calls (AWS SDK, HTTP APIs,
 * database queries, git clones) with configurable attempts, backoff, and timeout.
 *
 * Design choices:
 * - Exponential backoff with jitter to avoid thundering herd on retries
 * - Per-attempt timeout to prevent indefinite hangs
 * - Optional `shouldRetry` predicate so callers can skip retries on non-transient errors
 * - Returns the result on success or throws the last error on exhaustion
 * - Logs each retry under `label`, so a call that only succeeded on its third
 *   attempt is distinguishable from one that succeeded immediately
 *
 * @example
 * ```ts
 * const result = await withRetry(() => s3.send(new PutObjectCommand(params)), {
 *   attempts: 3,
 *   backoffMs: 1000,
 *   timeoutMs: 10_000,
 * });
 * ```
 *
 * @example
 * ```ts
 * // Skip retry on 4xx client errors
 * const data = await withRetry(() => fetch(url), {
 *   attempts: 3,
 *   shouldRetry: (err) => !is4xxError(err),
 * });
 * ```
 */

import { sleep } from "./time.js";
import { logger } from "../logger.js";
import { getErrMsg } from "./error-message.js";

export interface RetryOptions {
  /**
   * Maximum number of attempts (including the initial call). Default: 3
   *
   * Values below 1 are clamped to 1: `attempts: 0` used to skip the loop
   * entirely, so the wrapped function never ran and the caller got a rejection
   * with `undefined`. Running once is the least surprising reading of a bad
   * value, and silently doing nothing is never what the caller wanted.
   */
  attempts?: number;
  /** Base delay between retries in ms (exponential backoff applied). Default: 1000 */
  backoffMs?: number;
  /** Per-attempt timeout in ms. Rejects if a single attempt exceeds this. Default: none (no timeout) */
  timeoutMs?: number;
  /** Predicate to decide if an error is retryable. Default: always retry */
  shouldRetry?: (error: unknown) => boolean;
  /** Identifies the operation in the retry log line. Default: "withRetry" */
  label?: string;
}

/**
 * Execute an async function with retry logic.
 *
 * - Retries up to `attempts` times on failure (minimum 1)
 * - Applies exponential backoff with ±25% jitter between retries
 * - Optionally enforces a per-attempt timeout
 * - Skips retry if `shouldRetry` returns false
 * - Logs a warning before each retry, tagged with `label`
 * - Throws the last error if all attempts are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    backoffMs = 1_000,
    timeoutMs,
    shouldRetry = () => true,
    label = "withRetry",
  } = options;

  // Clamp so a 0 or negative value runs once rather than skipping the loop and
  // rejecting with `undefined`. Math.floor guards a fractional value too.
  const maxAttempts = Math.max(1, Math.floor(attempts));

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = timeoutMs
        ? await withTimeout(fn(), timeoutMs)
        : await fn();
      return result;
    } catch (err) {
      lastError = err;

      // Don't retry if this is the last attempt or the error is non-retryable
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        break;
      }

      // Exponential backoff with jitter: base * 2^(attempt-1) * (0.75–1.25)
      const delay = backoffMs * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5);

      // A retry means something external just failed. Without this the whole
      // retry loop was silent, so a call that succeeded on attempt 3 looked
      // identical to one that succeeded first try.
      logger.warn(
        { label, attempt, maxAttempts, delayMs: Math.round(delay), reason: getErrMsg(err) },
        `${label}: attempt ${attempt}/${maxAttempts} failed, retrying`,
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

// ─── Helpers ───────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
      // Allow Node to exit even if the timer is pending (e.g. in tests)
      if (timer.unref) timer.unref();
    }),
  ]);
}
