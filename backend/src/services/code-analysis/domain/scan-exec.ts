/**
 * Subprocess execution primitives for the security scanner.
 *
 * Locates the semgrep binary and runs external commands with an output cap and
 * an optional timeout. Kept separate from the scan orchestration so the process
 * plumbing can be reasoned about (and reused) on its own.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Hard cap on captured stdout to avoid unbounded memory growth (50 MB). */
const MAX_COMMAND_OUTPUT = 50 * 1024 * 1024;

/**
 * Resolve the semgrep binary path, preferring a user-local install, then a
 * Homebrew location, then whatever is on PATH.
 */
export function findSemgrepBinary(): string {
  const candidates = [
    join(homedir(), ".local", "bin", "semgrep"),
    "/opt/homebrew/bin/semgrep",
    "semgrep",
  ];

  for (const bin of candidates) {
    if (bin === "semgrep" || existsSync(bin)) return bin;
  }

  throw new Error("semgrep binary not found in PATH or common install locations");
}

/**
 * Spawn a command and collect stdout/stderr.
 *
 * stdout is truncated at {@link MAX_COMMAND_OUTPUT} bytes (killing the process
 * once exceeded). When `timeoutMs` is set, the process is killed and the promise
 * rejects if it runs longer than the timeout.
 */
export function runCommand(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;

    const timer = opts?.timeoutMs
      ? setTimeout(() => {
          proc.kill("SIGTERM");
          reject(new Error(`Command timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : undefined;

    proc.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutTruncated) return;
      stdout += chunk.toString();
      if (stdout.length > MAX_COMMAND_OUTPUT) {
        stdoutTruncated = true;
        stdout = stdout.slice(0, MAX_COMMAND_OUTPUT);
        proc.kill("SIGTERM");
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}
