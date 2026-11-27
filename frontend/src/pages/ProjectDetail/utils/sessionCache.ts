/**
 * Generic versioned session-storage cache.
 *
 * Provides typed get/set/remove operations with automatic JSON serialization,
 * quota-exceeded safety, and a version prefix so cache entries are invalidated
 * when the schema changes (just bump the version number).
 *
 * An optional `ttlMs` expires entries by age. Without one an entry lives as
 * long as the tab, which pins data that the server can refresh underneath it.
 *
 * Usage:
 * ```ts
 * const analysisCache = new SessionCache<RepoAnalysis>("analysis", 11, 120_000);
 * analysisCache.set("owner/repo:main", data);
 * const cached = analysisCache.get("owner/repo:main");
 * analysisCache.remove("owner/repo:main");
 * ```
 */
interface Entry<T> {
  at: number;
  data: T;
}

export class SessionCache<T> {
  private readonly prefix: string;
  private readonly ttlMs?: number;

  constructor(namespace: string, version: number, ttlMs?: number) {
    this.prefix = `${namespace}:v${version}:`;
    this.ttlMs = ttlMs;
  }

  /**
   * Retrieve a cached value by key. Returns null if missing, unparseable, or
   * older than `ttlMs`. An expired entry is dropped on the way out, so a key
   * that is never written again does not sit in storage forever.
   */
  get(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(this.prefix + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as Entry<T>;
      if (this.ttlMs !== undefined && Date.now() - entry.at > this.ttlMs) {
        this.remove(key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  /** Store a value. Silently ignores quota-exceeded errors. */
  set(key: string, data: T): void {
    try {
      sessionStorage.setItem(this.prefix + key, JSON.stringify({ at: Date.now(), data } satisfies Entry<T>));
    } catch {
      // quota exceeded — ignore
    }
  }

  /** Remove a single cache entry by key. */
  remove(key: string): void {
    try {
      sessionStorage.removeItem(this.prefix + key);
    } catch {
      // ignore
    }
  }

  /**
   * Remove all entries that belong to this cache (same namespace + version).
   * Useful for full cache invalidation.
   */
  clear(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(this.prefix)) keysToRemove.push(k);
      }
      for (const k of keysToRemove) sessionStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}
