/**
 * stageRestoreProcesses: a Dokploy deploy replaces the container, so the
 * project's background processes and cron jobs must be started again in the new
 * one. The native pipeline always did this; the Dokploy one never did.
 * Pinned: it waits for the new container before starting anything, says what it
 * did in the deploy log, and never fails the deploy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const restore = vi.fn();
vi.mock("../../../../../shared/service-clients/processes.js", () => ({
  restoreProcessesAfterDeploy: (...a: unknown[]) => restore(...a),
}));
const dokploy = vi.hoisted(() => ({ resolve: vi.fn(), exec: vi.fn() }));
vi.mock("../command-exec.js", () => ({
  resolveDokployCommandTarget: dokploy.resolve,
  execInDokployContainer: dokploy.exec,
}));
vi.mock("../../../../../shared/service-clients/projects.js", () => ({ getProjectDeployConfig: vi.fn() }));

const { stageRestoreProcesses } = await import("../stages/run-post-deploy.js");

const TARGET = { serverIp: "203.0.113.5", sshPrivateKey: "k", appName: "shop" };
const noSleep = async () => {};

let lines: string[];
const log = async (l: string) => { lines.push(l); };

beforeEach(() => {
  vi.clearAllMocks();
  lines = [];
});

describe("stageRestoreProcesses", () => {
  it("waits for the new container, then reports what it restarted", async () => {
    dokploy.resolve.mockResolvedValue({ target: TARGET });
    // Not ready on the first probe, ready on the second.
    dokploy.exec
      .mockResolvedValueOnce({ exitCode: 1, output: "not running", timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, output: "", timedOut: false });
    restore.mockImplementation(async ({ waitUntilReady }: { waitUntilReady: () => Promise<boolean> }) => {
      expect(await waitUntilReady()).toBe(true);
      return { processes: 2, jobs: 1 };
    });

    await stageRestoreProcesses({ tenantId: "org-1", projectId: "p1", log, sleep: noSleep });

    expect(dokploy.exec).toHaveBeenCalledWith(TARGET, "true", expect.anything());
    expect(lines.at(-1)).toBe(
      "[stage:post-deploy] Restarted 2 background process(es) and reinstalled 1 scheduled job(s).",
    );
  });

  it("says nothing when the project has nothing to restore", async () => {
    restore.mockResolvedValue({ processes: 0, jobs: 0 });
    await stageRestoreProcesses({ tenantId: "org-1", projectId: "p1", log, sleep: noSleep });
    expect(lines).toEqual([]);
  });

  it("explains a skip, and never throws", async () => {
    restore.mockResolvedValueOnce({ processes: 0, jobs: 0, skipped: "the application container did not become ready in time" });
    await stageRestoreProcesses({ tenantId: "org-1", projectId: "p1", log, sleep: noSleep });
    expect(lines.at(-1)).toMatch(/were not restarted: the application container did not become ready in time\.$/);

    restore.mockRejectedValueOnce(new Error("db down"));
    await expect(stageRestoreProcesses({ tenantId: "org-1", projectId: "p1", log, sleep: noSleep })).resolves.toBeUndefined();
    expect(lines.at(-1)).toMatch(/Skipped restarting .*db down/);
  });
});
