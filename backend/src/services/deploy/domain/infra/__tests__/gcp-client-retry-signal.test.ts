/**
 * Pins the per-attempt timeout signal in `GcpClient.request`.
 *
 * The signal used to be built once, outside the `withRetry` closure. Once the
 * first attempt ran past `requestTimeoutMs` that single signal was already
 * aborted, so every remaining attempt failed instantly with an AbortError and
 * the retry budget was spent without a real second request.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

import { GcpClient } from "../gcp-client.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({}), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GcpClient.request timeout signal", () => {
  it("gives each retry attempt a fresh, unaborted signal", async () => {
    const signals: AbortSignal[] = [];
    const abortedAtCallTime: boolean[] = [];

    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      signals.push(signal);
      abortedAtCallTime.push(signal.aborted);

      // First attempt outlives requestTimeoutMs, so its own signal fires while
      // the attempt is still in flight. It then returns a retryable 500.
      if (signals.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return jsonResponse(500);
      }
      return jsonResponse(200);
    }) as unknown as typeof fetch;

    const client = new GcpClient("token", "project", {
      maxRetries: 2,
      baseDelayMs: 1,
      requestTimeoutMs: 20,
    });

    const res = await client.request("https://compute.googleapis.com/x");

    expect(res.status).toBe(200);
    expect(signals).toHaveLength(2);
    // The core of the fix: a distinct signal per attempt...
    expect(signals[0]).not.toBe(signals[1]);
    // ...and the first one really did abort, so a shared signal would have
    // poisoned the second attempt rather than merely being redundant.
    expect(signals[0].aborted).toBe(true);
    expect(abortedAtCallTime).toEqual([false, false]);
  });

  it("still sends a single request when retries are disabled", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new GcpClient("token", "project", {
      maxRetries: 3,
      baseDelayMs: 1,
      requestTimeoutMs: 1_000,
    });

    const res = await client.request("https://compute.googleapis.com/x", { noRetry: true });

    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
