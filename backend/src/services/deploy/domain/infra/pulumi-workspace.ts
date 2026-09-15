import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCmd, type RunCmdFn } from "../run-cmd.js";
import { getGcpProjectId } from "./gcp-client.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import type { DestroyContext } from "../adapters/types.js";

/** The marker separating the Pulumi program from its serialized state in tofu_script. */
const STATE_MARKER = "/* STATE */\n";

export interface PulumiWorkspaceResult {
  pulumiDir: string;
  providerEnv: Record<string, string>;
}

// ─── Default Generators ────────────────────────────────────────────

function generateDefaultPulumiProject(appName: string, provider: string): string {
  const runtime = "nodejs";
  return `name: ${appName}\nruntime: ${runtime}\ndescription: Infrastructure for ${appName} (${provider})\n`;
}

function generateDefaultPackageJson(appName: string, provider: string): string {
  const deps: Record<string, string> = { "@pulumi/pulumi": "^3" };
  if (provider === "aws") deps["@pulumi/aws"] = "^6";
  if (provider === "gcp") deps["@pulumi/gcp"] = "^7";
  return JSON.stringify({ name: appName, main: "index.ts", dependencies: deps }, null, 2);
}

function generateDefaultTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      strict: true,
      outDir: "bin",
      target: "es2020",
      module: "commonjs",
      moduleResolution: "node",
      sourceMap: true,
      experimentalDecorators: true,
      forceConsistentCasingInFileNames: true,
    },
    files: ["index.ts"],
  }, null, 2);
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
}): Promise<PulumiWorkspaceResult> {
  const { workDir, appName, provider, providerRow, indexTs } = opts;

  const pulumiDir = join(workDir, "pulumi");
  await mkdir(pulumiDir, { recursive: true });

  await writeFile(join(pulumiDir, "index.ts"), indexTs, "utf-8");
  await writeFile(join(pulumiDir, "Pulumi.yaml"), generateDefaultPulumiProject(appName, provider), "utf-8");
  await writeFile(join(pulumiDir, "package.json"), generateDefaultPackageJson(appName, provider), "utf-8");
  await writeFile(join(pulumiDir, "tsconfig.json"), generateDefaultTsConfig(), "utf-8");

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
 * Shared provisioning preamble for the GCP adapters:
 * set up the workspace, install npm deps, init the stack, and set the
 * `resourceSuffix` config used to avoid cross-stack name collisions.
 *
 * Streams the same progress lines the adapters used to emit inline. Throws on
 * npm-install failure (after logging the tail of npm's output); a non-fatal
 * stack-init failure is logged as a warning (init routinely "fails" when the
 * stack already exists). Returns the workspace handles + the derived stack name.
 */
export async function setupAndInitPulumiStack(opts: {
  workDir: string;
  repoName: string;
  shortId: string;
  region: string;
  providerCredentials: { apiKey: string; apiSecret: string };
  indexTs: string;
  runCmd: RunCmdFn;
  appendLog: (line: string) => Promise<void>;
}): Promise<{ pulumiDir: string; providerEnv: Record<string, string>; stackName: string }> {
  const { workDir, repoName, shortId, region, providerCredentials, indexTs, runCmd, appendLog } = opts;

  await appendLog("── Pulumi Setup ───────────────────");

  const { pulumiDir, providerEnv } = await setupPulumiWorkspace({
    workDir,
    appName: repoName,
    provider: "gcp",
    region,
    providerRow: { api_key: providerCredentials.apiKey, api_secret: providerCredentials.apiSecret },
    indexTs,
  });

  // Install npm dependencies
  await appendLog("ℹ Installing Pulumi dependencies...");
  const installResult = await runCmd("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: pulumiDir,
    env: providerEnv,
  });
  if (installResult.code !== 0) {
    const errLines = installResult.output.split("\n").filter((l) => l.trim()).slice(-10);
    for (const line of errLines) {
      await appendLog(`✗ npm: ${line}`);
    }
    throw new Error(`npm install failed (exit code ${installResult.code})`);
  }
  await appendLog("✓ Dependencies installed");

  // Init Pulumi stack
  const stackName = `${repoName}-${shortId}`;
  const initResult = await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], {
    cwd: pulumiDir,
    env: providerEnv,
  });
  if (initResult.code !== 0) {
    await appendLog(
      `⚠ Stack init: ${initResult.output.split("\n").filter((l) => l.trim()).slice(-3).join(" | ")}`,
    );
  }

  // Set unique suffix for GCP resource names to avoid 409 collisions across stacks
  await runCmd("pulumi", ["config", "set", "resourceSuffix", shortId, "--non-interactive"], {
    cwd: pulumiDir,
    env: providerEnv,
  });

  return { pulumiDir, providerEnv, stackName };
}

/**
 * Read a single Pulumi stack output value.
 *
 * Runs `pulumi stack output <name>` and returns the last non-empty line
 * (trimmed) — Pulumi prints the value on the final line. Returns "" when the
 * output is unset or the command produced nothing.
 */
export async function readPulumiOutput(opts: {
  pulumiDir: string;
  providerEnv: Record<string, string>;
  name: string;
  runCmd: RunCmdFn;
}): Promise<string> {
  const { pulumiDir, providerEnv, name, runCmd } = opts;
  const result = await runCmd("pulumi", ["stack", "output", name, "--non-interactive"], {
    cwd: pulumiDir,
    env: providerEnv,
  });
  return result.output.trim().split("\n").pop()?.trim() || "";
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

/**
 * Restore a previous deployment's Pulumi state into a throwaway workspace and
 * run `pulumi destroy` against it (GCP).
 *
 * This is the "we have saved state" teardown path shared by every GCP adapter's
 * `destroy()`. The caller has already located the STATE marker (via
 * `tofuScript.indexOf(...)`), so it passes the resulting `stateMarker` index
 * (guaranteed `!== -1`). Any API-based, no-state fallback teardown stays in the
 * adapter — this helper only handles the Pulumi-state case.
 *
 * Returns a list of error strings (empty on success); it never throws. The
 * caller merges these into its own error accumulator.
 */
export async function destroyPulumiStack(ctx: DestroyContext, stateMarker: number): Promise<string[]> {
  const errors: string[] = [];
  const savedState = ctx.tofuScript.slice(stateMarker + STATE_MARKER.length);
  const pulumiScript = ctx.tofuScript.slice(0, stateMarker).trim();

  const { mkdtemp, writeFile: writeFs, rm } = await import("node:fs/promises");
  const { join: joinPath } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const workDir = await mkdtemp(joinPath(tmpdir(), `destroy-${ctx.deploymentId.slice(0, 8)}-`));
  try {
    const { pulumiDir, providerEnv } = await setupPulumiWorkspace({
      workDir,
      appName: ctx.repoName,
      provider: "gcp",
      region: ctx.region,
      providerRow: { api_key: ctx.providerCredentials.apiKey, api_secret: ctx.providerCredentials.apiSecret },
      indexTs: pulumiScript,
    });

    await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });
    const stackName = `destroy-${ctx.deploymentId.slice(0, 8)}`;
    await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

    const gcpProjectId = getGcpProjectId(ctx.providerCredentials.apiKey);
    if (gcpProjectId) {
      await runCmd("pulumi", ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    }

    const stateFile = joinPath(pulumiDir, "state.json");
    await writeFs(stateFile, savedState, "utf-8");
    const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--force", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
    if (importResult.code !== 0) {
      errors.push(`State import failed: ${importResult.output.split("\n").slice(-3).join(" ")}`);
    } else {
      const destroyResult = await runCmd("pulumi", ["destroy", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
      if (destroyResult.code !== 0) {
        errors.push(`Pulumi destroy failed: ${destroyResult.output.split("\n").filter((l) => l.includes("error")).slice(-3).join(" ")}`);
      }
    }
  } catch (e: unknown) {
    errors.push(getErrMsg(e) || "Unknown error during Pulumi destroy");
  } finally {
    try { await rm(workDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }

  return errors;
}
