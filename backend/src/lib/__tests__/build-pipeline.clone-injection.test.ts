import { afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import type { ContextualLogger } from "../logging.js";

// cloneRepo reads env at module load through shared/config.
vi.mock("../../shared/config.js", () => ({ env: {} }));
vi.mock("../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { execFileSyncMock, execSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  execSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
  execSync: execSyncMock,
}));

const { cloneRepo } = await import("../build-pipeline.js");

const noopLogger: ContextualLogger = {
  info: async () => {},
  success: async () => {},
  warn: async () => {},
  error: async () => {},
  section: async () => {},
};

/**
 * The branch name reaches cloneRepo straight from `POST /code-analysis/scans`
 * (`branch: z.string()`, no charset restriction) and from a push webhook's
 * `ref`. It must never be handed to a shell.
 */
const HOSTILE_BRANCH = "main$(touch /tmp/dockier-clone-injection-probe)";

describe("cloneRepo — the branch name never reaches a shell", () => {
  let workDir: string | undefined;

  afterEach(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
    workDir = undefined;
    vi.clearAllMocks();
    rmSync("/tmp/dockier-clone-injection-probe", { force: true });
  });

  it("passes a hostile branch as its own argv element, with no shell", async () => {
    execFileSyncMock.mockReturnValue(Buffer.from("abc1234\n"));

    const result = await cloneRepo({
      git: { provider: "github", token: "", repo: "owner/repo" },
      branch: HOSTILE_BRANCH,
      shortId: "test1234",
      logger: noopLogger,
    });
    workDir = result.workDir;

    // execSync runs its argument through /bin/sh, where `$(...)` and backticks
    // stay live even inside the double quotes JSON.stringify produces. Nothing
    // in this path may use it.
    expect(execSyncMock).not.toHaveBeenCalled();

    const [file, args] = execFileSyncMock.mock.calls[0] as [string, string[]];
    expect(file).toBe("git");
    expect(args).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      HOSTILE_BRANCH,
      "https://github.com/owner/repo.git",
      "repo",
    ]);

    // The whole point: one argv element carries the branch verbatim, and no
    // element is a concatenated command line.
    expect(args).toContain(HOSTILE_BRANCH);
    expect(args.some((arg) => arg.includes("git clone"))).toBe(false);
  });

  it("uses argv for rev-parse too", async () => {
    execFileSyncMock.mockReturnValue(Buffer.from("abc1234\n"));

    const result = await cloneRepo({
      git: { provider: "github", token: "", repo: "owner/repo" },
      branch: "main",
      shortId: "test1234",
      logger: noopLogger,
    });
    workDir = result.workDir;

    expect(execFileSyncMock.mock.calls[1]?.[0]).toBe("git");
    expect(execFileSyncMock.mock.calls[1]?.[1]).toEqual(["rev-parse", "HEAD"]);
    expect(execSyncMock).not.toHaveBeenCalled();
  });
});
