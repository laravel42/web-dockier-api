import { describe, it, expect } from "vitest";
import {
  SCAN_SKIP_DIRS,
  isScanSkippedDirName,
  isScanSkippedRelativePath,
  semgrepExcludeArgs,
  semgrepIgnoreLines,
  sonarExclusionGlobs,
} from "../scan-skip-dirs.js";

describe("scan-skip-dirs", () => {
  it("includes node_modules, vendor, and vendors", () => {
    expect(SCAN_SKIP_DIRS.has("node_modules")).toBe(true);
    expect(SCAN_SKIP_DIRS.has("vendor")).toBe(true);
    expect(SCAN_SKIP_DIRS.has("vendors")).toBe(true);
  });

  it("matches skipped directory names case-insensitively", () => {
    expect(isScanSkippedDirName("Vendor")).toBe(true);
    expect(isScanSkippedDirName("NODE_MODULES")).toBe(true);
    expect(isScanSkippedDirName("src")).toBe(false);
  });

  it("detects skipped paths by segment", () => {
    expect(isScanSkippedRelativePath("src/app.ts")).toBe(false);
    expect(isScanSkippedRelativePath("vendor/autoload.php")).toBe(true);
    expect(isScanSkippedRelativePath("public/assets/vendor/jquery.js")).toBe(true);
  });

  it("builds semgrep exclude globs for every skipped directory", () => {
    const args = semgrepExcludeArgs();
    // Assert coverage rather than a total: the list also carries generated-asset
    // globs, and an exact count would have to be edited every time either grows.
    for (const dir of SCAN_SKIP_DIRS) {
      expect(args, dir).toContain(`${dir}/`);
      expect(args, dir).toContain(`**/${dir}/**`);
    }
    expect(args).toContain("vendor/");
    expect(args).toContain("**/vendor/**");
  });

  it("builds semgrepignore patterns", () => {
    const lines = semgrepIgnoreLines();
    expect(lines).toContain("vendor/");
    expect(lines).toContain("**/node_modules/**");
  });

  it("builds sonar exclusion globs", () => {
    const globs = sonarExclusionGlobs();
    expect(globs).toContain("**/node_modules/**");
    expect(globs).toContain("**/vendor/**");
  });
});
