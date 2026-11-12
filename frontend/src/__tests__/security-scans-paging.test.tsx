import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * The page used to join the tenant's newest 20 projects with its newest 20 scans:
 * a 21st project vanished, and an old project's scans fell off the scan page so it
 * read as never scanned. Now the page's projects get their scans in one request.
 */
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useProjectBadges", () => ({ useProjectBadges: () => ({ badges: {}, loadingIds: new Set() }) }));

const api = vi.hoisted(() => ({ list: vi.fn(), latestScans: vi.fn() }));
vi.mock("@/services/api", () => ({
  projectsApi: { list: api.list },
  codeAnalysisApi: { latestScans: api.latestScans },
}));

const { useSecurityScans } = await import("../pages/SecurityScans/useSecurityScans");

describe("useSecurityScans", () => {
  it("pages by project and counts each project's scans from its own total", async () => {
    api.list.mockResolvedValue({
      projects: [{ id: "old", name: "Old" }, { id: "never", name: "Never" }],
      pagination: { total: 45, limit: 20, offset: 0 },
    });
    const s1 = { id: "s1", projectId: "old", status: "completed", updatedAt: "2025-01-01T00:00:00Z" };
    // "never" is missing from the response on purpose: it must still render, with 0 scans.
    api.latestScans.mockResolvedValue({
      projects: [{ projectId: "old", scanCount: 31, latest: s1, latestCompleted: s1 }],
    });

    const { result } = renderHook(() => useSecurityScans());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.list).toHaveBeenCalledWith({ limit: 20, offset: 0, search: undefined });
    expect(api.latestScans).toHaveBeenCalledTimes(1);
    expect(api.latestScans).toHaveBeenCalledWith(["old", "never"]);
    expect(result.current.pagination.total).toBe(45);
    expect(result.current.scanCounts).toEqual({ old: 31, never: 0 });
    // latest and latestCompleted are the same scan here: listed once, not twice.
    expect(result.current.grouped.old).toHaveLength(1);
    expect(result.current.grouped.old?.[0]?.id).toBe("s1");
    expect(result.current.sortedProjectIds).toEqual(["old", "never"]);
  });
});
