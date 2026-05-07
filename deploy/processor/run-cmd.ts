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
 * Filters noisy Docker/Pulumi progress lines and verbose build output.
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
      let suppressedCount = 0;
      const onData = async (data: Buffer) => {
        const lines = data.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          output += line + "\n";
          if (shouldSuppressLine(line)) {
            suppressedCount++;
            continue;
          }
          // Flush a summary if we suppressed many lines before a meaningful one
          if (suppressedCount > 20) {
            await logFn(deploymentId, `[${tsFn()}] ... (${suppressedCount} verbose lines suppressed)`);
          }
          suppressedCount = 0;
          await logFn(deploymentId, `[${tsFn()}] ${line}`);
        }
      };
      proc.stdout.on("data", onData);
      proc.stderr.on("data", onData);
      proc.on("close", (code) => {
        if (suppressedCount > 20) {
          logFn(deploymentId, `[${tsFn()}] ... (${suppressedCount} verbose lines suppressed)`);
        }
        resolve({ code: code ?? 1, output });
      });
      proc.on("error", (err) => resolve({ code: 1, output: err.message }));
    });
  };
}

/**
 * Determine if a log line should be suppressed from user-visible deploy logs.
 * These lines are still captured in the full output for debugging.
 */
function shouldSuppressLine(line: string): boolean {
  // Docker layer progress (hash: Pushing/Pulling/Waiting/Preparing/Pushed)
  if (/^[0-9a-f]{12}:\s*(Waiting|Preparing|Layer already exists|Pushing|Pulling fs layer|Pushed)\s*$/i.test(line)) return true;
  // Docker layer download/upload byte progress
  if (/^#\d+\s+sha256:[0-9a-f]+\s+[\d.]+[kMG]?B\s*\/\s*[\d.]+[kMG]?B/.test(line)) return true;
  // Docker extracting layers
  if (/^#\d+\s+extracting\s+sha256:/.test(line)) return true;
  // Dots-only progress
  if (/^\s*\.+\s*$/.test(line)) return true;
  // Pulumi update progress
  if (/^@ updating/.test(line)) return true;
  if (/^\s*Waiting\s*$/.test(line)) return true;
  // C compiler invocations (gcc/cc with -I/-D/-o flags)
  if (/^\s*(cc|gcc|g\+\+|\/usr\/bin\/cc)\s+.*-[IDo]\s/.test(line)) return true;
  // Libtool compile commands
  if (/^\/bin\/bash\s+.*libtool\s+--.*--mode=compile/.test(line)) return true;
  // ./configure checks (checking for X... yes/no) — with or without Docker step prefix
  if (/^(#\d+\s+[\d.]+\s+)?checking\s+(for|whether|if|how|the|build|host|target)\s/.test(line)) return true;
  // configure result lines (just "yes", "no", "ok", path)
  if (/^(#\d+\s+[\d.]+\s+)?(yes|no|ok|none needed|\/usr\/)$/.test(line.trim())) return true;
  // apt-get verbose output (Reading database, Selecting, Preparing, Unpacking, Setting up)
  if (/^(#\d+\s+[\d.]+\s+)?(Reading database|\(Reading database|Selecting previously|Preparing to unpack|Unpacking |Setting up )/.test(line)) return true;
  // apt-get Get: download lines
  if (/^(#\d+\s+[\d.]+\s+)?Get:\d+/.test(line)) return true;
  // debconf noise
  if (/debconf:/.test(line)) return true;
  // make/mkdir inside build steps
  if (/^(#\d+\s+[\d.]+\s+)?mkdir\s/.test(line)) return true;
  // Linker/strip commands
  if (/^\+\s*strip\s+--strip-all/.test(line)) return true;
  // find cleanup commands
  if (/^(#\d+\s+[\d.]+\s+)?find\s+\.\s+-name/.test(line)) return true;
  // rm cleanup commands
  if (/^(#\d+\s+[\d.]+\s+)?rm\s+-f/.test(line)) return true;
  // Composer individual package download/extract lines
  if (/^\s*-\s+(Downloading|Installing|Extracting)\s/.test(line)) return true;
  if (/^#\d+\s+[\d.]+\s+-\s+(Downloading|Installing|Extracting)\s/.test(line)) return true;
  // Composer progress bars
  if (/^\s*\d+\/\d+\s+\[=*>?-*\]\s+\d+%/.test(line)) return true;
  if (/^#\d+\s+[\d.]+\s+\d+\/\d+\s+\[=*>?-*\]\s+\d+%/.test(line)) return true;
  // Docker layer "Pushed" lines (individual layers)
  if (/^[0-9a-f]{12}: Pushed\s*$/.test(line)) return true;
  // install-php-extensions internal apt/build noise
  if (/^#\d+\s+[\d.]+\s+###\s+(INSTALLING|RESTORING|WARNING)/.test(line)) return true;

  return false;
}
