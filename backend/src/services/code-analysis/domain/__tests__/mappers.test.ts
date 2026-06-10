import { describe, it, expect } from "vitest";
import { parseSummary } from "../mappers.js";

describe("parseSummary", () => {
  it("preserves progress when summary validates", () => {
    const summary = parseSummary({
      totalFindings: 0,
      errors: 0,
      warnings: 0,
      infos: 0,
      filesScanned: 0,
      filesInRepo: 120,
      progress: {
        phase: "scanning",
        scanner: "semgrep",
        filesScanned: 40,
        filesInRepo: 120,
        findingsCount: 0,
        currentFile: "src/app.ts",
      },
    });

    expect(summary.filesInRepo).toBe(120);
    expect(summary.progress?.filesScanned).toBe(40);
    expect(summary.progress?.scanner).toBe("semgrep");
  });

  it("keeps progress even when other summary fields fail validation", () => {
    const summary = parseSummary({
      totalFindings: -1,
      errors: 0,
      warnings: 0,
      infos: 0,
      filesScanned: 0,
      filesInRepo: 50,
      progress: {
        phase: "scanning",
        filesScanned: 10,
        filesInRepo: 50,
        findingsCount: 2,
      },
    });

    expect(summary.progress?.filesScanned).toBe(10);
    expect(summary.progress?.findingsCount).toBe(2);
  });
});
