import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SCAN_TOOLS, loadScanTools, saveScanTools, scanToolFlags } from "@/utils/scanTools";

describe("loadScanTools", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to the defaults when nothing is stored", () => {
    expect(loadScanTools()).toEqual(DEFAULT_SCAN_TOOLS);
  });

  it("falls back to the defaults on a corrupt blob instead of an empty object", () => {
    localStorage.setItem("scan_tools", "{not json");
    expect(loadScanTools()).toEqual(DEFAULT_SCAN_TOOLS);
  });

  it("honours a legacy sonarqube value as bearer", () => {
    localStorage.setItem("scan_tools", JSON.stringify({ sonarqube: false, codeql: true }));
    const tools = loadScanTools();
    expect(tools.bearer).toBe(false);
    expect(tools.sonarqube).toBeUndefined();
  });

  it("prefers an explicit bearer value over the legacy key", () => {
    localStorage.setItem("scan_tools", JSON.stringify({ sonarqube: false, bearer: true }));
    expect(loadScanTools().bearer).toBe(true);
  });

  it("keeps semgrep off whatever is stored", () => {
    localStorage.setItem("scan_tools", JSON.stringify({ semgrep: true }));
    expect(loadScanTools().semgrep).toBe(false);
  });

  it("round-trips a saved selection", () => {
    saveScanTools({ ...DEFAULT_SCAN_TOOLS, codeql: false });
    expect(loadScanTools().codeql).toBe(false);
  });
});

describe("scanToolFlags", () => {
  it("disables bearer when the toggle is off, under both flag names", () => {
    const flags = scanToolFlags({ ...DEFAULT_SCAN_TOOLS, bearer: false });
    expect(flags.enableBearer).toBe(false);
    expect(flags.enableSonarqube).toBe(false);
  });

  it("never enables the engines that are not wired up", () => {
    const flags = scanToolFlags(DEFAULT_SCAN_TOOLS);
    expect(flags.enableSemgrep).toBe(false);
    expect(flags.enableSensitiveData).toBe(false);
  });
});
