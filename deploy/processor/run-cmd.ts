import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export type RunCmdFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string>; stdin?: string }
) => Promise<{ code: number; output: string }>;

/** Augmented PATH that includes Pulumi binary locations. */
function getAugmentedPath(): string {
  const pulumiHome = join(homedir(), ".pulumi", "bin");
  const pathSep = process.platform === "win32" ? ";" : ":";
  const extraPaths = process.platform === "win32"
    ? [pulumiHome, "C:\\Program Files\\Pulumi", "C:\\Program Files (x86)\\Pulumi"]
    : [pulumiHome, "/usr/local/bin"];
  return [...extraPaths, process.env.PATH || ""].join(pathSep);
}

const augmentedPath = getAugmentedPath();

/**
 * Run a command and collect its output. No log streaming — just returns code + output.
 * Used by destroy and other non-streaming contexts.
 */
export function runCmd(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string>; stdin?: string }
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: { ...process.env, PATH: augmentedPath, ...opts?.env },
      stdio: [opts?.stdin ? "pipe" : "ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    if (opts?.stdin) {
      proc.stdin!.write(opts.stdin);
      proc.stdin!.end();
    }
    let output = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, output }));
    proc.on("error", (err) => resolve({ code: 1, output: err.message }));
  });
}

/**
 * Run a command with live log streaming to the deployment log.
 * Filters noisy Docker/Pulumi progress lines.
 */
export function createStreamingRunCmd(
  deploymentId: string,
  logFn: (deploymentId: string, line: string) => Promise<void>,
  tsFn: () => string
): RunCmdFn {
  return (cmd, args, opts) => {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd: opts?.cwd || undefined,
        env: { ...process.env, PATH: augmentedPath, ...opts?.env },
        stdio: [opts?.stdin ? "pipe" : "ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });
      if (opts?.stdin) {
        proc.stdin!.write(opts.stdin);
        proc.stdin!.end();
      }
      let output = "";
      const onData = async (data: Buffer) => {
        const lines = data.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          output += line + "\n";
          // Filter noisy progress lines
          if (/^\s*\.+\s*$/.test(line) || /^@ updating/.test(line)) continue;
          if (/^[0-9a-f]{12}:\s*(Waiting|Preparing|Layer already exists|Pushing|Pulling fs layer)\s*$/.test(line)) continue;
          if (/^\s*Waiting\s*$/.test(line)) continue;
          await logFn(deploymentId, `[${tsFn()}] ${line}`);
        }
      };
      proc.stdout.on("data", onData);
      proc.stderr.on("data", onData);
      proc.on("close", (code) => resolve({ code: code ?? 1, output }));
      proc.on("error", (err) => resolve({ code: 1, output: err.message }));
    });
  };
}
