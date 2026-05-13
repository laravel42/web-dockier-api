import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunCmdFn } from "./run-cmd.js";

export interface PulumiWorkspaceResult {
  pulumiDir: string;
  providerEnv: Record<string, string>;
}

/**
 * Set up a Pulumi workspace directory with all required files and provider credentials.
 * Used by deploy, template-deploy, and destroy flows.
 */
export async function setupPulumiWorkspace(opts: {
  workDir: string;
  appName: string;
  provider: string;
  region: string;
  providerRow: { api_key: string; api_secret: string };
  indexTs: string;
  generatePulumiProject: (appName: string, provider: string) => string;
  generatePackageJson: (appName: string, provider: string) => string;
  generateTsConfig: () => string;
}): Promise<PulumiWorkspaceResult> {
  const { workDir, appName, provider, providerRow, indexTs } = opts;

  const pulumiDir = join(workDir, "pulumi");
  await mkdir(pulumiDir, { recursive: true });

  await writeFile(join(pulumiDir, "index.ts"), indexTs, "utf-8");
  await writeFile(join(pulumiDir, "Pulumi.yaml"), opts.generatePulumiProject(appName, provider), "utf-8");
  await writeFile(join(pulumiDir, "package.json"), opts.generatePackageJson(appName, provider), "utf-8");
  await writeFile(join(pulumiDir, "tsconfig.json"), opts.generateTsConfig(), "utf-8");

  // Provider env vars
  const providerEnv: Record<string, string> = {};
  if (provider === "aws") {
    providerEnv.AWS_ACCESS_KEY_ID = providerRow.api_key || "";
    providerEnv.AWS_SECRET_ACCESS_KEY = providerRow.api_secret || "";
    providerEnv.AWS_DEFAULT_REGION = opts.region;
  } else if (provider === "gcp") {
    const credPath = join(pulumiDir, "gcp-credentials.json");
    await writeFile(credPath, providerRow.api_key || "{}", "utf-8");
    providerEnv.GOOGLE_CREDENTIALS = providerRow.api_key || "";
    providerEnv.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  }

  const stateDir = join(pulumiDir, ".pulumi-state");
  await mkdir(stateDir, { recursive: true });
  const stateUrl = `file://${stateDir}`;
  providerEnv.PULUMI_BACKEND_URL = stateUrl;
  providerEnv.PULUMI_CONFIG_PASSPHRASE = "";

  return { pulumiDir, providerEnv };
}

/**
 * Install npm deps and init a Pulumi stack.
 */
export async function initPulumiStack(opts: {
  pulumiDir: string;
  providerEnv: Record<string, string>;
  stackName: string;
  runCmd: RunCmdFn;
}): Promise<{ installCode: number; installOutput: string; initCode: number; initOutput: string }> {
  const { pulumiDir, providerEnv, stackName, runCmd } = opts;

  const installResult = await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });
  const initResult = await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

  return {
    installCode: installResult.code,
    installOutput: installResult.output,
    initCode: initResult.code,
    initOutput: initResult.output,
  };
}

/**
 * Restore Pulumi state from a previous deployment's tofu_script.
 * Rewrites stack URNs to match the current stack name.
 */
export async function restorePulumiState(opts: {
  prevTofuScript: string;
  stackName: string;
  pulumiDir: string;
  providerEnv: Record<string, string>;
  runCmd: RunCmdFn;
  force?: boolean;
}): Promise<{ restored: boolean }> {
  const { prevTofuScript, stackName, pulumiDir, providerEnv, runCmd } = opts;
  const stateMarker = prevTofuScript.indexOf("/* STATE */\n");
  if (stateMarker === -1) return { restored: false };

  const savedState = prevTofuScript.slice(stateMarker + "/* STATE */\n".length);
  if (!savedState.includes('"deployment"')) return { restored: false };

  try {
    const oldStackMatch = savedState.match(/"urn:pulumi:([^:]+)::/);
    const updatedState = oldStackMatch
      ? savedState.replaceAll(`urn:pulumi:${oldStackMatch[1]}::`, `urn:pulumi:${stackName}::`)
      : savedState;

    const stateFile = join(pulumiDir, "prev-state.json");
    await writeFile(stateFile, updatedState, "utf-8");

    const args = ["stack", "import", "--non-interactive", ...(opts.force ? ["--force"] : []), "--file", stateFile];
    const importResult = await runCmd("pulumi", args, { cwd: pulumiDir, env: providerEnv });
    return { restored: importResult.code === 0 };
  } catch {
    return { restored: false };
  }
}

/**
 * Export Pulumi state and save it appended to the tofu_script in the DB.
 */
export async function savePulumiState(opts: {
  deploymentId: string;
  tofuScript: string;
  pulumiDir: string;
  providerEnv: Record<string, string>;
  runCmd: RunCmdFn;
  updateTofuScript: (deploymentId: string, script: string) => Promise<void>;
}): Promise<void> {
  const { deploymentId, tofuScript, pulumiDir, providerEnv } = opts;
  try {
    const { spawn } = await import("node:child_process");
    const { homedir: getHome } = await import("node:os");
    const pulumiHome = join(getHome(), ".pulumi", "bin");
    const extraPaths = [pulumiHome, "/usr/local/bin"];
    const augPath = [...extraPaths, process.env.PATH || ""].join(":");

    const stateJson = await new Promise<string>((resolve) => {
      const proc = spawn("pulumi", ["stack", "export", "--non-interactive"], {
        cwd: pulumiDir,
        env: { ...process.env, PATH: augPath, ...providerEnv },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      proc.stdout.on("data", (d: Buffer) => chunks.push(d));
      proc.stderr.on("data", () => {});
      proc.on("close", (code) => {
        if (code === 0) resolve(Buffer.concat(chunks).toString("utf-8").trim());
        else resolve("");
      });
      proc.on("error", () => resolve(""));
    });
    if (stateJson) {
      const scriptWithState = `${tofuScript}\n/* STATE */\n${stateJson}`;
      await opts.updateTofuScript(deploymentId, scriptWithState.replace(/\0/g, ""));
    }
  } catch {}
}
