import { describe, expect, it } from "vitest";
import { parseRepoKey, summarizeFindingTitle, estimateFixMinutes } from "../ai/mr-generator.js";
import { sanitizeBranchName } from "../ai/fix-branch.js";

describe("parseRepoKey", () => {
  it("parses owner/repo keys", () => {
    expect(parseRepoKey("acme/web-app")).toEqual({ owner: "acme", repo: "web-app" });
  });

  it("parses nested GitLab group paths", () => {
    expect(parseRepoKey("group/subgroup/project")).toEqual({ owner: "group/subgroup", repo: "project" });
  });

  it("throws for invalid keys", () => {
    expect(() => parseRepoKey("single")).toThrow("Invalid repository key");
  });
});

describe("sanitizeBranchName", () => {
  it("creates a dockier fix branch slug", () => {
    const branch = sanitizeBranchName("javascript.lang.security.audit");
    expect(branch).toMatch(/^dockier\/fix-javascript-lang-security-audit-[a-z0-9]+$/);
  });
});

describe("summarizeFindingTitle", () => {
  it("prefixes severity and includes file path", () => {
    const title = summarizeFindingTitle({
      severity: "error",
      message: "Use of dangerous function",
      filePath: "src/index.js",
    });
    expect(title).toContain("[Info]");
    expect(title).toContain("src/index.js");
  });
});

describe("estimateFixMinutes", () => {
  it("returns at least 10 minutes", () => {
    expect(
      estimateFixMinutes({
        severity: "info",
        snippet: "x",
        startLine: 1,
        endLine: 1,
      }),
    ).toBeGreaterThanOrEqual(10);
  });
});
