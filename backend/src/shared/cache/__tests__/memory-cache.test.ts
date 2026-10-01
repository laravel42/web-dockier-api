/**
 * In-Memory TTL Cache — Unit Tests
 *
 * Covers the basic operations, TTL expiry, the periodic sweep, maxSize
 * eviction order, and destroy() releasing the sweep timer.
 *
 * These tests pin EXISTING behaviour.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryCache } from "../memory-cache.js";

describe("MemoryCache — basic operations", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>();
  });

  afterEach(() => {
    cache.destroy();
  });

  it("returns undefined for a missing key", () => {
    expect(cache.get("nope")).toBeUndefined();
    expect(cache.has("nope")).toBe(false);
  });

  it("round-trips a value", () => {
    cache.set("k", "v", 1_000);
    expect(cache.get("k")).toBe("v");
    expect(cache.has("k")).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("overwrites an existing key", () => {
    cache.set("k", "first", 1_000);
    cache.set("k", "second", 1_000);
    expect(cache.get("k")).toBe("second");
    expect(cache.size).toBe(1);
  });

  it("deletes a specific key and leaves the others", () => {
    cache.set("a", "1", 1_000);
    cache.set("b", "2", 1_000);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
  });

  it("tolerates deleting a key that was never set", () => {
    expect(() => cache.delete("ghost")).not.toThrow();
  });

  it("clears every entry", () => {
    cache.set("a", "1", 1_000);
    cache.set("b", "2", 1_000);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("stores falsy values and distinguishes them from a miss", () => {
    const numbers = new MemoryCache<number>();
    numbers.set("zero", 0, 1_000);
    expect(numbers.get("zero")).toBe(0);
    expect(numbers.has("zero")).toBe(true);
    numbers.destroy();
  });

  it("returns the stored object by reference, so mutations are visible", () => {
    const objects = new MemoryCache<{ count: number }>();
    const entry = { count: 1 };
    objects.set("k", entry, 1_000);
    entry.count = 2;
    expect(objects.get("k")).toEqual({ count: 2 });
    objects.destroy();
  });
});

describe("MemoryCache — TTL expiry", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new MemoryCache<string>({ sweepIntervalMs: 10_000 });
  });

  afterEach(() => {
    cache.destroy();
    vi.useRealTimers();
  });

  it("keeps a value while within its TTL", () => {
    cache.set("k", "v", 1_000);
    vi.advanceTimersByTime(999);
    expect(cache.get("k")).toBe("v");
  });

  it("expires a value once the TTL has elapsed", () => {
    cache.set("k", "v", 1_000);
    vi.advanceTimersByTime(1_000);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.has("k")).toBe(false);
  });

  it("drops the expired entry from the store on read (lazy eviction)", () => {
    cache.set("k", "v", 1_000);
    vi.advanceTimersByTime(1_001);
    expect(cache.size).toBe(1); // still counted until something reads it
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("expires entries independently", () => {
    cache.set("short", "a", 1_000);
    cache.set("long", "b", 10_000);
    vi.advanceTimersByTime(2_000);
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("b");
  });

  it("treats a zero TTL as already expired", () => {
    cache.set("k", "v", 0);
    expect(cache.get("k")).toBeUndefined();
  });
});

describe("MemoryCache — sweep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes expired entries on the sweep interval without any read", () => {
    const cache = new MemoryCache<string>({ sweepIntervalMs: 5_000 });
    cache.set("k", "v", 1_000);
    expect(cache.size).toBe(1);

    vi.advanceTimersByTime(5_000);

    expect(cache.size).toBe(0);
    cache.destroy();
  });

  it("leaves unexpired entries alone when sweeping", () => {
    const cache = new MemoryCache<string>({ sweepIntervalMs: 5_000 });
    cache.set("k", "v", 60_000);

    vi.advanceTimersByTime(5_000);

    expect(cache.size).toBe(1);
    expect(cache.get("k")).toBe("v");
    cache.destroy();
  });

  it("starts the sweep timer only on the first set", () => {
    const before = vi.getTimerCount();
    const cache = new MemoryCache<string>({ sweepIntervalMs: 5_000 });
    expect(vi.getTimerCount()).toBe(before);

    cache.set("a", "1", 1_000);
    expect(vi.getTimerCount()).toBe(before + 1);

    cache.set("b", "2", 1_000);
    expect(vi.getTimerCount()).toBe(before + 1);

    cache.destroy();
  });
});

describe("MemoryCache — maxSize eviction", () => {
  it("evicts the oldest entries first (Map insertion order)", () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });
    cache.set("a", "1", 60_000);
    cache.set("b", "2", 60_000);
    cache.set("c", "3", 60_000);

    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    cache.destroy();
  });

  it("evicts one entry per set once at capacity", () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });
    cache.set("a", "1", 60_000);
    cache.set("b", "2", 60_000);
    cache.set("c", "3", 60_000);
    cache.set("d", "4", 60_000);

    expect(cache.size).toBe(2);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
    cache.destroy();
  });

  it("does not count re-setting an existing key against capacity", () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });
    cache.set("a", "1", 60_000);
    cache.set("b", "2", 60_000);
    cache.set("a", "updated", 60_000);

    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBe("updated");
    expect(cache.get("b")).toBe("2");
    cache.destroy();
  });
});

describe("MemoryCache — destroy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops the sweep timer and clears the store", () => {
    const cache = new MemoryCache<string>({ sweepIntervalMs: 5_000 });
    const before = vi.getTimerCount();
    cache.set("k", "v", 60_000);
    expect(vi.getTimerCount()).toBe(before + 1);

    cache.destroy();

    expect(vi.getTimerCount()).toBe(before);
    expect(cache.size).toBe(0);
  });

  it("leaves the cache usable, restarting the sweep on the next set", () => {
    const cache = new MemoryCache<string>({ sweepIntervalMs: 5_000 });
    cache.set("k", "v", 60_000);
    cache.destroy();

    const before = vi.getTimerCount();
    cache.set("k", "again", 60_000);

    expect(cache.get("k")).toBe("again");
    expect(vi.getTimerCount()).toBe(before + 1);
    cache.destroy();
  });

  it("is idempotent", () => {
    const cache = new MemoryCache<string>();
    cache.set("k", "v", 60_000);
    cache.destroy();
    expect(() => cache.destroy()).not.toThrow();
    expect(cache.size).toBe(0);
  });
});
