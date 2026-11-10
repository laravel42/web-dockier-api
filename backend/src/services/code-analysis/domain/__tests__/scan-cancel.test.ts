/**
 * Cancelling a running scan.
 *
 * The request only writes intent to the database; whichever instance owns the
 * scan's subprocess notices it by polling and does the killing. These pin the
 * pieces that make that safe: a cancel ends the job instead of failing it (the
 * queue retries failures, which would restart the scan the user just stopped),
 * it never touches a scan that already finished, and it does not leak into the
 * next run of the same scan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Op {
  table: string;
  op: "select" | "update" | "delete";
  payload?: Record<string, unknown>;
  filters: string[];
}

const ops: Op[] = [];
/** What a select on `scans` returns next. */
let scanRow: Record<string, unknown> | null = { status: "running", cancel_requested_at: null };
/** What an update-with-select on `scans` returns (null = no row matched). */
let updateMatches = true;

function chain(op: Op): Record<string, unknown> {
  const result = () => {
    if (op.op === "update") return { data: updateMatches ? { id: "s" } : null, error: null };
    if (op.op === "select") return { data: scanRow, error: null };
    return { data: null, error: null };
  };
  const c: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok),
  };
  for (const m of ["eq", "neq", "in", "select", "single", "maybeSingle"]) {
    c[m] = (...args: unknown[]) => {
      op.filters.push(`${m}:${JSON.stringify(args)}`);
      return c;
    };
  }
  ops.push(op);
  return c;
}

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => chain({ table, op: "select", filters: [] }),
      update: (payload: Record<string, unknown>) => chain({ table, op: "update", payload, filters: [] }),
      delete: () => chain({ table, op: "delete", filters: [] }),
    }),
  },
}));
vi.mock("../scan-progress.js", () => ({ broadcastScanStatus: vi.fn() }));
vi.mock("../../../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// scan-worker pulls in the whole scan pipeline (config, git, engines); only its
// "fail the scan if still running" fallback matters to the worker handler.
vi.mock("../scan-worker.js", () => ({ failScanIfStillRunning: vi.fn(async () => {}) }));

const runScanInSubprocess = vi.fn();
vi.mock("../run-scan-subprocess.js", () => ({
  runScanInSubprocess: (...args: unknown[]) => runScanInSubprocess(...args),
}));
// worker.ts registers a queue worker at import; the queue is not under test.
vi.mock("../../../../shared/database/queue.js", () => ({
  createWorker: () => ({ register: vi.fn(), enqueue: vi.fn() }),
  SECURITY_SCAN_QUEUE: "security-scan",
}));

const { requestScanCancel, markScanCancelled, ScanCancelledError, SCAN_CANCELLED_MESSAGE } = await import(
  "../scan-cancel.js"
);
const { handleScanJob } = await import("../worker.js");

const job = { scanId: "scan-1", tenantId: "org-1", options: {} };
const updatesTo = (table: string) => ops.filter((o) => o.table === table && o.op === "update");

beforeEach(() => {
  ops.length = 0;
  runScanInSubprocess.mockReset();
  scanRow = { status: "running", cancel_requested_at: null };
  updateMatches = true;
});

afterEach(() => vi.clearAllMocks());

describe("requestScanCancel", () => {
  it("only touches a scan that is running", async () => {
    await expect(requestScanCancel("scan-1")).resolves.toBe(true);

    const update = updatesTo("scans")[0];
    expect(update.payload).toHaveProperty("cancel_requested_at");
    // The status filter is what keeps a late click off a scan that just completed.
    expect(update.filters).toContain('eq:["status","running"]');
  });

  it("says so when there was nothing to cancel", async () => {
    updateMatches = false;
    await expect(requestScanCancel("scan-1")).resolves.toBe(false);
  });
});

describe("markScanCancelled", () => {
  it("ends a running scan as cancelled, with the reason and the flag", async () => {
    await markScanCancelled("scan-1");

    const failed = updatesTo("scans").find((o) => o.payload?.status === "failed");
    expect(failed).toBeDefined();
    expect(failed!.payload!.summary).toMatchObject({ error: SCAN_CANCELLED_MESSAGE, cancelled: true });
  });

  it("leaves a scan that already finished alone", async () => {
    // The guarded UPDATE matches no row, so its findings must survive.
    updateMatches = false;
    await markScanCancelled("scan-1");

    expect(updatesTo("scans")[0].filters).toContain('in:["status",["running","pending"]]');
    expect(ops.some((o) => o.table === "findings" && o.op === "delete")).toBe(false);
  });
});

describe("handleScanJob", () => {
  it("does not start a scan cancelled while it was still queued", async () => {
    scanRow = { status: "running", cancel_requested_at: "2026-11-07T00:00:00Z" };

    await expect(handleScanJob(job)).resolves.toBeUndefined();

    expect(runScanInSubprocess).not.toHaveBeenCalled();
    expect(updatesTo("scans").some((o) => o.payload?.status === "failed")).toBe(true);
  });

  it("ends the job, rather than failing it, when the runner was cancelled", async () => {
    // Rejecting would make the queue retry — restarting the scan the user stopped.
    runScanInSubprocess.mockRejectedValueOnce(new ScanCancelledError());

    await expect(handleScanJob(job)).resolves.toBeUndefined();

    const failed = updatesTo("scans").find((o) => o.payload?.status === "failed");
    expect(failed!.payload!.summary).toMatchObject({ cancelled: true });
  });

  it("still fails the job for a real error, so the queue retries it", async () => {
    runScanInSubprocess.mockRejectedValueOnce(new Error("Scan subprocess exited with code 1"));

    await expect(handleScanJob(job)).rejects.toThrow(/code 1/);
  });

  it("gives the runner a way to ask whether to stop", async () => {
    runScanInSubprocess.mockResolvedValueOnce(undefined);
    await handleScanJob(job);

    const options = runScanInSubprocess.mock.calls[0][2] as { isCancelled: () => Promise<boolean> };
    scanRow = { status: "running", cancel_requested_at: "2026-11-07T00:00:00Z" };
    await expect(options.isCancelled()).resolves.toBe(true);
    scanRow = { status: "running", cancel_requested_at: null };
    await expect(options.isCancelled()).resolves.toBe(false);
  });
});
