import { describe, it, expect, vi } from "vitest";
import { TEST_JWT_SECRET } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    SERVICE_NAME: "gateway",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-minimum-20-chars",
    JWT_SECRET: TEST_JWT_SECRET,
    CORS_ORIGIN: "*",
  },
}));

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
