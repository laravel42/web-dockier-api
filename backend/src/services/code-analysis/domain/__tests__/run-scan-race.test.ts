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
  error: { message: string } | null;
}

/** Result for the next terminal call on a chain, queued per operation. */
let selectResult: QueryResult = { data: null, error: null };
let updateResult: QueryResult = { data: null, error: null };

function chainable(resolve: () => QueryResult): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    then: (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
  };
  for (const method of ["select", "eq", "neq", "in", "order", "range", "single", "maybeSingle"]) {
    chain[method] = () => chain;
  }
  return chain;
}

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => chainable(() => selectResult),
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

const { runScan, CodeAnalysisError } = await import("../scans.js");

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
  selectResult = { data: scanRow, error: null };
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

  it("rejects a scan belonging to another tenant before any write", async () => {
    updateResult = { data: { ...scanRow, status: "running" }, error: null };

    await expect(runScan(scanRow.id, "org-2")).rejects.toThrow(/Not your scan/);
    expect(enqueueScan).not.toHaveBeenCalled();
  });
});
