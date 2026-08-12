import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVALIDATE_AFTER_MS,
  clearFaviconCache,
  isFaviconCacheFresh,
  readCachedFavicon,
  readCachedFavicons,
  writeCachedFavicon,
} from "../utils/faviconCache";

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

describe("faviconCache", () => {
  beforeEach(() => {
    installMemoryStorage();
    clearFaviconCache();
  });

  it("round-trips a favicon with the deploy it was resolved against", () => {
    writeCachedFavicon("repo:main:conn::", { favicon: "data:image/svg+xml,<svg/>", deployId: "deploy-1" });
    const entry = readCachedFavicon("repo:main:conn::");
    expect(entry?.favicon).toBe("data:image/svg+xml,<svg/>");
    expect(entry?.deployId).toBe("deploy-1");
  });

  it("caches a known-absent favicon so it isn't re-requested", () => {
    writeCachedFavicon("repo:main:conn::", { favicon: undefined, deployId: null });
    const entry = readCachedFavicon("repo:main:conn::");
    expect(entry).toBeDefined();
    expect(entry?.favicon).toBeUndefined();
    expect(isFaviconCacheFresh(entry)).toBe(true);
  });

  it("reads many keys in one pass and skips misses", () => {
    writeCachedFavicon("a", { favicon: "data:image/png;base64,iVBORw0KGgo=", deployId: null });
    const result = readCachedFavicons(["a", "b"]);
    expect(Object.keys(result)).toEqual(["a"]);
  });

  it("treats an entry as stale once past the revalidate window", () => {
    const now = Date.now();
    expect(isFaviconCacheFresh({ favicon: undefined, deployId: null, at: now }, now)).toBe(true);
    expect(
      isFaviconCacheFresh({ favicon: undefined, deployId: null, at: now - REVALIDATE_AFTER_MS - 1 }, now),
    ).toBe(false);
    expect(isFaviconCacheFresh(undefined)).toBe(false);
  });

  it("survives unavailable storage instead of throwing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    });
    expect(() => writeCachedFavicon("a", { favicon: undefined, deployId: null })).not.toThrow();
    expect(readCachedFavicon("a")).toBeUndefined();
  });

  it("ignores corrupt stored JSON", () => {
    localStorage.setItem("dockier:repo-favicons:v1", "{not json");
    expect(readCachedFavicon("a")).toBeUndefined();
  });
});
