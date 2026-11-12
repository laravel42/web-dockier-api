import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * The KPIs used to count the newest page (20 by default) and present it as the
 * tenant total. They must come from `pagination.total` and the status-filtered counts.
 */
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

const page = <T,>(key: string, rows: T[], total: number) => ({ [key]: rows, pagination: { total, limit: 20, offset: 0 } });
const listDeployments = vi.hoisted(() => vi.fn());
vi.mock("@/services/api", () => ({
  projectsApi: { list: () => Promise.resolve(page("projects", [{ id: "p1" }], 42)) },
  codeAnalysisApi: { listScans: () => Promise.resolve(page("scans", [], 77)) },
  deployApi: { listDeployments, listProviders: () => Promise.resolve({ providers: [] }) },
}));

const { useDashboard } = await import("../pages/Dashboard/useDashboard");

describe("useDashboard totals", () => {
  it("reports tenant totals, not the length of the first page", async () => {
    listDeployments.mockImplementation((params?: { status?: string }) =>
      Promise.resolve(page("deployments", [{ id: "d1", status: "failed" }], params?.status === "success" ? 30 : params?.status === "failed" ? 9 : 50)),
    );

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totals).toEqual({ projects: 42, deploys: 50, successDeploys: 30, failedDeploys: 9, scans: 77 });
    expect(listDeployments).toHaveBeenCalledWith({ status: "success", limit: 1 });
  });
});
