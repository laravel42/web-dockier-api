/**
 * Cache Store Contract — Structural Conformance Test
 *
 * `CacheStore` and `AsyncCacheStore` are type-only declarations, so there is no
 * runtime behaviour of their own to exercise. This file is deliberately small:
 * it asserts at compile time (via `satisfies`) that MemoryCache is assignable to
 * `CacheStore<V>`, and at runtime that every method named by the contract exists
 * and behaves as the interface documents. If a future Redis adapter lands, it
 * should be added to the same round-trip below.
 */

import { describe, it, expect } from "vitest";
import { MemoryCache } from "../memory-cache.js";
import type { CacheStore, AsyncCacheStore } from "../cache-store.js";

const CACHE_STORE_METHODS = ["get", "set", "has", "delete", "clear", "destroy"] as const;

describe("CacheStore contract", () => {
  it("is satisfied by MemoryCache at compile time", () => {
    const store = new MemoryCache<string>() satisfies CacheStore<string>;
    expect(store).toBeInstanceOf(MemoryCache);
    store.destroy();
  });

  it.each(CACHE_STORE_METHODS)("declares %s as a callable member on MemoryCache", (method) => {
    const store: CacheStore<string> = new MemoryCache<string>();
    expect(store[method]).toBeTypeOf("function");
    store.destroy();
  });

  it("round-trips through the interface type without reaching for implementation details", () => {
    const store: CacheStore<number> = new MemoryCache<number>();

    expect(store.get("k")).toBeUndefined();
    expect(store.has("k")).toBe(false);

    store.set("k", 42, 60_000);
    expect(store.get("k")).toBe(42);
    expect(store.has("k")).toBe(true);

    store.delete("k");
    expect(store.get("k")).toBeUndefined();

    store.set("a", 1, 60_000);
    store.clear();
    expect(store.get("a")).toBeUndefined();

    // The contract promises the store stays usable after destroy().
    store.destroy();
    store.set("b", 2, 60_000);
    expect(store.get("b")).toBe(2);
    store.destroy();
  });

  it("returns values synchronously — the sync contract, not AsyncCacheStore", () => {
    const store: CacheStore<string> = new MemoryCache<string>();
    store.set("k", "v", 60_000);
    expect(store.get("k")).not.toBeInstanceOf(Promise);
    store.destroy();
  });
});

describe("AsyncCacheStore contract", () => {
  it("is satisfiable by a promise-returning adapter (no implementation ships yet)", async () => {
    const backing = new MemoryCache<string>();
    const adapter = {
      get: async (key: string) => backing.get(key),
      set: async (key: string, value: string, ttlMs: number) => backing.set(key, value, ttlMs),
      has: async (key: string) => backing.has(key),
      delete: async (key: string) => backing.delete(key),
      clear: async () => backing.clear(),
      destroy: async () => backing.destroy(),
    } satisfies AsyncCacheStore<string>;

    await adapter.set("k", "v", 60_000);
    await expect(adapter.get("k")).resolves.toBe("v");
    await adapter.destroy();
  });
});
