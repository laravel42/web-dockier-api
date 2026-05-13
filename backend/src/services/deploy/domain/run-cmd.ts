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
  const pathSep = ":";
  const extraPaths = [pulumiHome, "/usr/local/bin"];
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
    });
    if (opts?.stdin) {
      proc.stdin!.write(opts.stdin);
      proc.stdin!.end();
    }
    let output = "";
    proc.stdout!.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr!.on("data", (d: Buffer) => { output += d.toString(); });
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
          if (suppressedCount > 20) {
            await logFn(deploymentId, `[${tsFn()}] ... (${suppressedCount} verbose lines suppressed)`);
          }
          suppressedCount = 0;
          await logFn(deploymentId, `[${tsFn()}] ${line}`);
        }
      };
      proc.stdout!.on("data", onData);
      proc.stderr!.on("data", onData);
      proc.on("close", async (code) => {
        if (suppressedCount > 20) {
          await logFn(deploymentId, `[${tsFn()}] ... (${suppressedCount} verbose lines suppressed)`);
        }
        resolve({ code: code ?? 1, output });
      });
      proc.on("error", (err) => resolve({ code: 1, output: err.message }));
    });
  };
}

/**
 * Determine if a log line should be suppressed from user-visible deploy logs.
 */
function shouldSuppressLine(line: string): boolean {
  const stripped = line.replace(/^#\d+\s+[\d.]+\s+/, "");

  // Docker layer progress
  if (/^[0-9a-f]{12}:\s*(Waiting|Preparing|Layer already exists|Pushing|Pulling fs layer|Pushed)\s*$/i.test(stripped)) return true;
  if (/^sha256:[0-9a-f]+\s+[\d.]+[kMG]?B\s*\/\s*[\d.]+[kMG]?B/.test(stripped)) return true;
  if (/^extracting\s+sha256:/.test(stripped)) return true;
  if (/^\s*\.+\s*$/.test(line)) return true;
  if (/^@ updating/.test(line)) return true;
  if (/^\s*Waiting\s*$/.test(line)) return true;
  if (/^[0-9a-f]{12}: Pushed\s*$/.test(stripped)) return true;

  // C/C++ compilation noise
  if (/^\s*(cc|gcc|g\+\+|\/usr\/bin\/cc)\s+.*-[IDo]\s/.test(stripped)) return true;
  if (/^\/bin\/bash\s+.*libtool\s+--.*--mode=(compile|link|install)/.test(stripped)) return true;
  if (/^\s*(cc|gcc)\s+-shared\s/.test(stripped)) return true;
  if (/\.(lo|la|o|dep)\s*$/.test(stripped) && /\s-[co]\s/.test(stripped)) return true;
  if (/^(creating|cp\s+\.\/\.libs\/)/.test(stripped)) return true;
  if (/^\(cd \.libs && rm -f/.test(stripped)) return true;
  if (/^PATH=.*ldconfig\s/.test(stripped)) return true;
  if (/^\s*ldconfig\s/.test(stripped)) return true;
  if (/^\+?\s*strip\s+--strip-all/.test(stripped)) return true;

  // ./configure and autotools noise
  if (/^checking\s+(for|whether|if|how|the|build|host|target|command|dynamic)\s/.test(stripped)) return true;
  if (/^(yes|no|ok|none needed|none required|GNU\/Linux ld\.so)$/i.test(stripped.trim())) return true;
  if (/^\/usr\/(bin|lib|local|include)\/\S*$/.test(stripped.trim())) return true;
  if (/^(a\.out|o|\.libs|lib|cc -E|-I\/usr\/local\/include)$/.test(stripped.trim())) return true;
  if (/^configure:\s*(creating|patching)/.test(stripped)) return true;
  if (/^config\.status:/.test(stripped)) return true;
  if (/^appending configuration tag/.test(stripped)) return true;
  if (/^creating libtool$/.test(stripped.trim())) return true;

  // PHP extension build noise
  if (/^Configuring for:$/.test(stripped.trim())) return true;
  if (/^(PHP Api Version|Zend (Module Api No|Extension Api No)):/.test(stripped.trim())) return true;
  if (/^Build complete\.$/.test(stripped.trim())) return true;
  if (/^Don't forget to run 'make test'\.$/.test(stripped.trim())) return true;
  if (/^Installing (shared extensions|header files):/.test(stripped.trim())) return true;
  if (/^###\s*(INSTALLING|RESTORING|WARNING|MARKING)/.test(stripped)) return true;
  if (/^#\d+\s+[\d.]+\s+###\s+(INSTALLING|RESTORING|WARNING|MARKING)/.test(line)) return true;
  if (/was already set to manually installed/.test(stripped)) return true;
  if (/set to manually installed/.test(stripped)) return true;
  if (/^#\s+Packages to be (kept|used)/.test(stripped)) return true;
  if (/^-+$/.test(stripped.trim())) return true;
  if (/^Libraries have been installed in:/.test(stripped.trim())) return true;
  if (/^If you ever happen to want to link against/.test(stripped.trim())) return true;
  if (/^in a given directory, LIBDIR/.test(stripped.trim())) return true;
  if (/^specify the full pathname of the library/.test(stripped.trim())) return true;
  if (/^flag during linking and do at least one/.test(stripped.trim())) return true;
  if (/^- (add LIBDIR|use the|have your system)/.test(stripped.trim())) return true;
  if (/^during (execution|linking)$/.test(stripped.trim())) return true;
  if (/^See any operating system documentation/.test(stripped.trim())) return true;
  if (/^more information, such as the ld/.test(stripped.trim())) return true;
  if (/^\+$/.test(stripped.trim())) return true;
  if (/^#\d+\s+[\d.]+\s*$/.test(line)) return true;

  // apt-get / dpkg noise
  if (/^(Reading database|\(Reading database|Selecting previously|Preparing to unpack|Unpacking |Setting up )/.test(stripped)) return true;
  if (/^Get:\d+/.test(stripped)) return true;
  if (/debconf:/.test(line)) return true;
  if (/^Processing triggers for/.test(stripped)) return true;
  if (/^(Fetched|Reading package lists)/.test(stripped)) return true;
  if (/^(Updating channel|Channel .* is up to date)/.test(stripped)) return true;

  // make/mkdir/rm/find noise
  if (/^mkdir\s/.test(stripped)) return true;
  if (/^mkdir: cannot create directory.*File exists/.test(stripped)) return true;
  if (/^find\s+\.\s+-name/.test(stripped)) return true;
  if (/^rm\s+-f/.test(stripped)) return true;

  // Composer noise
  if (/^\s*-\s+(Downloading|Installing|Extracting)\s/.test(stripped)) return true;
  if (/^\s*\d+\/\d+\s+\[=*>?-*\]\s+\d+%/.test(stripped)) return true;

  // npm/yarn noise
  if (/^npm warn/.test(stripped)) return true;
  if (/^added \d+ packages/.test(stripped)) return true;

  return false;
}
