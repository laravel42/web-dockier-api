/**
 * Generic versioned session-storage cache.
 *
 * Provides typed get/set/remove operations with automatic JSON serialization,
 * quota-exceeded safety, and a version prefix so cache entries are invalidated
 * when the schema changes (just bump the version number).
 *
 * Usage:
 * ```ts
 * const analysisCache = new SessionCache<RepoAnalysis>("analysis", 11);
 * analysisCache.set("owner/repo:main", data);
 * const cached = analysisCache.get("owner/repo:main");
 * analysisCache.remove("owner/repo:main");
 * ```
 */
export class SessionCache<T> {
  private readonly prefix: string;

  constructor(namespace: string, version: number) {
    this.prefix = `${namespace}:v${version}:`;
  }

  /** Retrieve a cached value by key. Returns null if missing or unparseable. */
  get(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(this.prefix + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  /** Store a value. Silently ignores quota-exceeded errors. */
  set(key: string, data: T): void {
    try {
      sessionStorage.setItem(this.prefix + key, JSON.stringify(data));
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
