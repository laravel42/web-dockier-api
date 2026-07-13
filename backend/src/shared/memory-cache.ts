/**
 * Generic In-Memory TTL Cache
 *
 * A lightweight cache backed by a Map with:
 * - Per-entry TTL (time-to-live)
 * - Max size with oldest-entry eviction
 * - Periodic sweep to remove expired entries
 *
 * Used by the permission resolver and rate limiter to avoid
 * duplicating the same store/sweep/evict logic.
 *
 * For horizontal scaling, replace with a Redis-backed implementation.
 */

export interface MemoryCacheOptions {
  /** Maximum number of entries before eviction. Default: 5000 */
  maxSize?: number;
  /** Sweep interval in ms to remove expired entries. Default: 60000 (1 min) */
  sweepIntervalMs?: number;
}

export class MemoryCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private readonly maxSize: number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sweepIntervalMs: number;

  constructor(opts: MemoryCacheOptions = {}) {
    this.maxSize = opts.maxSize ?? 5_000;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? 60_000;
  }

  /**
   * Get a cached value. Returns undefined if missing or expired.
   */
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Set a value with a TTL in milliseconds.
   */
  set(key: string, value: V, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.evictIfNeeded();
    this.ensureSweep();
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Current number of entries (including potentially expired ones not yet swept).
   */
  get size(): number {
    return this.store.size;
  }

  // ─── Internal ────────────────────────────────────────────────────

  /**
   * Evict oldest entries when the store exceeds maxSize.
   * Map iteration order is insertion order, so the first entries are oldest.
   */
  private evictIfNeeded(): void {
    if (this.store.size <= this.maxSize) return;
    const excess = this.store.size - this.maxSize;
    let removed = 0;
    for (const key of this.store.keys()) {
      if (removed >= excess) break;
      this.store.delete(key);
      removed++;
    }
  }

  /**
   * Start the periodic sweep timer if not already running.
   */
  private ensureSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (entry.expiresAt <= now) this.store.delete(key);
      }
    }, this.sweepIntervalMs);
    // Allow Node to exit even if this timer is running
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }
}
