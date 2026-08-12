import { describe, expect, it } from "vitest";
import {
  MAX_SOURCE_LINE_LENGTH,
  isGeneratedAssetName,
  isScanSkippedRelativePath,
  looksMinified,
  semgrepExcludeArgs,
  semgrepIgnoreLines,
} from "../domain/scan-skip-dirs.js";

/**
 * The case that prompted this: a scan of quattrolinee/cfg/www-portale_utenze
 * reported an XSS finding on
 *   public/js/filament/forms/components/file-upload.js, line 2
 * which is a minified Filament/FilePond bundle published by `vendor:publish`.
 * The whole library sits on one line, so "line 2" is unactionable, and the code
 * is not the user's to fix.
 */

const REAL_CASE = "public/js/filament/forms/components/file-upload.js";

describe("directory skipping alone was not enough", () => {
  it("does not skip the reported path — every segment is an ordinary name", () => {
    // Documents why this bug existed: `public`, `js`, `filament` are all fine.
    expect(isScanSkippedRelativePath(REAL_CASE)).toBe(false);
  });

  it("still skips genuine dependency directories", () => {
    expect(isScanSkippedRelativePath("vendor/filament/dist/app.js")).toBe(true);
    expect(isScanSkippedRelativePath("node_modules/x/index.js")).toBe(true);
    expect(isScanSkippedRelativePath("src/dist/bundle.js")).toBe(true);
  });
});

describe("isGeneratedAssetName", () => {
  it("catches the conventional build-output names", () => {
    for (const name of [
      "app.min.js", "app.min.css", "vendor.bundle.js",
      "main.chunk.js", "app.js.map", "index-4f3a9b2c.js",
    ]) {
      expect(isGeneratedAssetName(name), name).toBe(true);
    }
  });

  it("leaves hand-written sources alone", () => {
    for (const name of [
      "file-upload.js", "app.js", "main.ts", "Button.tsx",
      "minify.js",        // contains "min" but is not minified
      "administrator.js", // contains "min" mid-word
    ]) {
      expect(isGeneratedAssetName(name), name).toBe(false);
    }
  });
});

describe("looksMinified", () => {
  it("flags a single very long line — the reported file's shape", () => {
    const bundle = `/*! FilePond */\n${"var a=1;".repeat(400)}`;
    expect(bundle.split("\n")[1].length).toBeGreaterThan(MAX_SOURCE_LINE_LENGTH);
    expect(looksMinified(bundle)).toBe(true);
  });

  it("does not flag ordinary source, however long the file", () => {
    const source = Array.from({ length: 5_000 }, (_, i) => `  const value${i} = compute(${i});`).join("\n");
    expect(looksMinified(source)).toBe(false);
  });

  it("does not flag a file with no trailing newline", () => {
    expect(looksMinified("const a = 1;")).toBe(false);
  });

  it("flags a bundle with no newlines at all", () => {
    expect(looksMinified("x".repeat(MAX_SOURCE_LINE_LENGTH + 1))).toBe(true);
  });

  it("treats a line exactly at the limit as source", () => {
    expect(looksMinified("x".repeat(MAX_SOURCE_LINE_LENGTH))).toBe(false);
  });

  it("handles an empty file", () => {
    expect(looksMinified("")).toBe(false);
  });
});

describe("scanner exclusion lists carry the generated globs", () => {
  it("passes them to semgrep", () => {
    const args = semgrepExcludeArgs();
    expect(args).toContain("*.min.js");
    expect(args).toContain("*.map");
    // and still excludes directories
    expect(args).toContain("node_modules/");
  });

  it("writes them into .semgrepignore", () => {
    const lines = semgrepIgnoreLines();
    expect(lines).toContain("*.min.js");
    expect(lines).toContain("**/node_modules/**");
  });
});
