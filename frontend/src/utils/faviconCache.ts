/**
 * Persistent cache for repository favicons.
 *
 * Without this, every project avatar lazy-loads: the letter fallback paints
 * first and the real icon pops in a round trip later, on every visit. Favicons
 * only change when the project deploys, so they are worth holding on the client.
 *
 * The server resolves against the latest successful deploy and returns that
 * `deployId`, so entries are keyed the same way the server invalidates. A cached
 * entry is read synchronously during render, which is what removes the pop-in;
 * revalidation happens quietly afterwards.
 */

const STORAGE_KEY = "dockier:repo-favicons:v1";

/** Entries are small but data URLs are not free; keep the store bounded. */
const MAX_ENTRIES = 200;

/**
 * How long a cached favicon is trusted without asking again. Inside this window
 * no request is made at all, which also keeps large project lists clear of the
 * endpoint's per-tenant rate limit. Past it the cached icon still paints
 * immediately and is revalidated in the background.
 */
export const REVALIDATE_AFTER_MS = 10 * 60 * 1000;

export interface CachedFavicon {
  favicon: string | undefined;
  /** Successful deploy the icon was resolved against; null when never deployed. */
  deployId: string | null;
  /** Epoch ms this entry was written. */
  at: number;
}

type CacheShape = Record<string, CachedFavicon>;

function readStore(): CacheShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CacheShape) : {};
  } catch {
    // Private mode, disabled storage, or corrupt JSON — behave as a cold cache.
    return {};
  }
}

function writeStore(store: CacheShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded or storage unavailable. The cache is an optimisation, so
    // dropping the write is preferable to breaking the render.
  }
}

export function readCachedFavicon(fetchKey: string): CachedFavicon | undefined {
  return readStore()[fetchKey];
}

/** Read many at once so a list render costs a single storage parse. */
export function readCachedFavicons(fetchKeys: string[]): Record<string, CachedFavicon> {
  const store = readStore();
  const result: Record<string, CachedFavicon> = {};
  for (const key of fetchKeys) {
    const entry = store[key];
    if (entry) result[key] = entry;
  }
  return result;
}

export function writeCachedFavicon(fetchKey: string, entry: Omit<CachedFavicon, "at">): void {
  const store = readStore();
  store[fetchKey] = { ...entry, at: Date.now() };

  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    // Evict oldest first; these are icons, so losing one costs a refetch.
    const ordered = keys.sort((a, b) => (store[a]?.at ?? 0) - (store[b]?.at ?? 0));
    for (const key of ordered.slice(0, keys.length - MAX_ENTRIES)) delete store[key];
  }

  writeStore(store);
}

/** True when the entry is recent enough to skip the network entirely. */
export function isFaviconCacheFresh(entry: CachedFavicon | undefined, now = Date.now()): boolean {
  if (!entry) return false;
  return now - entry.at < REVALIDATE_AFTER_MS;
}

export function clearFaviconCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the cache is best-effort.
  }
}
