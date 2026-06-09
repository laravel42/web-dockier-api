import { describe, it, expect } from "vitest";
import { listSemgrepRules } from "../semgrep-rules.js";

describe("listSemgrepRules", () => {
  it("parses severity from rule YAML instead of defaulting to info", () => {
    const { rules } = listSemgrepRules();
    expect(rules.length).toBeGreaterThan(0);

    const severities = new Set(rules.map((rule) => rule.severity));
    expect(severities.has("error")).toBe(true);
    expect(severities.has("warning")).toBe(true);

    const allInfo = rules.every((rule) => rule.severity === "info");
    expect(allInfo).toBe(false);
  });
});
