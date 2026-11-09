import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os, { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { emit } from "../../../shared/events.js";
import { broadcastScanEvent, type ScanIpcMessage } from "./scan-events.js";
import { deleteSonarProject, sonarProjectKeyFor } from "./sonarqube.js";
import type { RunScanOptions } from "./scan-worker.js";

interface ScanJobInput {
  scanId: string;
  tenantId: string;
  options: RunScanOptions;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Deadline for the whole scan subprocess.
 *
 * Must stay BELOW the job's `expireInSeconds` (3600, see domain/worker.ts).
 * Nothing used to bound this: every step has its own timeout — clone 120s,
 * semgrep 600s per batch, sonar-scanner 300s plus a 120s task poll — but a hang
 * outside them ran forever. pg-boss would expire the job at an hour and the
 * worker would report a failure, while the child kept running with its clone on
 * disk, invisible to everything. Killing it first means the scan fails through
 * the normal path, with the reason named.
 *
 * 50 minutes leaves ten for the rejection to mark the scan failed. It bounds a
 * hang rather than accommodating every repository; a legitimate scan that needs
 * longer is a signal in itself, and the log says which limit it hit.
 */
const SCAN_SUBPROCESS_TIMEOUT_MS = 50 * 60 * 1000;

/**
 * Grace period between SIGTERM and SIGKILL.
 *
 * SIGTERM is sent first on principle, but it buys little here: the runner
 * installs no handler, so Node's default terminates it without running the
 * `finally` that removes the clone. That is why the parent cleans up below.
 */
const KILL_GRACE_MS = 10_000;

/** Lowest niceness the OS offers, so the scan yields to everything else. */
const SCAN_SUBPROCESS_NICENESS = 19;

/**
 * Delete the scratch SonarQube project a killed runner may have left behind.
 *
 * The runner deletes it in a `finally` that a signal skips. Best-effort and
 * silent about "nothing to delete": a scan that never reached SonarQube, or a
 * deployment without it, has no such project and that is not worth a warning.
 */
async function removeOrphanedSonarProject(scanId: string): Promise<void> {
  try {
    await deleteSonarProject(sonarProjectKeyFor(scanId));
    logger.info(`[scan] Removed SonarQube scratch project for ${scanId} after killing the subprocess`);
  } catch (err) {
    logger.debug(`[scan] No SonarQube scratch project removed for ${scanId}: ${getErrMsg(err)}`);
  }
}

/**
 * Remove clone directories left by a killed child.
 *
 * `cloneRepo` creates `<tmpdir>/build-<shortId>-XXXXXX` and deletes it in a
 * `finally` the child never reaches once signalled, so the parent has to. Scoped
 * to this scan's own prefix — never a broad sweep of the temp directory — and
 * best-effort: failing to reclaim disk must not replace the real error.
 */
async function removeOrphanedWorkDirs(scanId: string): Promise<void> {
  const prefix = `build-${scanId.slice(0, 8)}-`;
  const root = tmpdir();
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
      await rm(join(root, entry.name), { recursive: true, force: true });
      logger.info(`[scan] Removed orphaned clone ${entry.name} after killing the subprocess`);
    }
  } catch (err) {
    logger.warn(`[scan] Could not clean up after the subprocess: ${getErrMsg(err)}`);
  }
}

/**
 * Process groups of the scans running right now.
 *
 * The runner is spawned `detached`, which makes it the leader of a new group
 * whose id is its pid. Everything it launches — Semgrep, sonar-scanner and the
 * JVM under it — inherits that group, so one signal to `-pid` reaches them all.
 * Signalling only the runner left them orphaned and burning CPU until their own
 * timeouts (600s per Semgrep batch), long after the scan had been declared dead.
 */
const liveGroups = new Set<number>();

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH: the group is already gone. Anything else (no process groups on
    // this platform) falls back to the runner alone, which is what we had.
    try {
      child.kill(signal);
    } catch {
      // already exited
    }
  }
}

// Detaching also detaches the group from the terminal, so Ctrl-C in dev no
// longer reaches a scan on its own, and a restart would orphan it. Tie the
// groups to this process's lifetime instead.
process.once("exit", () => {
  for (const pgid of liveGroups) {
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // already gone
    }
  }
});

/** tsx only exports the loader on "." — dist/cli.mjs is not in "exports". */
function resolveTsxLoader(): string {
  const backendPkg = join(__dirname, "../../../../package.json");
  const require = createRequire(backendPkg);
  return require.resolve("tsx");
}

/** Production runs compiled scan-runner.js with plain node; dev uses tsx on the .ts source. */
function resolveScanRunnerSpawnArgs(): string[] {
  const jsRunner = join(__dirname, "scan-runner.js");
  if (existsSync(jsRunner)) {
    return [jsRunner];
  }

  const tsRunner = join(__dirname, "scan-runner.ts");
  const tsxLoader = resolveTsxLoader();
  return ["--import", tsxLoader, tsRunner];
}

/**
 * Deliver what the child could not reach on its own.
 *
 * WebSocket subscribers and the domain event bus both live only in this
 * process. The notification case is why a completed scan used to notify nobody:
 * the child emitted onto an event bus whose listener array is empty there.
 */
function relayScanIpc(msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const payload = msg as Partial<ScanIpcMessage>;

  if (payload.type === "scan-event" && payload.scanId && payload.message) {
    broadcastScanEvent(payload.scanId, payload.message);
    return;
  }

  if (payload.type === "scan-notification" && payload.event) {
    emit("notification:send", payload.event);
  }
}

export function runScanInSubprocess(
  input: ScanJobInput,
  timeoutMs: number = SCAN_SUBPROCESS_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const runnerArgs = [...resolveScanRunnerSpawnArgs(), JSON.stringify(input)];

    let child: ChildProcess;
    try {
      child = spawn(process.execPath, runnerArgs, {
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        env: process.env,
        detached: true,
      });
    } catch (err) {
      reject(err);
      return;
    }

    if (child.pid !== undefined) liveGroups.add(child.pid);
    const childPid = child.pid;

    // A scan must lose CPU races against the process serving requests.
    //
    // Semgrep alone takes around six of eight cores and cannot be throttled:
    // `--jobs` was measured and barely moves it (559% -> 520% CPU, and
    // slightly slower). With the API, the scan and — in development — Vite and
    // tsx on one machine, the result was a site that stopped responding for
    // the length of a scan and recovered the moment it ended. In production the
    // same contention means one tenant's scan degrades the API for every other.
    //
    // Niceness only decides who yields under contention, so this costs the scan
    // nothing on an idle box. Best-effort: lowering priority needs no privilege,
    // but the call is platform-dependent and must never fail a scan.
    try {
      os.setPriority(child.pid as number, SCAN_SUBPROCESS_NICENESS);
    } catch (err) {
      logger.warn(`[scan] Could not lower the subprocess priority: ${getErrMsg(err)}`);
    }

    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const deadline = setTimeout(() => {
      timedOut = true;
      logger.error(
        `[scan] Subprocess for ${input.scanId} exceeded ${Math.round(timeoutMs / 60000)}m, terminating`,
      );
      killGroup(child, "SIGTERM");
      // The runner installs no SIGTERM handler, so this is the one that
      // actually ends a wedged process.
      killTimer = setTimeout(() => killGroup(child, "SIGKILL"), KILL_GRACE_MS);
      killTimer.unref?.();
    }, timeoutMs);
    deadline.unref?.();

    /** Both timers must go on every exit path, or the worker never settles. */
    const clearTimers = () => {
      clearTimeout(deadline);
      if (killTimer) clearTimeout(killTimer);
    };

    child.on("message", relayScanIpc);

    child.on("error", (err) => {
      clearTimers();
      if (childPid !== undefined) liveGroups.delete(childPid);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimers();
      if (childPid !== undefined) liveGroups.delete(childPid);

      if (timedOut) {
        // The runner may have exited on SIGTERM while a descendant did not, and
        // the SIGKILL timer was just cleared. One more pass over the group.
        killGroup(child, "SIGKILL");
        // The runner was signalled mid-clone, so its own cleanup never ran:
        // not the clone directory, and not the scratch project it may have
        // created on the SonarQube server.
        void Promise.all([removeOrphanedWorkDirs(input.scanId), removeOrphanedSonarProject(input.scanId)]).finally(() => {
          reject(
            new Error(
              `Scan timed out after ${Math.round(timeoutMs / 60000)} minutes and was terminated. ` +
                "Try again, or scan a smaller branch if the repository is very large.",
            ),
          );
        });
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }
      const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
      reject(new Error(`Scan subprocess exited with ${detail}`));
    });
  });
}
