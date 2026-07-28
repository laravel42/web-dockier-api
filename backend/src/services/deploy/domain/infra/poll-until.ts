/**
 * Generic polling utility.
 *
 * Repeatedly calls a check function at a fixed interval until it returns
 * a truthy result or the timeout is reached. Replaces ad-hoc while loops
 * scattered across adapters and helpers.
 */

export interface PollOptions<T> {
  /** Function to call on each attempt. Return a truthy value to stop polling. */
  check: (attempt: number) => Promise<T | null | undefined | false>;
  /** Milliseconds between checks. */
  intervalMs: number;
  /** Maximum milliseconds to poll before giving up. */
  timeoutMs: number;
  /** Optional callback for logging progress. Called with the attempt number. */
  onAttempt?: (attempt: number) => Promise<void>;
  /** Optional callback when the timeout is reached without success. */
  onTimeout?: () => Promise<void>;
}

export interface PollResult<T> {
  /** Whether the check succeeded before timeout. */
  success: boolean;
  /** The value returned by the check function (undefined if timed out). */
  value?: T;
  /** Total number of attempts made. */
  attempts: number;
}

/**
 * Poll until a check function returns a truthy value or the timeout is reached.
 */
export async function pollUntil<T>(opts: PollOptions<T>): Promise<PollResult<T>> {
  const { check, intervalMs, timeoutMs, onAttempt, onTimeout } = opts;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    const result = await check(attempt);
    if (result) {
      return { success: true, value: result, attempts: attempt };
    }
    if (onAttempt) {
      await onAttempt(attempt);
    }
    // Don't sleep after the last attempt if we're past the deadline
    if (Date.now() + intervalMs < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
    } else {
      break;
    }
  }

  if (onTimeout) {
    await onTimeout();
  }
  return { success: false, attempts: attempt };
}
