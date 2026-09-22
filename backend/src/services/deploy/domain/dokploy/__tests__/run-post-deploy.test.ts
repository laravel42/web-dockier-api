import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────
const mockGetProjectDeployConfig = vi.fn();
vi.mock("../../../../../shared/service-clients/projects.js", () => ({
  getProjectDeployConfig: (...a: unknown[]) => mockGetProjectDeployConfig(...a),
}));

const mockResolveTarget = vi.fn();
const mockExecInContainer = vi.fn();
vi.mock("../command-exec.js", () => ({
  resolveDokployCommandTarget: (...a: unknown[]) => mockResolveTarget(...a),
  execInDokployContainer: (...a: unknown[]) => mockExecInContainer(...a),
}));

const { stageRunPostDeploy } = await import("../stages/run-post-deploy.js");

const TARGET = { serverIp: "1.2.3.4", sshPrivateKey: "k", appName: "myapp-abc" };
const noSleep = async () => {};

describe("stageRunPostDeploy", () => {
  let logs: string[];
  const log = async (l: string) => { logs.push(l); };

  beforeEach(() => {
    logs = [];
    mockGetProjectDeployConfig.mockReset();
    mockResolveTarget.mockReset();
    mockExecInContainer.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("does nothing when no deployScript is configured", async () => {
    mockGetProjectDeployConfig.mockResolvedValue({ deployScript: "" });
    await stageRunPostDeploy({ projectId: "p1", log, sleep: noSleep });
    expect(mockResolveTarget).not.toHaveBeenCalled();
    expect(mockExecInContainer).not.toHaveBeenCalled();
  });

  it("does nothing when the script is only comments/blank lines", async () => {
    mockGetProjectDeployConfig.mockResolvedValue({ deployScript: "# a comment\n\n   \n# another" });
    await stageRunPostDeploy({ projectId: "p1", log, sleep: noSleep });
    expect(mockResolveTarget).not.toHaveBeenCalled();
  });

  it("skips (non-fatal) when no runnable target is available", async () => {
    mockGetProjectDeployConfig.mockResolvedValue({ deployScript: "php artisan migrate --force" });
    mockResolveTarget.mockResolvedValue({ target: null, errorMessage: "Redeploy the project to enable running commands." });

    await stageRunPostDeploy({ projectId: "p1", log, sleep: noSleep });

    expect(mockExecInContainer).not.toHaveBeenCalled();
    expect(logs.some((l) => /Skipping post-deploy commands/i.test(l))).toBe(true);
  });

  it("waits for the container, then runs the commands", async () => {
    mockGetProjectDeployConfig.mockResolvedValue({ deployScript: "php artisan migrate --force\nphp artisan optimize" });
    mockResolveTarget.mockResolvedValue({ target: TARGET });
    // First call = readiness probe ("true") succeeds; second = the actual script.
    mockExecInContainer
      .mockResolvedValueOnce({ exitCode: 0, output: "", timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, output: "Migrated.\n", timedOut: false });

    await stageRunPostDeploy({ projectId: "p1", log, sleep: noSleep });

    expect(mockExecInContainer).toHaveBeenCalledTimes(2);
    // Readiness probe is the trivial command.
    expect(mockExecInContainer.mock.calls[0][1]).toBe("true");
    // The real run passes the full script.
    expect(mockExecInContainer.mock.calls[1][1]).toContain("php artisan migrate --force");
    expect(logs.some((l) => /completed/i.test(l))).toBe(true);
  });

  it("logs a non-fatal note when the script exits non-zero (deploy still succeeds)", async () => {
    mockGetProjectDeployConfig.mockResolvedValue({ deployScript: "php artisan migrate --force" });
    mockResolveTarget.mockResolvedValue({ target: TARGET });
    mockExecInContainer
      .mockResolvedValueOnce({ exitCode: 0, output: "", timedOut: false }) // readiness
      .mockResolvedValueOnce({ exitCode: 1, output: "migration failed\n", timedOut: false });

    // Must not throw.
    await expect(stageRunPostDeploy({ projectId: "p1", log, sleep: noSleep })).resolves.toBeUndefined();
    expect(logs.some((l) => /exited with code 1/i.test(l))).toBe(true);
  });

  it("skips when the container never becomes ready", async () => {
    mockGetProjectDeployConfig.mockResolvedValue({ deployScript: "echo hi" });
    mockResolveTarget.mockResolvedValue({ target: TARGET });
    // Readiness probe always fails; readinessTimeoutMs=0 ends the loop immediately.
    mockExecInContainer.mockResolvedValue({ exitCode: 1, output: "not running", timedOut: false });

    await stageRunPostDeploy({ projectId: "p1", log, sleep: noSleep, readinessTimeoutMs: 0 });

    // No script run beyond (at most) probing; the "did not become ready" note is logged.
    expect(logs.some((l) => /did not become ready/i.test(l))).toBe(true);
  });

  it("does not throw if loading the config fails", async () => {
    mockGetProjectDeployConfig.mockRejectedValue(new Error("db down"));
    await expect(stageRunPostDeploy({ projectId: "p1", log, sleep: noSleep })).resolves.toBeUndefined();
    expect(mockResolveTarget).not.toHaveBeenCalled();
  });
});
