/**
 * runScan's status transition is the lock.
 *
 * Nothing else serializes a scan: the `security-scan` queue is created without
 * a policy, so it is `standard`, and pg-boss ignores `singletonKey` for
 * deduplication there. A status read before the write cannot do it either —
 * two concurrent runs both read the same non-running row and both pass. So the
 * conditional UPDATE is the only thing standing between one scan record and two
 * subprocesses racing in persistFindings(), which DELETEs by scan_id before
 * inserting.
 *
 * Pinned here: the run that gets 0 rows back from that UPDATE must refuse, and
 * must not enqueue.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** Result for the next terminal call on a chain, queued per operation. */
let selectResult: QueryResult = { data: null, error: null };
let updateResult: QueryResult = { data: null, error: null };
/** What a list select (no .single()) returns: the project's other running scans. */
let siblingsResult: QueryResult = { data: [], error: null };

function chainable(resolve: (single: boolean) => QueryResult): Record<string, unknown> {
  let single = false;
  const chain: Record<string, unknown> = {
    then: (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve(resolve(single)).then(onFulfilled),
  };
  for (const method of ["select", "eq", "neq", "in", "order", "range"]) {
    chain[method] = () => chain;
  }
  for (const method of ["single", "maybeSingle"]) {
    chain[method] = () => {
      single = true;
      return chain;
    };
  }
  return chain;
}

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => chainable((single) => (single ? selectResult : siblingsResult)),
      update: () => chainable(() => updateResult),
      insert: () => chainable(() => ({ data: null, error: null })),
      delete: () => chainable(() => ({ data: null, error: null })),
    }),
  },
}));

const enqueueScan = vi.fn(async () => {});
vi.mock("../worker.js", () => ({ enqueueScan }));

vi.mock("../scan-progress.js", () => ({
  persistScanProgress: vi.fn(async () => {}),
  broadcastScanStatus: vi.fn(),
  updateScanProgress: vi.fn(async () => {}),
}));

// The reconciler would itself read Supabase; it is not what this test is about.
vi.mock("../scan-reconcile.js", () => ({ reconcileStaleScanById: vi.fn(async () => false) }));

const { runScan, createScan, deleteScan, getScan, CodeAnalysisError } = await import("../scans.js");
const { reconcileStaleScanById } = await import("../scan-reconcile.js");

/** A scan row as PostgREST returns it. */
const scanRow = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "org-1",
  project_id: "proj-1",
  connection_id: "conn-1",
  repo: "acme/api",
  branch: "main",
  status: "pending",
  summary: {},
  commit_sha: "",
  created_at: "2026-11-04T00:00:00.000Z",
  updated_at: "2026-11-04T00:00:00.000Z",
};

beforeEach(() => {
  enqueueScan.mockClear();
  vi.mocked(reconcileStaleScanById).mockReset().mockResolvedValue(false);
  selectResult = { data: scanRow, error: null };
  siblingsResult = { data: [], error: null };
});

describe("runScan status transition", () => {
  it("enqueues when it wins the transition", async () => {
    updateResult = { data: { ...scanRow, status: "running" }, error: null };

    const scan = await runScan(scanRow.id, "org-1");

    expect(scan.status).toBe("running");
    expect(enqueueScan).toHaveBeenCalledTimes(1);
  });

  it("refuses and enqueues nothing when the UPDATE matches no row", async () => {
    // What `.neq("status", "running")` returns to the loser of the race, and
    // equally to a user clicking run on a scan that is already going.
    updateResult = { data: null, error: null };

    await expect(runScan(scanRow.id, "org-1")).rejects.toThrow(/already running/);
    await expect(runScan(scanRow.id, "org-1")).rejects.toBeInstanceOf(CodeAnalysisError);
    expect(enqueueScan).not.toHaveBeenCalled();
  });

  // Every "Run new scan" is a new row, so the per-row lock above cannot stop two
  // scans of one project; the unique index of migration 0089 does.
  it("refuses a second running scan of the same project, and enqueues nothing", async () => {
    updateResult = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    await expect(runScan(scanRow.id, "org-1")).rejects.toThrow(/already running/);
    expect(enqueueScan).not.toHaveBeenCalled();
  });

  it("first clears a sibling scan whose owner died, so it cannot block the project", async () => {
    siblingsResult = { data: [{ id: "old-scan" }], error: null };
    // The sibling was stale and is now failed; the target scan is not.
    vi.mocked(reconcileStaleScanById).mockImplementation(async (id) => id === "old-scan");
    updateResult = { data: { ...scanRow, status: "running" }, error: null };
    await runScan(scanRow.id, "org-1");
    expect(reconcileStaleScanById).toHaveBeenCalledWith("old-scan");
    expect(enqueueScan).toHaveBeenCalledTimes(1);
  });

  it("refuses while another scan of the project is alive", async () => {
    siblingsResult = { data: [{ id: "live-scan" }], error: null }; // reconcile: not stale
    updateResult = { data: { ...scanRow, status: "running" }, error: null };
    await expect(runScan(scanRow.id, "org-1")).rejects.toThrow(/already running/);
    expect(enqueueScan).not.toHaveBeenCalled();
  });

  it("rejects a scan belonging to another tenant before any write", async () => {
    updateResult = { data: { ...scanRow, status: "running" }, error: null };
    await expect(runScan(scanRow.id, "org-2")).rejects.toThrow(/Not your scan/);
    expect(enqueueScan).not.toHaveBeenCalled();
    // The stale-scan reconcile writes too: it used to run before this check.
    expect(reconcileStaleScanById).not.toHaveBeenCalled();
  });

  it("does not reconcile another tenant's scan when reading it", async () => {
    await expect(getScan(scanRow.id, "org-2")).rejects.toThrow(/Not your scan/);
    expect(reconcileStaleScanById).not.toHaveBeenCalled();
  });
});

describe("deleteScan", () => {
  // Deleting a running scan's row stopped nothing; its subprocess ran on.
  it("refuses to delete a scan that is still running", async () => {
    selectResult = { data: { ...scanRow, status: "running" }, error: null };
    await expect(deleteScan(scanRow.id, "org-1")).rejects.toThrow(/still running/);
  });

  it("deletes a running scan whose owner died, once it is marked failed", async () => {
    selectResult = { data: { ...scanRow, status: "running" }, error: null };
    vi.mocked(reconcileStaleScanById).mockResolvedValueOnce(true);
    await expect(deleteScan(scanRow.id, "org-1")).resolves.toBeUndefined();
  });
});

describe("createScan", () => {
  // Refused before a row exists: the UI creates then runs, and a refusal at run
  // time left an orphan pending scan plus a page stuck on "running".
  it("refuses to create a scan while the project has one running", async () => {
    siblingsResult = { data: [{ id: "live-scan" }], error: null };
    await expect(
      createScan({ tenantId: "org-1", projectId: "proj-1", connectionId: "conn-1", repo: "acme/api", branch: "main" }),
    ).rejects.toThrow(/already running/);
  });

  it("creates it when nothing is running", async () => {
    const scan = await createScan({ tenantId: "org-1", projectId: "proj-1", connectionId: "conn-1", repo: "acme/api", branch: "main" });
    expect(scan.status).toBe("pending");
  });
});
