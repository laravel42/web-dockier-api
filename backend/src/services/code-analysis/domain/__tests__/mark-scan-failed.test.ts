/**
 * A scan that dies while inserting findings keeps the batches already written.
 * Nothing else reclaims them: persistFindings deletes by scan_id and every new
 * scan has a new id, so two failed scans of laravel42/berry each kept 200
 * orphaned rows indefinitely.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
let deleteError: { message: string } | null = null;
/** False when the scan is no longer running, so the guarded UPDATE matches no row. */
let stillRunning = true;
const filters: string[] = [];

function chain(label: string, result: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
  };
  for (const m of ["eq", "in", "select", "single", "maybeSingle"]) {
    c[m] = (...args: unknown[]) => {
      filters.push(`${label}.${m}:${JSON.stringify(args)}`);
      return c;
    };
  }
  calls.push(label);
  return c;
}

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => chain(`${table}.select`, { data: { summary: {} }, error: null }),
      update: () => chain(`${table}.update`, { data: stillRunning ? { id: "scan-1" } : null, error: null }),
      delete: () => chain(`${table}.delete`, { error: deleteError }),
    }),
  },
}));
vi.mock("../scan-progress.js", () => ({ broadcastScanStatus: vi.fn() }));

const { broadcastScanStatus } = await import("../scan-progress.js");
const { markScanFailed } = await import("../scan-persistence.js");

beforeEach(() => {
  calls.length = 0;
  filters.length = 0;
  deleteError = null;
  stillRunning = true;
  vi.mocked(broadcastScanStatus).mockClear();
});

describe("markScanFailed", () => {
  it("clears the findings a half-written scan left behind", async () => {
    await markScanFailed("scan-1", "Failed to insert findings: blocked");

    expect(calls).toContain("findings.delete");
    // Status first, so the scan never reads "running" with its rows gone.
    expect(calls.indexOf("scans.update")).toBeLessThan(calls.indexOf("findings.delete"));
  });

  it("leaves a scan that already finished alone", async () => {
    // The guard lives in the UPDATE itself, so no caller has to check first.
    stillRunning = false;
    await markScanFailed("scan-1", "boom");

    expect(filters).toContain('scans.update.in:["status",["running","pending"]]');
    expect(calls).not.toContain("findings.delete");
    expect(broadcastScanStatus).not.toHaveBeenCalled();
  });

  it("still finishes when the cleanup itself fails", async () => {
    deleteError = { message: "connection terminated" };
    await expect(markScanFailed("scan-1", "boom")).resolves.toBeUndefined();
  });
});
