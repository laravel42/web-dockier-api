/**
 * Shared fetch helpers — Unit Tests
 *
 * These lock the two things callers rely on: `fetchJson` returns parsed JSON
 * on a 2xx and `null` on a non-OK status (the provider "no data" shape), and
 * every call carries an abort signal that either the timeout or a caller-passed
 * signal can trip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchJson, fetchWithTimeout } from "../fetch.js";

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes an abort signal and forwards init fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("https://example.test/x", {
      method: "POST",
      headers: { "x-test": "1" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/x");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-test"]).toBe("1");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // The non-standard timeoutMs must be stripped before reaching fetch.
    expect("timeoutMs" in init).toBe(false);
  });

  it("rejects when the timeout fires", async () => {
    // Simulate a hung upstream: the mock rejects once the signal aborts.
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason ?? new Error("aborted"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithTimeout("https://example.test/slow", { timeoutMs: 5 }),
    ).rejects.toBeDefined();
  });

  it("aborts when a caller-supplied signal is already aborted (signal merge)", async () => {
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason ?? new Error("aborted"));
          return;
        }
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason ?? new Error("aborted"));
        });
        // Never resolve on its own within the test window.
        setTimeout(() => resolve(new Response("late", { status: 200 })), 10_000);
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));

    // Long timeout proves the abort came from the caller signal, not the timeout.
    await expect(
      fetchWithTimeout("https://example.test/x", {
        signal: controller.signal,
        timeoutMs: 60_000,
      }),
    ).rejects.toBeDefined();
  });
});

describe("fetchJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on a 2xx response", async () => {
    const payload = { hello: "world", n: 1 };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchJson<typeof payload>("https://example.test/data");
    expect(data).toEqual(payload);
  });

  it("returns null on a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchJson("https://example.test/missing");
    expect(data).toBeNull();
  });

  it("uses the default timeout constant when none is given", async () => {
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(15_000);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchJson("https://example.test/x");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
