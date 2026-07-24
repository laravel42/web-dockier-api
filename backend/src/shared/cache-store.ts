/**
 * Cache Store Interface
 *
 * Abstract contract for key-value caches with TTL support.
 * Consumers program against this interface so the underlying
 * implementation can be swapped without changing call sites.
 *
 * Current implementations:
 *   - MemoryCache (in-process Map, suitable for single-instance)
 *
 * Future implementations:
 *   - RedisCacheStore (distributed, suitable for multi-instance)
 *
 * Design notes:
 *   - All methods are synchronous or return void for simplicity.
 *     A Redis adapter would need to make get() async — when that
 *     happens, introduce AsyncCacheStore as a separate interface
 *     rather than breaking the sync contract. The permission resolver
 *     and rate limiter already operate in async contexts so the
 *     migration would be mechanical.
 *   - The interface deliberately omits implementation details like
 *     maxSize, sweep intervals, and eviction policy — those are
 *     constructor concerns for each implementation.
 */

/**
 * Synchronous cache store contract.
 *
 * Suitable for in-memory implementations where get/set are O(1).
 * Use this for the rate limiter, permission cache, and any new
 * cache consumers that need sub-millisecond access.
 */
export interface CacheStore<V> {
  /** Get a cached value. Returns undefined if missing or expired. */
  get(key: string): V | undefined;

  /** Set a value with a TTL in milliseconds. */
  set(key: string, value: V, ttlMs: number): void;

  /** Check if a key exists and is not expired. */
  has(key: string): boolean;

  /** Delete a specific key. */
  delete(key: string): void;

  /** Clear all entries. */
  clear(): void;

  /** Stop background timers and release resources. Cache remains usable after. */
  destroy(): void;
}

/**
 * Async cache store contract.
 *
 * For distributed implementations (Redis, Memcached) where operations
 * involve network I/O. When a Redis adapter is implemented, consumers
 * that can tolerate async access should switch to this interface.
 */
export interface AsyncCacheStore<V> {
  /** Get a cached value. Returns undefined if missing or expired. */
  get(key: string): Promise<V | undefined>;

  /** Set a value with a TTL in milliseconds. */
  set(key: string, value: V, ttlMs: number): Promise<void>;

  /** Check if a key exists and is not expired. */
  has(key: string): Promise<boolean>;

  /** Delete a specific key. */
  delete(key: string): Promise<void>;

  /** Clear all entries. */
  clear(): Promise<void>;

  /** Stop background timers, close connections, and release resources. */
  destroy(): Promise<void>;
}
