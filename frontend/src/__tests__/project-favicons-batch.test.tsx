import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * The list page asked the per-repo favicon route once per project against a
 * 30/min cap, so a page past 30 lost its avatars to a 429. The batch route
 * answers a whole page in one call, but it resolves only a few misses per call,
 * so "absent from the response" is a normal outcome and must not be cached.
 */
const getRepoFaviconsBatch = vi.fn();

vi.mock("../services/api", () => ({
  gitApi: {
    getRepoFaviconsBatch: (...args: unknown[]) => getRepoFaviconsBatch(...args),
  },
}));

const { useProjectRepoFavicons } = await import("../hooks/useProjectRepoFavicon");

const project = (id: string, repository: string) => ({
  id,
  repository,
  branch: "main",
  connectionId: "conn-1",
});

const storedKeys = () =>
  Object.keys(JSON.parse(localStorage.getItem("dockier:repo-favicons:v1") ?? "{}"));

beforeEach(() => {
  localStorage.clear();
  getRepoFaviconsBatch.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe("useProjectRepoFavicons", () => {
  it("asks for every project in a single request", async () => {
    getRepoFaviconsBatch.mockResolvedValue({ results: [] });
    const projects = Array.from({ length: 30 }, (_, i) =>
      project(`p${i}`, `https://github.com/acme/repo-${i}`),
    );

    renderHook(() => useProjectRepoFavicons(projects));

    await waitFor(() => expect(getRepoFaviconsBatch).toHaveBeenCalledTimes(1));
    expect(getRepoFaviconsBatch.mock.calls[0]![0]).toHaveLength(30);
  });

  it("does not cache a repo the route did not get to", async () => {
    // The route caps how many misses it resolves, so absent means "not yet",
    // not "no icon". Caching it would keep the avatar blank for the whole
    // revalidation window.
    getRepoFaviconsBatch.mockResolvedValue({ results: [] });
    const projects = [project("p1", "https://github.com/acme/site")];

    const { unmount } = renderHook(() => useProjectRepoFavicons(projects));
    await waitFor(() => expect(getRepoFaviconsBatch).toHaveBeenCalledTimes(1));
    expect(storedKeys()).toEqual([]);
    unmount();

    renderHook(() => useProjectRepoFavicons(projects));
    await waitFor(() => expect(getRepoFaviconsBatch).toHaveBeenCalledTimes(2));
  });

  it("caches and returns an icon the route did resolve", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    getRepoFaviconsBatch.mockResolvedValue({
      results: [{ repo: "acme/site", branch: "main", favicon: dataUrl, deployId: "d1" }],
    });
    const projects = [project("p1", "https://github.com/acme/site")];

    const { result } = renderHook(() => useProjectRepoFavicons(projects));

    await waitFor(() => expect(result.current.favicons.p1).toBe(dataUrl));
    expect(storedKeys()).toHaveLength(1);
  });
});
