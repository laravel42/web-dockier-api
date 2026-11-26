import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * The list pages used to call the per-project badge route once per project.
 * That route analyses the repo on a cache miss and is capped at 30/min per
 * tenant, so a page of 50 lost most of its badges to a 429 the hook swallowed.
 * These cover the two things the batch version must get right.
 */
const getRepoBadgesBatch = vi.fn();

vi.mock("../services/api", () => ({
  gitApi: {
    getRepoBadgesBatch: (...args: unknown[]) => getRepoBadgesBatch(...args),
  },
}));

const { useProjectBadges } = await import("../hooks/useProjectBadges");

const project = (id: string, repository: string, branch = "main") => ({
  id,
  repository,
  branch,
  connectionId: "conn-1",
});

beforeEach(() => {
  localStorage.clear();
  getRepoBadgesBatch.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe("useProjectBadges", () => {
  it("asks for every project in a single request", async () => {
    getRepoBadgesBatch.mockResolvedValue({ results: [] });
    const projects = Array.from({ length: 30 }, (_, i) =>
      project(`p${i}`, `https://github.com/acme/repo-${i}`),
    );

    renderHook(() => useProjectBadges(projects));

    await waitFor(() => expect(getRepoBadgesBatch).toHaveBeenCalledTimes(1));
    expect(getRepoBadgesBatch.mock.calls[0]![0]).toHaveLength(30);
  });

  it("does not cache a repo the batch had nothing for", async () => {
    // Absent from `results` means "not analysed yet", not "no technologies".
    // Caching it empty would hide the badges for as long as the cache lives.
    getRepoBadgesBatch.mockResolvedValue({ results: [] });
    const projects = [project("p1", "https://github.com/acme/site")];

    const { unmount } = renderHook(() => useProjectBadges(projects));
    await waitFor(() => expect(getRepoBadgesBatch).toHaveBeenCalledTimes(1));
    unmount();

    expect(
      Object.keys(localStorage).filter((k) => k.startsWith("project-badges:")),
    ).toEqual([]);

    // A later mount tries again rather than trusting an empty answer.
    renderHook(() => useProjectBadges(projects));
    await waitFor(() => expect(getRepoBadgesBatch).toHaveBeenCalledTimes(2));
  });

  it("fans one repo's answer out to every project sharing it", async () => {
    getRepoBadgesBatch.mockResolvedValue({
      results: [
        {
          repo: "acme/site",
          branch: "main",
          badges: [{ name: "Laravel", category: "framework", confidence: 95 }],
        },
      ],
    });
    const projects = [
      project("p1", "https://github.com/acme/site"),
      project("p2", "git@github.com:acme/site.git"),
    ];

    const { result } = renderHook(() => useProjectBadges(projects));

    await waitFor(() => expect(result.current.badges.p1).toBeDefined());
    // Both point at acme/site@main, so the pair is requested once...
    expect(getRepoBadgesBatch.mock.calls[0]![0]).toHaveLength(1);
    // ...and both get the answer. Keying the request by project would have
    // dropped whichever was seen first.
    expect(result.current.badges.p1?.[0]?.name).toBe("Laravel");
    expect(result.current.badges.p2?.[0]?.name).toBe("Laravel");
  });
});
