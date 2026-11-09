/**
 * cancel_requested_at lives on the scan row, which survives the run. A scan that
 * is run again must not start out already cancelled, or the worker would refuse
 * to start it and the user would have no way to see why.
 */
import { describe, it, expect, vi } from "vitest";

let updatePayload: Record<string, unknown> | undefined;

function chain(result: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok) };
  for (const m of ["select", "eq", "neq", "in", "single", "maybeSingle"]) c[m] = () => c;
  return c;
}

const row = {
  id: "11111111-1111-4111-8111-111111111111", organization_id: "org-1", project_id: "p", connection_id: "c",
  repo: "a/b", branch: "main", status: "failed", summary: {}, commit_sha: "",
  created_at: "2026-11-07T00:00:00.000Z", updated_at: "2026-11-07T00:00:00.000Z",
};

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => chain({ data: row, error: null }),
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return chain({ data: { ...row, status: "running" }, error: null });
      },
    }),
  },
}));
vi.mock("../worker.js", () => ({ enqueueScan: vi.fn(async () => {}) }));
vi.mock("../scan-progress.js", () => ({
  persistScanProgress: vi.fn(async () => {}),
  broadcastScanStatus: vi.fn(),
  updateScanProgress: vi.fn(async () => {}),
}));
vi.mock("../scan-reconcile.js", () => ({ reconcileStaleScanById: vi.fn(async () => false) }));

const { runScan } = await import("../scans.js");

describe("runScan", () => {
  it("clears a cancel request left over from the previous run", async () => {
    await runScan(row.id, "org-1");
    expect(updatePayload).toHaveProperty("cancel_requested_at", null);
  });
});
