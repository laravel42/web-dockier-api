export interface RailpackBuildResult {
  success: boolean;
  imageName: string;
  output: string;
}

export async function buildWithRailpack(
  repoDir: string,
  imageName: string,
  opts?: { env?: Record<string, string> }
): Promise<RailpackBuildResult> {
  const { spawn } = await import("node:child_process");
  const runCmd = (cmd: string, args: string[], cwd: string): Promise<{ code: number; output: string }> =>
    new Promise((resolve) => {
      const proc = spawn(cmd, args, { cwd, env: { ...process.env, ...opts?.env }, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
      proc.on("close", (code) => resolve({ code: code ?? 1, output }));
      proc.on("error", (err) => resolve({ code: 1, output: err.message }));
    });
  const check = await runCmd("railpack", ["--version"], repoDir);
  if (check.code !== 0) return { success: false, imageName, output: "Railpack CLI not found. Install it with: cargo install railpack" };
  const result = await runCmd("railpack", ["build", "--name", imageName, "."], repoDir);
  return { success: result.code === 0, imageName, output: result.output };
}

export async function isRailpackAvailable(): Promise<boolean> {
  const { execSync } = await import("node:child_process");
  try { execSync("railpack --version", { timeout: 5_000, stdio: "pipe" }); return true; } catch { return false; }
}

export interface NixpacksBuildResult {
  success: boolean;
  imageName: string;
  output: string;
}

export async function buildWithNixpacks(
  repoDir: string,
  imageName: string,
  opts?: { env?: Record<string, string> }
): Promise<NixpacksBuildResult> {
  const { spawn } = await import("node:child_process");
  const runCmd = (cmd: string, args: string[], cwd: string): Promise<{ code: number; output: string }> =>
    new Promise((resolve) => {
      const proc = spawn(cmd, args, { cwd, env: { ...process.env, ...opts?.env }, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
      proc.on("close", (code) => resolve({ code: code ?? 1, output }));
      proc.on("error", (err) => resolve({ code: 1, output: err.message }));
    });
  const check = await runCmd("nixpacks", ["--version"], repoDir);
  if (check.code !== 0) return { success: false, imageName, output: "Nixpacks CLI not found. Install it with: curl -sSL https://nixpacks.com/install.sh | bash" };
  const result = await runCmd("nixpacks", ["build", "--name", imageName, "."], repoDir);
  return { success: result.code === 0, imageName, output: result.output };
}

export async function isNixpacksAvailable(): Promise<boolean> {
  const { execSync } = await import("node:child_process");
  try { execSync("nixpacks --version", { timeout: 5_000, stdio: "pipe" }); return true; } catch { return false; }
}
