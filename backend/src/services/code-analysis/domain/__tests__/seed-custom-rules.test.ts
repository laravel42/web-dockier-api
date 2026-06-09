import { describe, it, expect } from "vitest";
import { DEFAULT_SYSTEM_CUSTOM_RULES, systemRuleUuid } from "../seed-custom-rules.js";

describe("DEFAULT_SYSTEM_CUSTOM_RULES", () => {
  it("defines built-in rules with valid regex patterns", () => {
    expect(DEFAULT_SYSTEM_CUSTOM_RULES).toHaveLength(34);

    for (const rule of DEFAULT_SYSTEM_CUSTOM_RULES) {
      expect(rule.ruleId.startsWith("custom.")).toBe(true);
      expect(systemRuleUuid(rule.ruleId)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(() => new RegExp(rule.pattern, "gi")).not.toThrow();
      expect(rule.extensions.length).toBeGreaterThan(0);
    }
  });

  it("includes a mix of severities", () => {
    const severities = new Set(DEFAULT_SYSTEM_CUSTOM_RULES.map((rule) => rule.severity));
    expect(severities.has("error")).toBe(true);
    expect(severities.has("warning")).toBe(true);
  });
});
