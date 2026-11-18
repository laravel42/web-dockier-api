/**
 * How Semgrep is called with a repository's own file names.
 *
 * - A file named like an option (`--exclude=a.py`) was parsed as one and hid its
 *   own findings; checked against semgrep 1.160. Every target now follows `--`.
 * - A failed run stored Semgrep's stderr as the scan's error, which every tenant
 *   member reads, and that text names server paths. It now goes to the log only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const runCommand = vi.hoisted(() => vi.fn());
vi.mock("../scan-exec.js", () => ({ runCommand, findSemgrepBinary: () => "semgrep" }));
vi.mock("../scan-skip-dirs.js", () => ({
  isScanSkippedRelativePath: () => false,
  semgrepExcludeArgs: () => ["--exclude", "node_modules/"],
  writeSemgrepIgnore: vi.fn(async () => {}),
}));
vi.mock("../custom-rules.js", () => ({ listCustomRules: vi.fn() }));
vi.mock("../../../../shared/utils/paths.js", () => ({ getOpengrepRulesDir: () => "/srv/app/code-analysis/rules/opengrep" }));
const logError = vi.hoisted(() => vi.fn());
vi.mock("../../../../shared/logger.js", () => ({ logger: { error: logError, info: vi.fn(), warn: vi.fn() } }));

const { runSemgrep } = await import("../scan-strategies.js");

beforeEach(() => {
  runCommand.mockReset();
  logError.mockReset();
});

describe("Semgrep invocation", () => {
  it("passes every repository file after --, so none is read as an option", async () => {
    runCommand.mockResolvedValue({ stdout: '{"results": []}', stderr: "", code: 0 });
    await runSemgrep("/tmp/build-x/repo", ["src/a.py", "--exclude=a.py"], new Set(), () => {});
    const args = runCommand.mock.calls[0][1] as string[];
    const sep = args.indexOf("--");
    expect(sep).toBeGreaterThan(args.indexOf("--exclude"));
    expect(args.slice(sep + 1)).toEqual(["src/a.py", "--exclude=a.py"]);
  });

  it("keeps Semgrep's stderr out of the stored error and logs it instead", async () => {
    const stderr = "Invalid rule /srv/app/code-analysis/rules/opengrep/x.yml in /tmp/build-x/repo";
    runCommand.mockResolvedValue({ stdout: "", stderr, code: 2 });
    const failure = runSemgrep("/tmp/build-x/repo", ["a.py"], new Set(), () => {});
    await expect(failure).rejects.toThrow(/Semgrep failed \(exit code 2\)/);
    await expect(failure).rejects.not.toThrow(/\/srv|\/tmp/);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(stderr));
  });
});
