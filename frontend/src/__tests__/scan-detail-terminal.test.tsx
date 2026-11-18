import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

/**
 * When a scan finishes, the hook refreshes it from the API. That refresh had no
 * check that the URL still pointed at the same scan, so opening another scan
 * while it was in flight put the old one back on screen. It also fetched the
 * findings a second time, which cleared the list behind a spinner and refilled it.
 */
const params = vi.hoisted(() => ({ current: { scanId: "A" } as { scanId?: string } }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useParams: () => params.current,
  useNavigate: () => navigate,
}));

/** Live state per scan id, as the progress context would report it. */
const live = vi.hoisted(() => ({ byId: {} as Record<string, unknown> }));
const progress = vi.hoisted(() => ({
  seedFromScan: vi.fn(),
  setOptimisticRunning: vi.fn(),
  clearScanState: vi.fn(),
  trackScan: vi.fn(),
}));
vi.mock("@/context/ScanProgressContext", () => ({
  useScanProgress: () => progress,
  useScanLiveState: (id: string | undefined) => (id ? live.byId[id] : undefined),
}));
vi.mock("@/context/useToast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));

const api = vi.hoisted(() => ({
  codeAnalysisApi: { getScan: vi.fn(), listFindings: vi.fn(), listScans: vi.fn() },
  projectsApi: { get: vi.fn() },
  gitApi: { getFileContent: vi.fn() },
}));
vi.mock("@/services/api", () => api);

const { useScanDetail } = await import("../pages/ScanDetail/useScanDetail");

const summary = { errors: 0, warnings: 0, infos: 0, totalFindings: 0, filesScanned: 1, filesInRepo: 1 };
const scan = (id: string, status: string) => ({ id, projectId: "p1", status, summary });

beforeEach(() => {
  vi.clearAllMocks();
  params.current = { scanId: "A" };
  live.byId = {};
  api.codeAnalysisApi.listFindings.mockResolvedValue({ findings: [], counts: null, hasMore: false });
  api.codeAnalysisApi.listScans.mockResolvedValue({ scans: [] });
  api.projectsApi.get.mockResolvedValue({ id: "p1", repository: "o/r", connectionId: "c1", branch: "main" });
});

describe("useScanDetail when a scan finishes", () => {
  it("does not put the finished scan back after the user opened another one", async () => {
    let resolveRefresh!: (s: unknown) => void;
    let callsForA = 0;
    api.codeAnalysisApi.getScan.mockImplementation((id: string) => {
      if (id === "B") return Promise.resolve(scan("B", "completed"));
      callsForA += 1;
      // First load: running. The refresh after it finishes: held open.
      return callsForA === 1 ? Promise.resolve(scan("A", "running")) : new Promise((res) => { resolveRefresh = res; });
    });

    const { result, rerender } = renderHook(() => useScanDetail());
    await waitFor(() => expect(result.current.scan?.status).toBe("running"));

    live.byId.A = { status: "completed" };
    rerender();
    await waitFor(() => expect(callsForA).toBe(2));

    params.current = { scanId: "B" };
    rerender();
    await waitFor(() => expect(result.current.scan?.id).toBe("B"));

    await act(async () => {
      resolveRefresh(scan("A", "completed"));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.scan?.id).toBe("B");
  });

  it("loads the findings once when the scan completes", async () => {
    api.codeAnalysisApi.getScan
      .mockResolvedValueOnce(scan("A", "running"))
      .mockResolvedValue(scan("A", "completed"));

    const { result, rerender } = renderHook(() => useScanDetail());
    await waitFor(() => expect(result.current.scan?.status).toBe("running"));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const before = api.codeAnalysisApi.listFindings.mock.calls.length;

    live.byId.A = { status: "completed", summary };
    rerender();
    await waitFor(() => expect(api.codeAnalysisApi.listFindings.mock.calls.length).toBeGreaterThan(before));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(api.codeAnalysisApi.listFindings.mock.calls.length - before).toBe(1);
  });
});
