/**
 * A scan that dies while inserting findings keeps the batches already written.
 * Nothing else reclaims them: persistFindings deletes by scan_id and every new
 * scan has a new id, so two failed scans of laravel42/berry each kept 200
 * orphaned rows indefinitely.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
let deleteError: { message: string } | null = null;

function chain(label: string, result: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
  };
  for (const m of ["eq", "select", "single"]) c[m] = () => c;
  calls.push(label);
  return c;
}

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => chain(`${table}.select`, { data: { summary: {} }, error: null }),
      update: () => chain(`${table}.update`, { error: null }),
      delete: () => chain(`${table}.delete`, { error: deleteError }),
    }),
  },
}));
vi.mock("../scan-progress.js", () => ({ broadcastScanStatus: vi.fn() }));

const { markScanFailed } = await import("../scan-persistence.js");

beforeEach(() => {
  calls.length = 0;
  deleteError = null;
});

describe("markScanFailed", () => {
  it("clears the findings a half-written scan left behind", async () => {
    await markScanFailed("scan-1", "Failed to insert findings: blocked");

    expect(calls).toContain("findings.delete");
    // Status first, so the scan never reads "running" with its rows gone.
    expect(calls.indexOf("scans.update")).toBeLessThan(calls.indexOf("findings.delete"));
  });

  it("still finishes when the cleanup itself fails", async () => {
    deleteError = { message: "connection terminated" };
    await expect(markScanFailed("scan-1", "boom")).resolves.toBeUndefined();
  });
});
