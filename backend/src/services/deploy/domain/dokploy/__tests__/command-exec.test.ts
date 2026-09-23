import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

// ─── Mocks ─────────────────────────────────────────────────────────
// Mappings (target resolution reads server + application).
const mockGetServer = vi.fn();
const mockGetApplication = vi.fn();
vi.mock("../mappings.js", () => ({
  getServer: (...a: unknown[]) => mockGetServer(...a),
  getApplication: (...a: unknown[]) => mockGetApplication(...a),
}));

// child_process.spawn — capture args and drive a fake process.
const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
let fakeProc: FakeProc;
vi.mock("node:child_process", () => ({
  spawn: (cmd: string, args: string[]) => {
    spawnCalls.push({ cmd, args });
    return fakeProc;
  },
}));

// fs temp-key handling — no real files.
vi.mock("node:fs/promises", () => ({
  mkdtemp: vi.fn(async () => "/tmp/dokploy-cmd-test"),
  writeFile: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
}));

const { resolveDokployCommandTarget, execInDokployContainer, runDokployCommand } = await import("../command-exec.js");

// ─── Fake child process ────────────────────────────────────────────
class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
  /** Emit output then close with a code, on next tick. */
  finish(output: string, code: number) {
    setImmediate(() => {
      if (output) this.stdout.emit("data", Buffer.from(output));
      this.emit("close", code);
    });
  }
}

const READY_SERVER = {
  serverIp: "1.2.3.4",
  serverStatus: "ready",
  sshPrivateKey: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----",
};
const APP = { appName: "myapp-abc123" };

describe("resolveDokployCommandTarget", () => {
  beforeEach(() => { mockGetServer.mockReset(); mockGetApplication.mockReset(); });

  it("returns a target when server is ready with a key and app has appName", async () => {
    mockGetServer.mockResolvedValue(READY_SERVER);
    mockGetApplication.mockResolvedValue(APP);
    const { target, errorMessage } = await resolveDokployCommandTarget("p1");
    expect(errorMessage).toBeUndefined();
    expect(target).toEqual({ serverIp: "1.2.3.4", sshPrivateKey: READY_SERVER.sshPrivateKey, appName: "myapp-abc123" });
  });

  it("fails with a user-facing message when there is no server", async () => {
    mockGetServer.mockResolvedValue(null);
    const { target, errorMessage } = await resolveDokployCommandTarget("p1");
    expect(target).toBeNull();
    expect(errorMessage).toMatch(/no deployed server/i);
  });

  it("fails when the server is not ready", async () => {
    mockGetServer.mockResolvedValue({ ...READY_SERVER, serverStatus: "provisioning" });
    const { target, errorMessage } = await resolveDokployCommandTarget("p1");
    expect(target).toBeNull();
    expect(errorMessage).toMatch(/isn't ready/i);
  });

  it("fails (redeploy hint) when the server has no stored SSH key", async () => {
    mockGetServer.mockResolvedValue({ ...READY_SERVER, sshPrivateKey: null });
    const { target, errorMessage } = await resolveDokployCommandTarget("p1");
    expect(target).toBeNull();
    expect(errorMessage).toMatch(/redeploy/i);
  });

  it("fails when the application appName is unknown", async () => {
    mockGetServer.mockResolvedValue(READY_SERVER);
    mockGetApplication.mockResolvedValue({ appName: null });
    const { target, errorMessage } = await resolveDokployCommandTarget("p1");
    expect(target).toBeNull();
    expect(errorMessage).toMatch(/could not locate/i);
  });
});

describe("execInDokployContainer", () => {
  beforeEach(() => { spawnCalls.length = 0; fakeProc = new FakeProc(); });
  afterEach(() => vi.clearAllMocks());

  const target = { serverIp: "1.2.3.4", sshPrivateKey: READY_SERVER.sshPrivateKey, appName: "myapp-abc123" };

  it("SSHes with the expected args and returns the command result", async () => {
    fakeProc.finish("hello\n", 0);
    const result = await execInDokployContainer(target, "echo hello");

    expect(result).toEqual({ exitCode: 0, output: "hello\n", timedOut: false });
    expect(spawnCalls).toHaveLength(1);
    const { cmd, args } = spawnCalls[0];
    expect(cmd).toBe("ssh");
    expect(args).toContain("root@1.2.3.4");
    expect(args).toContain("StrictHostKeyChecking=no");
    // The remote script resolves the container by appName and execs the command.
    const remote = args[args.length - 1];
    // Primary resolution targets the running Swarm task (survives rollouts),
    // with a name-match fallback.
    expect(remote).toContain("label=com.docker.swarm.service.name=myapp-abc123");
    expect(remote).toContain('docker ps --filter "name=myapp-abc123"');
    expect(remote).toContain("docker exec");
    expect(remote).toContain("echo hello");
  });

  it("escapes single quotes in the command", async () => {
    fakeProc.finish("", 0);
    await execInDokployContainer(target, "echo 'hi'");
    const remote = spawnCalls[0].args[spawnCalls[0].args.length - 1];
    // Single quote is escaped for embedding in sh -c '...'
    expect(remote).toContain("'\\''");
  });

  it("propagates a non-zero exit code", async () => {
    fakeProc.finish("boom\n", 3);
    const result = await execInDokployContainer(target, "false");
    expect(result).toMatchObject({ exitCode: 3, timedOut: false });
  });

  it("rejects an unsafe appName without spawning ssh", async () => {
    const result = await execInDokployContainer({ ...target, appName: "bad name;rm" }, "echo hi");
    expect(result.exitCode).toBe(1);
    expect(spawnCalls).toHaveLength(0);
  });

  it("is a no-op for an empty command", async () => {
    const result = await execInDokployContainer(target, "   ");
    expect(result).toEqual({ exitCode: 0, output: "", timedOut: false });
    expect(spawnCalls).toHaveLength(0);
  });
});

describe("runDokployCommand", () => {
  beforeEach(() => { spawnCalls.length = 0; fakeProc = new FakeProc(); mockGetServer.mockReset(); mockGetApplication.mockReset(); });

  it("returns the resolution error as a failed result when no target", async () => {
    mockGetServer.mockResolvedValue(null);
    const result = await runDokployCommand("p1", "echo hi");
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/no deployed server/i);
    expect(spawnCalls).toHaveLength(0);
  });

  it("executes when a target resolves", async () => {
    mockGetServer.mockResolvedValue(READY_SERVER);
    mockGetApplication.mockResolvedValue(APP);
    fakeProc.finish("ok\n", 0);
    const result = await runDokployCommand("p1", "echo ok");
    expect(result).toMatchObject({ exitCode: 0, output: "ok\n" });
  });
});
