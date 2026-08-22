import { describe, expect, it } from "vitest";
import { withFindingCounts } from "../pages/ScanDetail/utils/findingCounts";
import type { Scan } from "@/types";

const scan = {
  id: "scan-1",
  summary: { totalFindings: 39, errors: 0, warnings: 37, infos: 2, filesScanned: 10, filesInRepo: 10 },
} as Scan;

describe("withFindingCounts", () => {
  it("replaces stale summary buckets with the open scan's finding totals", () => {
    const next = withFindingCounts(scan, { total: 3, errors: 0, warnings: 1, infos: 2 });
    expect(next.summary.warnings).toBe(1);
    expect(next.summary.infos).toBe(2);
    expect(next.summary.totalFindings).toBe(3);
  });

  it("returns the same object when counts already match", () => {
    const counts = { total: 39, errors: 0, warnings: 37, infos: 2 };
    expect(withFindingCounts(scan, counts)).toBe(scan);
  });

  it("does not blank existing badges with an empty in-flight count", () => {
    const next = withFindingCounts(scan, { total: 0, errors: 0, warnings: 0, infos: 0 });
    expect(next).toBe(scan);
    expect(next.summary.warnings).toBe(37);
  });
});
