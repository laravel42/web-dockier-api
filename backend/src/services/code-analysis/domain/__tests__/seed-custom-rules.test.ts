import { describe, it, expect, vi } from "vitest";
import { TEST_JWT_SECRET } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    SERVICE_NAME: "gateway",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_minimum_length",
    SUPABASE_SECRET_KEY: "sb_secret_test_key_minimum_length_value",
    JWT_SECRET: TEST_JWT_SECRET,
    CORS_ORIGIN: "*",
  },
}));

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
