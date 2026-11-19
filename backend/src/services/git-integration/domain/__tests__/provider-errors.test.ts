import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRepoFile, getRepoFileTree, type ConnectionLike } from "../providers/provider-client.js";
import { countListItems } from "../providers/github-client.js";
import { cacheFreshSince, CACHE_TTL_MS } from "../cache.js";

vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: {} }));

function res(status: number, body: unknown = [], headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
const github: ConnectionLike = { provider: "github", personal_token: "t", endpoint: null };
const gitlab: ConnectionLike = { provider: "gitlab", personal_token: "t", endpoint: null };
const ref = { owner: "o", repo: "r", branch: "main" };

afterEach(() => vi.unstubAllGlobals());

describe("getRepoFileTree (GitLab)", () => {
  it("throws on a failed page instead of returning an empty tree", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(403, { message: "insufficient_scope" })));
    await expect(getRepoFileTree(gitlab, ref)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("throws when a later page fails, rather than returning the partial tree", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ path: `f${i}`, type: "blob" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(200, full)).mockResolvedValueOnce(res(429)));
    await expect(getRepoFileTree(gitlab, ref)).rejects.toMatchObject({ code: "too_many_requests" });
  });
});

describe("fetchRepoFile", () => {
  it("is null for a missing file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(404)));
    await expect(fetchRepoFile(github, ref, "package.json")).resolves.toBeNull();
  });
  it("throws on a rate limit instead of reading as a missing file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(429)));
    await expect(fetchRepoFile(github, ref, "package.json")).rejects.toMatchObject({ code: "too_many_requests" });
  });
});

describe("countListItems", () => {
  it("reads the total from the last page link", async () => {
    const link = '<https://api.github.com/repositories/1/commits?sha=main&per_page=1&page=2>; rel="next", ' +
      '<https://api.github.com/repositories/1/commits?sha=main&per_page=1&page=1234>; rel="last"';
    const fetchMock = vi.fn().mockResolvedValue(res(200, [{}], { link }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(countListItems(github, "/repos/o/r/commits?sha=main")).resolves.toBe(1234);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("per_page=1");
  });
  it("counts the body when there is a single page, 0 for an empty repo, null on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(200, [{}])).mockResolvedValueOnce(res(204)).mockResolvedValueOnce(res(500)));
    await expect(countListItems(github, "/repos/o/r/contributors")).resolves.toBe(1);
    await expect(countListItems(github, "/repos/o/r/contributors")).resolves.toBe(0);
    await expect(countListItems(github, "/repos/o/r/contributors")).resolves.toBeNull();
  });
});

describe("cacheFreshSince", () => {
  it("is the TTL before now", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(cacheFreshSince("stats_cache", now)).toBe(new Date(now - CACHE_TTL_MS.stats_cache).toISOString());
  });
});

describe("fetchRepoFile size cap", () => {
  it("treats a file over the cap as missing, even without a content-length", async () => {
    const { MAX_REPO_FILE_BYTES } = await import("../providers/provider-client.js");
    const big = new Uint8Array(MAX_REPO_FILE_BYTES + 1);
    const stream = new ReadableStream({ start(c) { c.enqueue(big); c.close(); } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));
    await expect(fetchRepoFile(github, ref, "big.bin")).resolves.toBeNull();
  });
  it("reads a file under the cap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("hello", { status: 200 })));
    await expect(fetchRepoFile(github, ref, "a.txt")).resolves.toBe("hello");
  });
});
