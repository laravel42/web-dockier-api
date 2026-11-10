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
import { ScanCancelledError } from "./scan-cancel.js";
import type { RunScanOptions } from "./scan-worker.js";

interface ScanJobInput {
  scanId: string;
  tenantId: string;
  options: RunScanOptions;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Bounds a hang outside the per-step timeouts; must stay below the job's expireInSeconds (3600). */
const SCAN_SUBPROCESS_TIMEOUT_MS = 50 * 60 * 1000;

/** SIGTERM → SIGKILL grace. The runner has no SIGTERM handler, so the parent does its cleanup. */
const KILL_GRACE_MS = 10_000;

/** Cancellation latency: one small query per running scan per interval. */
const CANCEL_POLL_MS = 5_000;

export interface RunScanSubprocessOptions {
  /** Resolves true once a user has asked to cancel this scan. */
  isCancelled?: () => Promise<boolean>;
  pollMs?: number;
}

/** Lowest niceness the OS offers, so the scan yields to everything else. */
const SCAN_SUBPROCESS_NICENESS = 19;

/** A killed runner skips the finally that deletes it. Debug-level: usually there is no project. */
async function removeOrphanedSonarProject(scanId: string): Promise<void> {
  try {
    await deleteSonarProject(sonarProjectKeyFor(scanId));
    logger.info(`[scan] Removed SonarQube scratch project for ${scanId} after killing the subprocess`);
  } catch (err) {
    logger.debug(`[scan] No SonarQube scratch project removed for ${scanId}: ${getErrMsg(err)}`);
  }
}

/** cloneRepo's own dir only (build-<id8>-*), never a tmpdir sweep that could hit a concurrent scan. */
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

/** A detached runner leads its own group, so signalling -pid also reaches Semgrep and sonar-scanner. */
const liveGroups = new Set<number>();

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // Group already gone, or no process groups here: signal the runner alone.
    try {
      child.kill(signal);
    } catch {
      // already exited
    }
  }
}

// Detaching drops the terminal's Ctrl-C, so the groups must die with this process.
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

/** WebSocket subscribers and the event bus exist only in this process, not in the child. */
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
  options: RunScanSubprocessOptions = {},
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

    // Semgrep cannot be throttled and otherwise starves the API; best-effort, never fails a scan.
    try {
      os.setPriority(child.pid as number, SCAN_SUBPROCESS_NICENESS);
    } catch (err) {
      logger.warn(`[scan] Could not lower the subprocess priority: ${getErrMsg(err)}`);
    }

    let stopReason: "timeout" | "cancelled" | null = null;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    /** The first reason wins. */
    const terminate = (reason: "timeout" | "cancelled") => {
      if (stopReason) return;
      stopReason = reason;
      killGroup(child, "SIGTERM");
      killTimer = setTimeout(() => killGroup(child, "SIGKILL"), KILL_GRACE_MS);
      killTimer.unref?.();
    };

    const deadline = setTimeout(() => {
      logger.error(
        `[scan] Subprocess for ${input.scanId} exceeded ${Math.round(timeoutMs / 60000)}m, terminating`,
      );
      terminate("timeout");
    }, timeoutMs);
    deadline.unref?.();

    let cancelPoll: ReturnType<typeof setInterval> | undefined;
    let polling = false;
    if (options.isCancelled) {
      const isCancelled = options.isCancelled;
      cancelPoll = setInterval(() => {
        // One query at a time: a slow database must not stack up requests.
        if (polling || stopReason) return;
        polling = true;
        isCancelled()
          .then((requested) => {
            if (!requested) return;
            logger.info(`[scan] Cancel requested for ${input.scanId}, terminating`);
            terminate("cancelled");
          })
          // A flaky database must not kill a healthy scan; the next tick retries.
          .catch((err: unknown) => logger.warn(`[scan] Could not check for cancellation: ${getErrMsg(err)}`))
          .finally(() => {
            polling = false;
          });
      }, options.pollMs ?? CANCEL_POLL_MS);
      cancelPoll.unref?.();
    }

    /** Every timer must go on every exit path, or the worker never settles. */
    const clearTimers = () => {
      clearTimeout(deadline);
      if (killTimer) clearTimeout(killTimer);
      if (cancelPoll) clearInterval(cancelPoll);
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

      // A clean exit that raced the kill is a real result; keep it.
      const finishedCleanly = code === 0 && signal === null;

      if (stopReason && !finishedCleanly) {
        // The runner can die on SIGTERM while a descendant ignores it.
        killGroup(child, "SIGKILL");
        void Promise.all([removeOrphanedWorkDirs(input.scanId), removeOrphanedSonarProject(input.scanId)]).finally(() => {
          reject(
            stopReason === "cancelled"
              ? new ScanCancelledError()
              : new Error(
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
