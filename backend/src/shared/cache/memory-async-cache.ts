/**
 * In-Memory Async Cache Adapter
 *
 * Implements `AsyncCacheStore` on top of the synchronous `MemoryCache`.
 *
 * Why this exists: consumers that live in async contexts should program
 * against the async contract even while the backing store is in-process.
 * A distributed implementation (Redis) can then be dropped in behind the
 * same interface without touching a single call site — which is exactly
 * the migration the sync `CacheStore` consumers (rate limiter, permission
 * resolver) would have to pay for.
 *
 * Constraints for consumers, so a Redis swap stays mechanical:
 *   - Values MUST be JSON-serializable. No Map, Set, Date, or class
 *     instances — those survive an in-process Map and silently degrade
 *     over the wire.
 *   - Prefer TTL-only semantics. Keys derived from immutable inputs never
 *     need coordinated invalidation across instances.
 */

import type { AsyncCacheStore } from "./cache-store.js";
import { MemoryCache, type MemoryCacheOptions } from "./memory-cache.js";

export class MemoryAsyncCache<V> implements AsyncCacheStore<V> {
  private readonly inner: MemoryCache<V>;

  constructor(opts: MemoryCacheOptions = {}) {
    this.inner = new MemoryCache<V>(opts);
  }

  async get(key: string): Promise<V | undefined> {
    return this.inner.get(key);
  }

  async set(key: string, value: V, ttlMs: number): Promise<void> {
    this.inner.set(key, value, ttlMs);
  }

  async has(key: string): Promise<boolean> {
    return this.inner.has(key);
  }

  async delete(key: string): Promise<void> {
    this.inner.delete(key);
  }

  async clear(): Promise<void> {
    this.inner.clear();
  }

  async destroy(): Promise<void> {
    this.inner.destroy();
  }

  /** Current entry count. Test/diagnostics helper — not part of the contract. */
  get size(): number {
    return this.inner.size;
  }
}
