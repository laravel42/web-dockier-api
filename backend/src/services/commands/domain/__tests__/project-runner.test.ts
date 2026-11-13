/**
 * resolveProjectRunner: the one rule for where a project's commands run, used by
 * the Commands panel, background processes, cron jobs and the post-deploy restore.
 * Processes and cron jobs used to skip it and always took the native path, so on
 * Dokploy they never reached the container.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({ env: createTestEnv() }));
vi.mock("../../../../shared/database/queue.js", () => ({
  COMMAND_EXEC_QUEUE: "command-exec",
  createWorker: () => ({ register: vi.fn(), enqueue: vi.fn() }),
}));

const dokploy = vi.hoisted(() => ({ resolve: vi.fn(), exec: vi.fn(), getServer: vi.fn() }));
vi.mock("../../../deploy/domain/dokploy/command-exec.js", () => ({
  resolveDokployCommandTarget: dokploy.resolve,
  execInDokployContainer: dokploy.exec,
}));
vi.mock("../../../deploy/domain/dokploy/mappings.js", () => ({ getServer: dokploy.getServer }));

const native = vi.hoisted(() => ({ exec: vi.fn(), active: vi.fn() }));
vi.mock("../executor.js", () => ({ executeCommand: native.exec }));
vi.mock("../../../../shared/service-clients/deployments.js", () => ({ getActiveDeployment: native.active }));

const { resolveProjectRunner } = await import("../worker.js");

const DOKPLOY_TARGET = { serverIp: "203.0.113.5", sshPrivateKey: "key", appName: "shop" };

beforeEach(() => vi.clearAllMocks());

describe("resolveProjectRunner", () => {
  it("runs inside the Dokploy container when the project has one", async () => {
    dokploy.resolve.mockResolvedValue({ target: DOKPLOY_TARGET });
    dokploy.exec.mockResolvedValue({ exitCode: 0, output: "STARTED", timedOut: false });

    const runner = await resolveProjectRunner("p1", "org-1");
    const result = await runner.run!("echo hi");

    expect(dokploy.exec).toHaveBeenCalledWith(DOKPLOY_TARGET, "echo hi");
    expect(result.output).toBe("STARTED");
    expect(native.exec).not.toHaveBeenCalled();
    expect(native.active).not.toHaveBeenCalled();
  });

  it("reports why a Dokploy server cannot run it, instead of trying the native path", async () => {
    dokploy.resolve.mockResolvedValue({ target: null, errorMessage: "The deployment server isn't ready yet." });
    dokploy.getServer.mockResolvedValue({ serverStatus: "provisioning" });

    const runner = await resolveProjectRunner("p1", "org-1");

    expect(runner).toEqual({ run: null, errorMessage: "The deployment server isn't ready yet." });
    expect(native.active).not.toHaveBeenCalled();
  });

  it("falls back to the native target for a project with no Dokploy server", async () => {
    dokploy.resolve.mockResolvedValue({ target: null, errorMessage: "no server" });
    dokploy.getServer.mockResolvedValue(null);
    native.active.mockResolvedValue(null);

    const runner = await resolveProjectRunner("p1", "org-1");

    expect(native.active).toHaveBeenCalledWith("p1", "org-1");
    expect(runner.run).toBeNull();
    expect((runner as { errorMessage: string }).errorMessage).toMatch(/No active deployment/);
  });
});
