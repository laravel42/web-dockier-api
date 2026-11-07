/**
 * updateScanProgress is called once per file per scanner — thousands of times,
 * all un-awaited. Two things keep that from taking the process down:
 *
 *  1. The throttle slot must be claimed BEFORE the Supabase round-trip. Marking
 *     it afterwards let every concurrent caller through the 400ms gate, which
 *     opened thousands of sockets at once and killed a real scan with
 *     "EMFILE: too many open files".
 *  2. The UPDATE must be scoped to a still-running scan, or a write that was
 *     already in flight when the scan failed lands afterwards and erases the
 *     failure reason that markScanFailed just wrote.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanProgressPayload } from "../scan-events.js";

let selectCalls = 0;
let releaseSelect: () => void = () => {};
const updateFilters: string[] = [];

function pendingSelect(): Promise<{ data: { summary: object }; error: null }> {
  selectCalls++;
  return new Promise((resolve) => {
    releaseSelect = () => resolve({ data: { summary: {} }, error: null });
  });
}

function updateChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled),
  };
  for (const method of ["eq", "in", "neq", "select", "single"]) {
    chain[method] = (...args: unknown[]) => {
      updateFilters.push(`${method}:${JSON.stringify(args)}`);
      return chain;
    };
  }
  return chain;
}

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: pendingSelect }) }),
      update: () => updateChain(),
    }),
  },
}));

vi.mock("../scan-events.js", () => ({ broadcastScanEvent: vi.fn() }));

const { updateScanProgress, broadcastScanStatus } = await import("../scan-progress.js");

const progress: ScanProgressPayload = {
  phase: "scanning",
  scanner: "custom",
  filesScanned: 1,
  filesInRepo: 5336,
  findingsCount: 0,
};

beforeEach(() => {
  selectCalls = 0;
  updateFilters.length = 0;
});

describe("updateScanProgress", () => {
  it("lets only one of many concurrent calls reach the database", async () => {
    const scanId = "scan-concurrent";
    broadcastScanStatus(scanId, "running", {}); // resets the throttle for this id

    const inFlight = Array.from({ length: 200 }, (_, i) =>
      updateScanProgress(scanId, { ...progress, filesScanned: i + 1 }),
    );
    // Nothing has resolved yet: every extra caller must already have bailed.
    expect(selectCalls).toBe(1);

    releaseSelect();
    await Promise.all(inFlight);
    expect(selectCalls).toBe(1);
  });

  it("scopes the progress write to a scan that is still running", async () => {
    const scanId = "scan-filters";
    broadcastScanStatus(scanId, "running", {});

    const write = updateScanProgress(scanId, progress);
    releaseSelect();
    await write;

    expect(updateFilters).toContain('in:["status",["running","pending"]]');
    expect(updateFilters).toContain(`eq:["id","${scanId}"]`);
  });
});
