import { describe, expect, it } from "vitest";
import { rawProgressPercent } from "../pages/ScanDetail/utils/scanProgressPercent";

describe("rawProgressPercent", () => {
  it("stays in the cloning band", () => {
    expect(rawProgressPercent({
      phase: "cloning",
      filesScanned: 0,
      filesInRepo: 0,
      findingsCount: 0,
      scanner: "cloning",
      currentFile: "org/repo",
    })).toBe(4);
  });

  it("advances linearly with file ratio during scanning", () => {
    const base = {
      phase: "scanning",
      filesInRepo: 100,
      findingsCount: 0,
    };
    expect(rawProgressPercent({ ...base, filesScanned: 0 })).toBe(12);
    expect(rawProgressPercent({ ...base, filesScanned: 50 })).toBe(48);
    expect(rawProgressPercent({ ...base, filesScanned: 100 })).toBe(84);
  });

  it("creeps slowly during scanning when file totals are not moving yet", () => {
    const atStart = rawProgressPercent({
      phase: "scanning",
      filesScanned: 0,
      filesInRepo: 120,
      findingsCount: 0,
    }, 0);
    const mid = rawProgressPercent({
      phase: "scanning",
      filesScanned: 0,
      filesInRepo: 120,
      findingsCount: 0,
    }, 90_000);
    expect(mid).toBeGreaterThan(atStart);
    expect(mid).toBeLessThan(84);
  });

  it("reaches 100 only when done", () => {
    expect(rawProgressPercent({
      phase: "done",
      filesScanned: 10,
      filesInRepo: 10,
      findingsCount: 3,
    })).toBe(100);
  });
});
