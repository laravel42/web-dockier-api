import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * Switching scans while the first is still loading. The slow response for the
 * old scan used to land last, leaving `scan` on a record unrelated to the URL
 * with nothing left to refetch it.
 */
const params = vi.hoisted(() => ({ current: { scanId: "A" } as { scanId?: string; projectId?: string } }));
// Stable like the real hook: a fresh fn per render re-runs the load effect and hides the race.
const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useParams: () => params.current,
  useNavigate: () => navigate,
}));

const progress = vi.hoisted(() => ({
  seedFromScan: vi.fn(),
  setOptimisticRunning: vi.fn(),
  clearScanState: vi.fn(),
  trackScan: vi.fn(),
}));
vi.mock("@/context/ScanProgressContext", () => ({
  useScanProgress: () => progress,
  useScanLiveState: () => undefined,
}));
vi.mock("@/context/useToast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));

const api = vi.hoisted(() => ({
  codeAnalysisApi: {
    getScan: vi.fn(),
    listFindings: vi.fn(),
    listScans: vi.fn(),
  },
  projectsApi: { get: vi.fn() },
  gitApi: { getFileContent: vi.fn() },
}));
vi.mock("@/services/api", () => api);

const { useScanDetail } = await import("../pages/ScanDetail/useScanDetail");

const scan = (id: string) => ({ id, projectId: "p1", status: "completed", summary: { errors: 0, warnings: 0, infos: 0, totalFindings: 0 } });

describe("useScanDetail scan switching", () => {
  it("ignores the old scan's late response", async () => {
    let resolveA!: (s: unknown) => void;
    api.codeAnalysisApi.getScan.mockImplementation((id: string) =>
      id === "A" ? new Promise((res) => { resolveA = res; }) : Promise.resolve(scan("B")),
    );
    api.codeAnalysisApi.listFindings.mockResolvedValue({ findings: [], counts: null, hasMore: false });
    api.codeAnalysisApi.listScans.mockResolvedValue({ scans: [] });
    api.projectsApi.get.mockResolvedValue({ id: "p1", repository: "o/r", connectionId: "c1", branch: "main" });

    const { result, rerender } = renderHook(() => useScanDetail());
    params.current = { scanId: "B" };
    rerender();
    await waitFor(() => expect(result.current.scan?.id).toBe("B"));

    resolveA(scan("A"));
    await new Promise((r) => setTimeout(r, 20));

    expect(result.current.scan?.id).toBe("B");
    expect(result.current.loading).toBe(false);
  });
});
