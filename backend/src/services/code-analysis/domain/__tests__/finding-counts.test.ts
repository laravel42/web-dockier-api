/**
 * Finding counts come from `actionable_finding_counts` (migration 0086), grouped in
 * the database. Tallying selected rows in Node hit PostgREST's 1000-row cap: the
 * dashboard's 20 scans held 2362 findings, and a scan whose rows were cut off was
 * shown as "Clean" with 63 findings. Pinned: grouped counts are expanded by `n`,
 * providers come from the rule id, and a failed count throws instead of reading as 0.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("../worker.js", () => ({ enqueueScan: vi.fn() }));
vi.mock("../scan-progress.js", () => ({ persistScanProgress: vi.fn() }));
vi.mock("../scan-reconcile.js", () => ({ reconcileStaleScanById: vi.fn() }));

const { getSecurityFindingCounts, getSecurityFindingCountsForScans, countDistinctFindingFiles } = await import("../findings.js");

beforeEach(() => vi.clearAllMocks());

describe("finding counts", () => {
  it("expands grouped rows past the old 1000-row cap and attributes providers", async () => {
    rpc.mockResolvedValue({
      data: [{
        scan_id: "s1",
        distinct_files: 12,
        counts: [
          { rule_id: "php.lang.security.eval", severity: "error", n: 1200 },
          { rule_id: "sonar.php:S1234", severity: "warning", n: 5 },
          { rule_id: "custom.php.debug", severity: "info", n: "2" },
        ],
      }],
      error: null,
    });

    const counts = await getSecurityFindingCounts("s1");

    expect(rpc).toHaveBeenCalledWith("actionable_finding_counts", { p_scan_ids: ["s1"] });
    expect(counts).toMatchObject({ total: 1207, errors: 1200, warnings: 5, infos: 2, semgrep: 1200, sonarqube: 5, custom: 2 });
    expect(counts.byProvider.sonarqube).toEqual({ total: 5, errors: 0, warnings: 5, infos: 0 });
    expect(await countDistinctFindingFiles("s1")).toBe(12);
  });

  it("reports zeros only for a scan the database says has none", async () => {
    rpc.mockResolvedValue({ data: [{ scan_id: "s1", distinct_files: 1, counts: [{ rule_id: "x", severity: "error", n: 63 }] }], error: null });

    const res = await getSecurityFindingCountsForScans(["s1", "s2"]);

    expect(res.get("s1")).toEqual({ total: 63, errors: 63, warnings: 0, infos: 0 });
    expect(res.get("s2")).toEqual({ total: 0, errors: 0, warnings: 0, infos: 0 });
    await expect(getSecurityFindingCountsForScans([])).resolves.toEqual(new Map());
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("throws when the count fails, instead of passing the scan off as clean", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom", code: "XX000" } });
    await expect(getSecurityFindingCountsForScans(["s1"])).rejects.toThrow();
  });
});
