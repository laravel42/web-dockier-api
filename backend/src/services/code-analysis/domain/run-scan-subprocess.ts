import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { broadcastScanEvent, type ScanWsMessage } from "./scan-events.js";
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

interface ScanIpcMessage {
  type: "scan-event";
  scanId: string;
  message: ScanWsMessage;
}

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

function relayScanIpc(msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const payload = msg as Partial<ScanIpcMessage>;
  if (payload.type !== "scan-event" || !payload.scanId || !payload.message) return;
  broadcastScanEvent(payload.scanId, payload.message);
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
      });
    } catch (err) {
      reject(err);
      return;
    }

    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const deadline = setTimeout(() => {
      timedOut = true;
      logger.error(
        `[scan] Subprocess for ${input.scanId} exceeded ${Math.round(timeoutMs / 60000)}m, terminating`,
      );
      child.kill("SIGTERM");
      // The runner installs no SIGTERM handler, so this is the one that
      // actually ends a wedged process.
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
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
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimers();

      if (timedOut) {
        // The child was signalled mid-clone, so its own cleanup never ran.
        void removeOrphanedWorkDirs(input.scanId).finally(() => {
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
