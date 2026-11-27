import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { SessionCache } from "@/pages/ProjectDetail/utils/sessionCache";

/**
 * The repo analysis is cached here. Without the expiry the entry lived as long
 * as the tab, so a project detail page kept showing the stack the repo had when
 * the tab was opened even after the server re-analysed a newer commit.
 */
describe("SessionCache", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("round-trips a value", () => {
    const cache = new SessionCache<{ n: number }>("t", 1);
    cache.set("k", { n: 1 });
    expect(cache.get("k")).toEqual({ n: 1 });
  });

  it("serves an entry inside its TTL and drops it after", () => {
    vi.useFakeTimers();
    const cache = new SessionCache<string>("t", 1, 60_000);
    cache.set("k", "cached");

    vi.advanceTimersByTime(59_000);
    expect(cache.get("k")).toBe("cached");

    vi.advanceTimersByTime(2_000);
    expect(cache.get("k")).toBeNull();
    // Dropped on read, not just hidden, so an abandoned key leaves storage.
    expect(sessionStorage.getItem("t:v1:k")).toBeNull();
  });

  it("keeps an entry forever when no TTL is given", () => {
    vi.useFakeTimers();
    const cache = new SessionCache<string>("t", 1);
    cache.set("k", "cached");
    vi.advanceTimersByTime(30 * 24 * 60 * 60_000);
    expect(cache.get("k")).toBe("cached");
  });

  it("isolates versions and namespaces", () => {
    new SessionCache<string>("t", 1).set("k", "old");
    expect(new SessionCache<string>("t", 2).get("k")).toBeNull();
    expect(new SessionCache<string>("other", 1).get("k")).toBeNull();
  });

  it("returns null for an unparseable entry instead of throwing", () => {
    sessionStorage.setItem("t:v1:k", "{not json");
    expect(new SessionCache<string>("t", 1).get("k")).toBeNull();
  });
});
