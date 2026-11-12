/**
 * listLatestScansByProject maps the `latest_scans_for_projects` rows (migration
 * 0085). Pinned: the tenant reaches the RPC, terminal scans carry their finding
 * counts like listScans, and a stale running scan is reconciled and re-read.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const scanRow = (id: string, status: string) => ({
  id, organization_id: "org-1", project_id: "p1", connection_id: "c", repo: "a/b", branch: "main",
  status, summary: {}, commit_sha: "", commit_message: "", commit_author: "", commit_date: null,
  created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-01T00:00:00.000Z",
});

const rpc = vi.fn();
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("../worker.js", () => ({ enqueueScan: vi.fn() }));
vi.mock("../scan-progress.js", () => ({ persistScanProgress: vi.fn() }));
const reconcile = vi.fn();
vi.mock("../scan-reconcile.js", () => ({ reconcileStaleScanById: (id: string) => reconcile(id) }));
vi.mock("../findings.js", () => ({
  getSecurityFindingCounts: vi.fn(),
  countDistinctFindingFiles: vi.fn(),
  getSecurityFindingCountsForScans: async (ids: string[]) =>
    new Map(ids.map((id) => [id, { total: 7, errors: 1, warnings: 2, infos: 4 }])),
}));

const { listLatestScansByProject } = await import("../scans.js");

beforeEach(() => vi.clearAllMocks());

describe("listLatestScansByProject", () => {
  it("passes the tenant, maps both scans and adds finding counts", async () => {
    rpc.mockResolvedValue({
      data: [
        { project_id: "p1", scan_count: 3, latest: scanRow("s2", "failed"), latest_completed: scanRow("s1", "completed") },
        { project_id: "p2", scan_count: 0, latest: null, latest_completed: null },
      ],
      error: null,
    });

    const res = await listLatestScansByProject("org-1", ["p1", "p2"]);

    expect(rpc).toHaveBeenCalledWith("latest_scans_for_projects", { p_organization_id: "org-1", p_project_ids: ["p1", "p2"] });
    expect(res[0]).toMatchObject({ projectId: "p1", scanCount: 3, latest: { id: "s2" }, latestCompleted: { id: "s1" } });
    expect(res[0]?.latestCompleted?.summary.totalFindings).toBe(7);
    expect(res[1]).toEqual({ projectId: "p2", scanCount: 0, latest: null, latestCompleted: null });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("reconciles a stale running scan and re-reads", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ project_id: "p1", scan_count: 1, latest: scanRow("s1", "running"), latest_completed: null }], error: null })
      .mockResolvedValueOnce({ data: [{ project_id: "p1", scan_count: 1, latest: scanRow("s1", "failed"), latest_completed: null }], error: null });
    reconcile.mockResolvedValue(true);

    const res = await listLatestScansByProject("org-1", ["p1"]);

    expect(reconcile).toHaveBeenCalledWith("s1");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(res[0]?.latest?.status).toBe("failed");
  });
});
