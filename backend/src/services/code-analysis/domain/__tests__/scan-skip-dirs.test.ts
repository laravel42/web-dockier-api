import { describe, it, expect } from "vitest";
import { SCAN_SKIP_DIRS, semgrepExcludeArgs, sonarExclusionGlobs } from "../scan-skip-dirs.js";

describe("scan-skip-dirs", () => {
  it("includes node_modules and other dependency folders", () => {
    expect(SCAN_SKIP_DIRS.has("node_modules")).toBe(true);
    expect(SCAN_SKIP_DIRS.has("vendor")).toBe(true);
    expect(SCAN_SKIP_DIRS.has("bower_components")).toBe(true);
  });

  it("builds semgrep exclude flags for every skipped directory", () => {
    const args = semgrepExcludeArgs();
    expect(args.filter((arg) => arg === "--exclude")).toHaveLength(SCAN_SKIP_DIRS.size);
    expect(args).toContain("--exclude");
    expect(args).toContain("node_modules");
  });

  it("builds sonar exclusion globs", () => {
    const globs = sonarExclusionGlobs();
    expect(globs).toContain("**/node_modules/**");
    expect(globs).toContain("**/vendor/**");
  });
});
