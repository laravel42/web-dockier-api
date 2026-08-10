import { spawn, execSync } from "node:child_process";

// ─── Types ─────────────────────────────────────────────────────────

export interface CliBuildResult {
  success: boolean;
  imageName: string;
  output: string;
}

export type RailpackBuildResult = CliBuildResult;
export type NixpacksBuildResult = CliBuildResult;

// ─── Shared Helpers ────────────────────────────────────────────────

/**
 * Run a command and capture its output. Resolves with the exit code
 * and combined stdout + stderr regardless of success or failure.
 */
function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, output }));
    proc.on("error", (err) => resolve({ code: 1, output: err.message }));
  });
}

/**
 * Check whether a CLI tool is available on the system PATH.
 */
function isCliAvailable(cmd: string): boolean {
  try {
    execSync(`${cmd} --version`, { timeout: 5_000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generic CLI image builder.
 *
 * Checks that the tool is installed, then runs it with the provided
 * build arguments. Returns a unified result with success flag, image
 * name, and captured output.
 */
async function buildWithCli(opts: {
  tool: string;
  installHint: string;
  buildArgs: string[];
  repoDir: string;
  imageName: string;
  env?: Record<string, string>;
}): Promise<CliBuildResult> {
  const { tool, installHint, buildArgs, repoDir, imageName, env } = opts;

  const check = await runCmd(tool, ["--version"], repoDir, env);
  if (check.code !== 0) {
    return { success: false, imageName, output: `${tool} CLI not found. Install it with: ${installHint}` };
  }

  const result = await runCmd(tool, buildArgs, repoDir, env);
  return { success: result.code === 0, imageName, output: result.output };
}

// ─── Public API ────────────────────────────────────────────────────

export async function buildWithRailpack(
  repoDir: string,
  imageName: string,
  opts?: { env?: Record<string, string> },
): Promise<CliBuildResult> {
  return buildWithCli({
    tool: "railpack",
    installHint: "cargo install railpack",
    buildArgs: ["build", "--name", imageName, "."],
    repoDir,
    imageName,
    env: opts?.env,
  });
}

export async function isRailpackAvailable(): Promise<boolean> {
  return isCliAvailable("railpack");
}

export async function buildWithNixpacks(
  repoDir: string,
  imageName: string,
  opts?: { env?: Record<string, string> },
): Promise<CliBuildResult> {
  return buildWithCli({
    tool: "nixpacks",
    installHint: "curl -sSL https://nixpacks.com/install.sh | bash",
    buildArgs: ["build", "--name", imageName, "."],
    repoDir,
    imageName,
    env: opts?.env,
  });
}

export async function isNixpacksAvailable(): Promise<boolean> {
  return isCliAvailable("nixpacks");
}
