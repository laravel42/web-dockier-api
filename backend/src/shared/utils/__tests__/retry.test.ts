/**
 * Structured Retry Utility — Unit Tests
 *
 * `withRetry` awaits the shared `sleep` helper between attempts, so `sleep` is
 * mocked here: it resolves immediately and records the requested delay, which
 * makes the exponential-backoff schedule directly assertable without waiting
 * real time. `Math.random` is pinned where an exact delay is asserted, since
 * the implementation applies ±25% jitter.
 *
 * RetryOptions declares `attempts`, `backoffMs`, `timeoutMs`, `shouldRetry` and
 * `label` — there is no `onRetry` hook, so none is tested.
 *
 * These tests pin EXISTING behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sleepDelays: number[] = [];
vi.mock("../time.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../time.js")>();
  return {
    ...actual,
    sleep: async (ms: number) => {
      sleepDelays.push(ms);
    },
  };
});

const { withRetry } = await import("../retry.js");

beforeEach(() => {
  sleepDelays.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withRetry — success paths", () => {
  it("returns the result of a first-attempt success without sleeping", async () => {
    const fn = vi.fn(async () => "ok");

    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepDelays).toEqual([]);
  });

  it("succeeds after N failures and reports the exact attempt count", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error(`fail ${calls}`);
      return "recovered";
    });

    await expect(withRetry(fn, { attempts: 3, backoffMs: 10 })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepDelays).toHaveLength(2);
  });

  it("passes no arguments to the wrapped function", async () => {
    const fn = vi.fn(async () => "ok");
    await withRetry(fn);
    expect(fn).toHaveBeenCalledWith();
  });

  it("preserves a falsy result", async () => {
    await expect(withRetry(async () => 0)).resolves.toBe(0);
    await expect(withRetry(async () => null)).resolves.toBeNull();
  });
});

describe("withRetry — exhaustion", () => {
  it("rethrows the last error after the default 3 attempts", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      throw new Error(`fail ${calls}`);
    });

    await expect(withRetry(fn, { backoffMs: 10 })).rejects.toThrow("fail 3");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("sleeps attempts-1 times — never after the final attempt", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(withRetry(fn, { attempts: 4, backoffMs: 10 })).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleepDelays).toHaveLength(3);
  });

  it("makes exactly one call when attempts is 1", async () => {
    const fn = vi.fn(async () => {
      throw new Error("once");
    });

    await expect(withRetry(fn, { attempts: 1 })).rejects.toThrow("once");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepDelays).toEqual([]);
  });

  it("rethrows a non-Error rejection value unchanged", async () => {
    await expect(withRetry(async () => Promise.reject("string failure"), { attempts: 1 })).rejects.toBe(
      "string failure",
    );
  });

  // NOTE: suspected bug — `attempts: 0` skips the loop entirely, so the wrapped
  // function never runs and `withRetry` rejects with `undefined`.
  it("never calls the function and throws undefined when attempts is 0", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(withRetry(fn, { attempts: 0 })).rejects.toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("withRetry — backoff schedule", () => {
  it("applies exponential backoff from backoffMs (jitter pinned to 1.0)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 0.75 + 0.5 * 0.5 = 1.0
    const fn = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(withRetry(fn, { attempts: 4, backoffMs: 100 })).rejects.toThrow("always");
    expect(sleepDelays).toEqual([100, 200, 400]);
  });

  it("uses a 1000ms base delay by default", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fn = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(withRetry(fn)).rejects.toThrow("always");
    expect(sleepDelays).toEqual([1_000, 2_000]);
  });

  it("applies the lower jitter bound at 0.75x", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fn = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(withRetry(fn, { attempts: 2, backoffMs: 100 })).rejects.toThrow("always");
    expect(sleepDelays).toEqual([75]);
  });

  it("keeps every delay inside the ±25% jitter window", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(withRetry(fn, { attempts: 3, backoffMs: 100 })).rejects.toThrow("always");
    expect(sleepDelays).toHaveLength(2);
    expect(sleepDelays[0]).toBeGreaterThanOrEqual(75);
    expect(sleepDelays[0]).toBeLessThanOrEqual(125);
    expect(sleepDelays[1]).toBeGreaterThanOrEqual(150);
    expect(sleepDelays[1]).toBeLessThanOrEqual(250);
  });
});

describe("withRetry — shouldRetry", () => {
  it("stops immediately and rethrows when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("client error");
    });
    const shouldRetry = vi.fn(() => false);

    await expect(withRetry(fn, { attempts: 5, backoffMs: 10, shouldRetry })).rejects.toThrow("client error");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepDelays).toEqual([]);
  });

  it("receives the thrown error", async () => {
    const boom = new Error("boom");
    const shouldRetry = vi.fn(() => false);

    await expect(
      withRetry(
        async () => {
          throw boom;
        },
        { attempts: 3, shouldRetry },
      ),
    ).rejects.toBe(boom);
    expect(shouldRetry).toHaveBeenCalledWith(boom);
  });

  it("retries while the predicate keeps returning true", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
      return "ok";
    });

    await expect(
      withRetry(fn, { attempts: 3, backoffMs: 10, shouldRetry: (err) => (err as Error).message === "transient" }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("is not consulted on the final attempt", async () => {
    const shouldRetry = vi.fn(() => true);
    await expect(
      withRetry(
        async () => {
          throw new Error("last");
        },
        { attempts: 1, shouldRetry },
      ),
    ).rejects.toThrow("last");
    expect(shouldRetry).not.toHaveBeenCalled();
  });
});

describe("withRetry — timeoutMs", () => {
  it("rejects an attempt that exceeds the per-attempt timeout", async () => {
    const fn = vi.fn(() => new Promise<string>(() => {}));

    await expect(withRetry(fn, { attempts: 1, timeoutMs: 10 })).rejects.toThrow("Operation timed out after 10ms");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries after a timeout and can still succeed", async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls++;
      if (calls === 1) return new Promise<string>(() => {});
      return Promise.resolve("ok");
    });

    await expect(withRetry(fn, { attempts: 2, backoffMs: 1, timeoutMs: 10 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not time out a fast attempt", async () => {
    await expect(withRetry(async () => "fast", { timeoutMs: 1_000 })).resolves.toBe("fast");
  });

  // timeoutMs is checked for truthiness, so 0 disables the timeout entirely.
  it("treats timeoutMs 0 as no timeout", async () => {
    await expect(withRetry(async () => "ok", { attempts: 1, timeoutMs: 0 })).resolves.toBe("ok");
  });

  it("accepts a label without changing the outcome", async () => {
    await expect(withRetry(async () => "ok", { label: "s3-put" })).resolves.toBe("ok");
  });
});
