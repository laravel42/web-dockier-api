/**
 * The scan subprocess had no deadline at all.
 *
 * Every step inside it is bounded — clone 120s, semgrep 600s per batch,
 * sonar-scanner 300s plus a 120s task poll — but a hang outside those ran
 * forever. pg-boss expired the job at an hour and the worker reported a
 * failure, while the child carried on with its clone still on disk, invisible
 * to the queue, the UI and the reconciler alike.
 *
 * These drive the real `spawn` with short-lived scripts rather than a mocked
 * child, because what matters is that a process actually dies and its directory
 * actually goes. A faked ChildProcess would assert that `.kill()` was called and
 * prove neither.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// The runner reaches the database only through scan-cancel's error type here;
// nothing in these tests may touch Supabase, and importing it needs live config.
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: {} }));

const deleteSonarProject = vi.fn(async (_key: string) => {});
vi.mock("../sonarqube.js", () => ({
  deleteSonarProject: (key: string) => deleteSonarProject(key),
  sonarProjectKeyFor: (id: string) => `scan-${id}`,
}));

const { runScanInSubprocess } = await import("../run-scan-subprocess.js");

/** A scan id whose first 8 characters are unique to this run. */
const scanId = () => `${Date.now().toString(16).slice(-8)}-dead-4bee-8111-000000000000`;

/** Mirrors cloneRepo: <tmpdir>/build-<shortId>-XXXXXX. */
async function makeWorkDir(id: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `build-${id.slice(0, 8)}-`));
  await mkdir(join(dir, "repo"), { recursive: true });
  await writeFile(join(dir, "repo", "app.js"), "// clone contents\n", "utf-8");
  return dir;
}

/** Direct children of this process, so a spawned runner can be inspected. */
async function childPidsOfThisProcess(): Promise<number[]> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("pgrep", ["-P", String(process.pid)]).catch(() => ({
    stdout: "",
  }));
  return stdout
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function workDirsFor(id: string): Promise<string[]> {
  const prefix = `build-${id.slice(0, 8)}-`;
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && e.name.startsWith(prefix)).map((e) => e.name);
}

/**
 * Stand in for scan-runner.js next to the module under test, so the resolver
 * finds it: resolveScanRunnerSpawnArgs() prefers `scan-runner.js` in its own
 * directory. Restored afterwards.
 */
const runnerPath = join(import.meta.dirname, "..", "scan-runner.js");
let runnerExisted = false;

async function installRunner(body: string): Promise<void> {
  await writeFile(runnerPath, body, "utf-8");
}

beforeEach(() => {
  deleteSonarProject.mockClear();
  runnerExisted = existsSync(runnerPath);
  expect(runnerExisted).toBe(false); // a built dist runner would be clobbered
});

afterEach(async () => {
  await rm(runnerPath, { force: true });
});

/** True while the process exists. Signal 0 only probes. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("runScanInSubprocess", () => {
  it("resolves when the runner exits cleanly", async () => {
    await installRunner("process.exit(0);\n");
    await expect(runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} })).resolves.toBeUndefined();
  });

  it("rejects with the exit code when the runner fails", async () => {
    await installRunner("process.exit(3);\n");
    await expect(
      runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }),
    ).rejects.toThrow(/code 3/);
  });

  it("kills a runner that ignores SIGTERM and never exits", async () => {
    // The actual failure mode: a wedged process. SIGTERM is trapped here on
    // purpose, so only the SIGKILL that follows can end it.
    await installRunner(`
      process.on("SIGTERM", () => {});
      setInterval(() => {}, 1000);
    `);
    const id = scanId();
    const started = Date.now();

    await expect(
      runScanInSubprocess({ scanId: id, tenantId: "t", options: {} }, 300),
    ).rejects.toThrow(/timed out after/);

    // Returned on the kill, not on some later tick.
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 40_000);

  it("removes the clone the killed runner left behind", async () => {
    // The child is signalled mid-clone, so the `finally` that would have
    // removed this never runs — the parent has to.
    const id = scanId();
    const workDir = await makeWorkDir(id);
    expect(existsSync(workDir)).toBe(true);

    await installRunner('setInterval(() => {}, 1000);\n');
    await expect(
      runScanInSubprocess({ scanId: id, tenantId: "t", options: {} }, 300),
    ).rejects.toThrow(/timed out/);

    expect(existsSync(workDir)).toBe(false);
    expect(await workDirsFor(id)).toEqual([]);
  }, 40_000);

  it("kills what the runner launched, not just the runner", async () => {
    // Semgrep and sonar-scanner are grandchildren of this process. Signalling
    // only the runner left them running for up to their own timeouts, long
    // after the scan was declared dead. The runner here dies on SIGTERM (like
    // the real one, which installs no handler) while its child ignores it.
    const pidFile = join(await mkdtemp(join(tmpdir(), "scan-grandchild-")), "pid");
    await installRunner(`
      import { spawn } from "node:child_process";
      import { writeFileSync } from "node:fs";
      const grandchild = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
      writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
      setInterval(() => {}, 1000);
    `);
    const { readFileSync } = await import("node:fs");
    let grandchildPid = 0;
    try {
      await expect(
        runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }, 1500),
      ).rejects.toThrow(/timed out/);
      grandchildPid = Number(readFileSync(pidFile, "utf-8"));
      expect(grandchildPid).toBeGreaterThan(0);
      // Give the kernel a moment to reap after SIGKILL.
      await new Promise((r) => setTimeout(r, 300));
      expect(isAlive(grandchildPid)).toBe(false);
    } finally {
      if (grandchildPid > 0 && isAlive(grandchildPid)) process.kill(grandchildPid, "SIGKILL");
      await rm(join(pidFile, ".."), { recursive: true, force: true });
    }
  }, 40_000);

  it("deletes the scratch SonarQube project of the scan it killed", async () => {
    // The runner removes it in a `finally` that a signal skips, so without this
    // every timed-out scan leaves a project on the server for good.
    const id = scanId();
    await installRunner("setInterval(() => {}, 1000);\n");
    await expect(
      runScanInSubprocess({ scanId: id, tenantId: "t", options: {} }, 300),
    ).rejects.toThrow(/timed out/);
    expect(deleteSonarProject).toHaveBeenCalledExactlyOnceWith(`scan-${id}`);
  }, 40_000);

  it("still reports the timeout when the SonarQube delete fails", async () => {
    deleteSonarProject.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await installRunner("setInterval(() => {}, 1000);\n");
    await expect(
      runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }, 300),
    ).rejects.toThrow(/timed out/);
  }, 40_000);

  it("does not touch SonarQube after a runner that failed on its own", async () => {
    // The runner's own finally already ran; deleting again would be a request
    // per failed scan against a server that may not exist.
    await installRunner("process.exit(1);\n");
    await expect(
      runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }),
    ).rejects.toThrow(/code 1/);
    expect(deleteSonarProject).not.toHaveBeenCalled();
  });

  it("stops the runner when a cancel is requested, and says it was a cancel", async () => {
    // Real process, real poll: what matters is that a cancel ends it quickly and
    // the caller can tell it apart from a timeout.
    const { ScanCancelledError } = await import("../scan-cancel.js");
    await installRunner("setInterval(() => {}, 1000);\n");
    let requested = false;
    setTimeout(() => (requested = true), 400);
    const started = Date.now();

    await expect(
      runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }, 600_000, {
        isCancelled: async () => requested,
        pollMs: 100,
      }),
    ).rejects.toBeInstanceOf(ScanCancelledError);

    expect(Date.now() - started).toBeLessThan(15_000);
  }, 40_000);

  it("cleans up after a cancelled runner like it does after a timeout", async () => {
    const id = scanId();
    const workDir = await makeWorkDir(id);
    await installRunner("setInterval(() => {}, 1000);\n");

    await expect(
      runScanInSubprocess({ scanId: id, tenantId: "t", options: {} }, 600_000, {
        isCancelled: async () => true,
        pollMs: 100,
      }),
    ).rejects.toThrow(/cancelled/i);

    expect(existsSync(workDir)).toBe(false);
    expect(deleteSonarProject).toHaveBeenCalledExactlyOnceWith(`scan-${id}`);
  }, 40_000);

  it("keeps a scan that finished cleanly just as the cancel went out", async () => {
    // The kill can race the runner's last instruction. Here the runner answers
    // the signal by exiting 0, which is a result: throwing it away would
    // "cancel" a scan that had in fact completed.
    await installRunner(`
      process.on("SIGTERM", () => process.exit(0));
      setInterval(() => {}, 1000);
    `);

    await expect(
      runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }, 600_000, {
        isCancelled: async () => true,
        pollMs: 100,
      }),
    ).resolves.toBeUndefined();
  }, 40_000);

  it("does not kill a healthy scan because the cancel check failed", async () => {
    // A flaky database must cost the cancel one tick, not the scan.
    await installRunner("setTimeout(() => process.exit(0), 600);\n");
    const check = vi.fn().mockRejectedValue(new Error("connection terminated"));

    await expect(
      runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }, 600_000, {
        isCancelled: check,
        pollMs: 50,
      }),
    ).resolves.toBeUndefined();
    expect(check).toHaveBeenCalled();
  }, 40_000);

  it("asks one question at a time, however slow the database is", async () => {
    await installRunner("setTimeout(() => process.exit(0), 700);\n");
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((r) => setTimeout(r, 300));
      inFlight--;
      return false;
    };

    await runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }, 600_000, {
      isCancelled: slow,
      pollMs: 20,
    });
    expect(maxInFlight).toBe(1);
  }, 40_000);

  it("leaves another scan's clone alone", async () => {
    // Scoped to this scan's own prefix. A broad sweep of the temp directory
    // would delete a concurrent scan's repository out from under it.
    const mine = scanId();
    const other = "99999999-aaaa-4bbb-8ccc-000000000000";
    const otherDir = await makeWorkDir(other);

    try {
      await installRunner('setInterval(() => {}, 1000);\n');
      await expect(
        runScanInSubprocess({ scanId: mine, tenantId: "t", options: {} }, 300),
      ).rejects.toThrow(/timed out/);

      expect(existsSync(otherDir)).toBe(true);
    } finally {
      await rm(otherDir, { recursive: true, force: true });
    }
  }, 40_000);

  it("does not clean up after a runner that failed on its own", async () => {
    // Only the timeout path signals the child. A runner that exits by itself
    // already ran its own cleanup, and deleting here would race a retry.
    const id = scanId();
    const workDir = await makeWorkDir(id);

    try {
      await installRunner("process.exit(1);\n");
      await expect(
        runScanInSubprocess({ scanId: id, tenantId: "t", options: {} }),
      ).rejects.toThrow(/code 1/);

      expect(existsSync(workDir)).toBe(true);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

/**
 * A scan has to lose CPU races against the process serving requests.
 *
 * Semgrep takes roughly six of eight cores and cannot be throttled — `--jobs`
 * was measured and barely moves it (559% -> 520% CPU, and slightly slower). On
 * one machine with the API, the scan and the dev servers, the site stopped
 * responding for the length of a scan and recovered the moment it ended. In
 * production the same contention means one tenant's scan degrades the API for
 * everyone else.
 */
describe("subprocess priority", () => {
  it("runs the scan at the lowest niceness, leaving the parent alone", async () => {
    const os = await import("node:os");
    const parentBefore = os.getPriority(process.pid);

    // Long enough to read the child's priority while it is alive.
    await installRunner("setTimeout(() => process.exit(0), 2000);\n");

    let childPriority: number | undefined;
    const spawned = runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }, 30_000);

    await new Promise((r) => setTimeout(r, 400));
    for (const pid of await childPidsOfThisProcess()) {
      try {
        childPriority = os.getPriority(pid);
      } catch {
        // exited already
      }
    }

    await expect(spawned).resolves.toBeUndefined();

    expect(childPriority).toBe(19);
    // Niceness is per-process: lowering the child's must not touch ours, or the
    // API would be slowed by the very thing meant to get out of its way.
    expect(os.getPriority(process.pid)).toBe(parentBefore);
  }, 40_000);

  it("still runs the scan if the priority call is refused", async () => {
    // Platform-dependent and never worth failing a scan over.
    const os = await import("node:os");
    const spy = vi.spyOn(os.default, "setPriority").mockImplementation(() => {
      throw new Error("EPERM");
    });

    try {
      await installRunner("process.exit(0);\n");
      await expect(
        runScanInSubprocess({ scanId: scanId(), tenantId: "t", options: {} }),
      ).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
