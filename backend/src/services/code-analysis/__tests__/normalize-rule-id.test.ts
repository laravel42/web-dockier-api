import { describe, expect, it } from "vitest";
import { normalizeSemgrepRuleId, parseSemgrepOutput } from "../domain/scan-analysis.js";

/**
 * `semgrep --config <absolute dir>` namespaces every rule with the scanning
 * machine's filesystem path. The finding then disagreed with the catalogue the UI
 * lists, so a disabled rule was never actually skipped.
 */

const REPORTED =
  "Users.oscar.projects.web-dockier-api.code-analysis.rules.opengrep.javascript.browser.security.insecure-document-method";
const CATALOGUE = "javascript.browser.security.insecure-document-method";

describe("normalizeSemgrepRuleId", () => {
  it("reduces the id observed in the wild to the catalogue id", () => {
    expect(normalizeSemgrepRuleId(REPORTED)).toBe(CATALOGUE);
  });

  it("normalizes the same rule identically regardless of whose machine scanned", () => {
    const a = "Users.oscar.projects.web-dockier-api.code-analysis.rules.opengrep." + CATALOGUE;
    const b = "home.runner.work.app.app.code-analysis.rules.opengrep." + CATALOGUE;
    const c = "srv.dockier.code-analysis.rules.opengrep." + CATALOGUE;
    expect(new Set([a, b, c].map(normalizeSemgrepRuleId))).toEqual(new Set([CATALOGUE]));
  });

  it("leaves an already-normalized id untouched", () => {
    expect(normalizeSemgrepRuleId(CATALOGUE)).toBe(CATALOGUE);
  });

  it("leaves ids with no marker alone — custom rules keep their own id", () => {
    expect(normalizeSemgrepRuleId("my-org.custom.no-eval")).toBe("my-org.custom.no-eval");
    expect(normalizeSemgrepRuleId("insecure-document-method")).toBe("insecure-document-method");
  });

  it("is idempotent", () => {
    expect(normalizeSemgrepRuleId(normalizeSemgrepRuleId(REPORTED))).toBe(CATALOGUE);
  });

  it("handles the empty id without throwing", () => {
    expect(normalizeSemgrepRuleId("")).toBe("");
  });
});

const semgrepJson = (checkId: string) =>
  JSON.stringify({
    results: [
      {
        check_id: checkId,
        path: "src/app.js",
        start: { line: 12 },
        end: { line: 12 },
        extra: { message: "innerHTML assignment", severity: "ERROR", lines: "el.innerHTML = x;" },
      },
    ],
  });

describe("parseSemgrepOutput", () => {
  it("stores the catalogue id, not the machine path", () => {
    const [finding] = parseSemgrepOutput(semgrepJson(REPORTED), new Set());
    expect(finding.ruleId).toBe(CATALOGUE);
  });

  it("skips a rule the user disabled — the bug this fixes", () => {
    // The override carries the catalogue id, because that is what the UI lists.
    const disabled = new Set([CATALOGUE]);
    expect(parseSemgrepOutput(semgrepJson(REPORTED), disabled)).toHaveLength(0);
  });

  it("still honours an override written before normalization landed", () => {
    const legacy = new Set([REPORTED]);
    expect(parseSemgrepOutput(semgrepJson(REPORTED), legacy)).toHaveLength(0);
  });

  it("does not skip an unrelated rule", () => {
    const disabled = new Set(["javascript.browser.security.some-other-rule"]);
    expect(parseSemgrepOutput(semgrepJson(REPORTED), disabled)).toHaveLength(1);
  });
});
