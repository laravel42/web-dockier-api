import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────
const mockResolveTarget = vi.fn();
const mockExecOnHost = vi.fn();
vi.mock("../command-exec.js", () => ({
  resolveDokployCommandTarget: (...a: unknown[]) => mockResolveTarget(...a),
  execOnDokployHost: (...a: unknown[]) => mockExecOnHost(...a),
}));

const { fetchBuildLogTail } = await import("../stages/build-log.js");

const TARGET = { serverIp: "1.2.3.4", sshPrivateKey: "k", appName: "myapp-abc" };
const LOG_PATH = "/etc/dokploy/logs/myapp-abc/myapp-abc-2026-10-15:21:40:00.log";

describe("fetchBuildLogTail", () => {
  beforeEach(() => {
    mockResolveTarget.mockReset();
    mockExecOnHost.mockReset();
    mockResolveTarget.mockResolvedValue({ target: TARGET });
  });

  it("returns the log tail and reads it with a capped, quoted tail command", async () => {
    mockExecOnHost.mockResolvedValue({ exitCode: 0, output: "build output\n", timedOut: false });

    const out = await fetchBuildLogTail({ projectId: "p1", logPath: LOG_PATH });

    expect(out).toBe("build output\n");
    const [target, remoteCommand, opts] = mockExecOnHost.mock.calls[0];
    expect(target).toBe(TARGET);
    // Truncation happens on the server, so a multi-megabyte log is never moved.
    expect(remoteCommand).toContain("tail -c 262144");
    expect(remoteCommand).toContain(`'${LOG_PATH}'`);
    // Bounded: this runs on a path that is already reporting a failure.
    expect(opts).toMatchObject({ timeoutMs: 30_000 });
  });

  it("returns '' when the project has no runnable target", async () => {
    mockResolveTarget.mockResolvedValue({ target: null, errorMessage: "no server" });
    expect(await fetchBuildLogTail({ projectId: "p1", logPath: LOG_PATH })).toBe("");
    expect(mockExecOnHost).not.toHaveBeenCalled();
  });

  it("returns '' on a non-zero exit (missing file, ssh failure, timeout)", async () => {
    mockExecOnHost.mockResolvedValue({ exitCode: 1, output: "no such file", timedOut: false });
    expect(await fetchBuildLogTail({ projectId: "p1", logPath: LOG_PATH })).toBe("");
  });

  it("rejects an unsafe or relative logPath without running anything", async () => {
    for (const bad of ["relative/path.log", "/etc/dokploy/logs/a';rm -rf /;'.log", "/etc/dokploy/../logs/a.log", ""]) {
      expect(await fetchBuildLogTail({ projectId: "p1", logPath: bad })).toBe("");
    }
    expect(mockExecOnHost).not.toHaveBeenCalled();
  });

  it("never throws when the exec or the target resolution throws", async () => {
    mockExecOnHost.mockRejectedValue(new Error("boom"));
    expect(await fetchBuildLogTail({ projectId: "p1", logPath: LOG_PATH })).toBe("");

    mockResolveTarget.mockRejectedValue(new Error("db down"));
    expect(await fetchBuildLogTail({ projectId: "p1", logPath: LOG_PATH })).toBe("");
  });
});
