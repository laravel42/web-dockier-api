/**
 * The stored toggles are shared state between the Settings page and the scan
 * page, and they live in the user's browser — so a rename cannot just change
 * the key. These pin the migration path off the old names.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadScanTools, saveScanTools, scanToolFlags, DEFAULT_SCAN_TOOLS } from "../utils/scanTools";

describe("loadScanTools", () => {
  beforeEach(() => localStorage.clear());

  it("returns the defaults when nothing is stored", () => {
    expect(loadScanTools()).toEqual(DEFAULT_SCAN_TOOLS);
  });

  it("honours a legacy `bearer` value as sonarqube", () => {
    // `bearer` was only ever SonarQube under a half-finished rename, so a user
    // who switched it off must not silently get it back on.
    localStorage.setItem("scan_tools", JSON.stringify({ bearer: false }));

    const tools = loadScanTools();

    expect(tools.sonarqube).toBe(false);
    expect(tools.bearer).toBeUndefined();
  });

  it("prefers an explicit sonarqube value over the legacy key", () => {
    localStorage.setItem("scan_tools", JSON.stringify({ bearer: false, sonarqube: true }));
    expect(loadScanTools().sonarqube).toBe(true);
  });

  it("drops a stored codeql toggle", () => {
    // The engine is gone: its licence forbids scanning private repositories.
    localStorage.setItem("scan_tools", JSON.stringify({ codeql: true }));
    expect(loadScanTools().codeql).toBeUndefined();
  });

  it("honours a stored semgrep choice", () => {
    // It used to be forced off on every read, which silently overrode the
    // toggle. The engine is on by default now, so only an explicit opt-out
    // should turn it off.
    localStorage.setItem("scan_tools", JSON.stringify({ semgrep: false }));
    expect(loadScanTools().semgrep).toBe(false);

    localStorage.setItem("scan_tools", JSON.stringify({ semgrep: true }));
    expect(loadScanTools().semgrep).toBe(true);
  });

  it("falls back to the defaults on unparseable storage", () => {
    localStorage.setItem("scan_tools", "{not json");
    expect(loadScanTools()).toEqual(DEFAULT_SCAN_TOOLS);
  });

  it("round-trips a saved choice", () => {
    saveScanTools({ ...DEFAULT_SCAN_TOOLS, customRules: false });
    expect(loadScanTools().customRules).toBe(false);
  });
});

describe("scanToolFlags", () => {
  it("maps the toggles onto the API flags", () => {
    const flags = scanToolFlags(DEFAULT_SCAN_TOOLS);

    expect(flags).toEqual({
      enableSemgrep: true,
      enableSonarqube: true,
      enableCustomRules: true,
      // Opt-in on the backend too: schema field classification is project
      // information, not a security finding.
      enableSensitiveData: false,
    });
  });

  it.each(["semgrep", "sonarqube", "customRules"] as const)(
    "forwards the %s toggle when it is off",
    (engine) => {
      // Each engine needs its own flag reaching the API. The UI once had one
      // toggle driving two flags and another engine with no toggle at all.
      const flags = scanToolFlags({ ...DEFAULT_SCAN_TOOLS, [engine]: false });
      const flagName = {
        semgrep: "enableSemgrep",
        sonarqube: "enableSonarqube",
        customRules: "enableCustomRules",
      }[engine] as keyof ReturnType<typeof scanToolFlags>;

      expect(flags[flagName]).toBe(false);
      // and nothing else changed
      const others = Object.entries(flags).filter(
        ([k]) => k !== flagName && k !== "enableSensitiveData",
      );
      expect(others.every(([, v]) => v === true)).toBe(true);
    },
  );
});
