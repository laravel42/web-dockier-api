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

import { listSemgrepRules } from "../semgrep-rules.js";

/**
 * A rule override only works if its id equals what a scan reports: the rule's
 * directory plus the `id` inside the YAML (see normalizeSemgrepRuleId). The
 * previous listing used the file name, so turning some rules off did nothing.
 */
describe("listSemgrepRules ids", () => {
  const ids = new Set(listSemgrepRules().rules.map((rule) => rule.id));

  it("uses the YAML rule id, not the file name", () => {
    // ocaml/lang/security/marshal.yaml holds rule `ocamllint-marshal`.
    expect(ids.has("ocaml.lang.security.ocamllint-marshal")).toBe(true);
    expect(ids.has("ocaml.lang.security.marshal")).toBe(false);
  });

  it("lists every rule of a file that holds several", () => {
    expect(ids.has("python.lang.compatibility.python37-compatibility-importlib")).toBe(true);
    expect(ids.has("python.lang.compatibility.python37-compatibility-importlib2")).toBe(true);
  });

  it("includes .yml rules", () => {
    expect(
      ids.has("terraform.aws.security.aws-ec2-launch-configuration-root-block-device-unencrypted"),
    ).toBe(true);
  });

  it("skips the corpus's own test fixtures", () => {
    expect(listSemgrepRules().rules.some((rule) => /\.test\.ya?ml$/.test(rule.path))).toBe(false);
  });
});

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
