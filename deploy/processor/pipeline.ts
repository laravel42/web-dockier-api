/**
 * Pipeline step functions for the deploy processor.
 *
 * Each function handles one stage of the deployment pipeline with explicit
 * parameters and typed return values. The main handler in index.ts
 * orchestrates these in sequence.
 */

import { db } from "../shared";
import type { DeployEvent } from "../shared";
import { appendLog, ts, waitForAppReady } from "./helpers";
import type { RunCmdFn } from "./run-cmd";
import type { RepoConfig } from "../repo-analyzer/types";
import type { AdapterContext } from "./adapters/types";
import { getAdapter } from "./adapters";
import { buildCloneUrl } from "../../lib/git-url";
import { analyzeRepoConfig, generateDockerfile, configSummary, patchDockerfile, toDetectedStack } from "../repo-analyzer";

// ─── Types ─────────────────────────────────────────────────────────

export interface CloneResult {
  repoDir: string;
  workDir: string;
  commitHash: string;
}

export interface AnalyzeResult {
  repoConfig: RepoConfig;
}

export interface BuildResult {
  actualImage: string;
  skippedBuild: boolean;
}

// ─── Clone Repository ──────────────────────────────────────────────

export async function cloneRepository(opts: {
  deploymentId: string;
  shortId: string;
  event: DeployEvent;
}): Promise<CloneResult> {
  const { deploymentId, shortId, event } = opts;
  const { mkdtemp } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { execSync } = await import("node:child_process");
  const { git_integration } = await import("~encore/clients");

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Clone Repository ───────────────`);

  const conn = await git_integration.getConnectionForScan({ connectionId: event.gitConnectionId });
  const cloneUrl = buildCloneUrl({ provider: conn.provider, token: conn.token, repo: event.repo, endpoint: conn.endpoint });

  const workDir = await mkdtemp(join(tmpdir(), `deploy-${shortId}-`));
  const repoDir = join(workDir, "repo");
  execSync(`git clone --depth 1 --branch ${JSON.stringify(event.branch)} ${JSON.stringify(cloneUrl)} repo`, { cwd: workDir, timeout: 120_000, stdio: "pipe" });
  const commitHash = execSync("git rev-parse HEAD", { cwd: repoDir, timeout: 5_000 }).toString().trim();

  await appendLog(deploymentId, `[${ts()}] ✓ Repository cloned (commit: ${commitHash.slice(0, 8)})`);
  await db.exec`UPDATE deployments SET commit_hash = ${commitHash} WHERE id = ${deploymentId}`;

  return { repoDir, workDir, commitHash };
}

// ─── Analyze & Generate Dockerfile ─────────────────────────────────

export async function analyzeAndGenerateDockerfile(opts: {
  deploymentId: string;
  repoDir: string;
}): Promise<AnalyzeResult> {
  const { deploymentId, repoDir } = opts;
  const { existsSync } = await import("node:fs");
  const { readFile, writeFile, copyFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Analyze Repository ──────────────`);

  const repoConfig = analyzeRepoConfig(repoDir);
  for (const line of configSummary(repoConfig)) {
    await appendLog(deploymentId, `[${ts()}] ℹ ${line}`);
  }

  // Fix packageManager field for pnpm/yarn projects (corepack requires it)
  if (repoConfig.runtime === "node" && (repoConfig.packageManager === "pnpm" || repoConfig.packageManager === "yarn")) {
    const appDir = repoConfig.subDir ? join(repoDir, repoConfig.subDir) : repoDir;
    try {
      const pkgPath = join(appDir, "package.json");
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      if (!pkg.packageManager) {
        const pmVer = repoConfig.packageManagerVersion || (repoConfig.packageManager === "pnpm" ? "10.14.0" : "4.5.0");
        pkg.packageManager = `${repoConfig.packageManager}@${pmVer}`;
        await writeFile(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
        await appendLog(deploymentId, `[${ts()}] ℹ Added packageManager field: ${pkg.packageManager}`);
      }
    } catch {}

    // Copy lockfile to subdirectory if needed
    if (repoConfig.subDir) {
      const lockFiles: Record<string, string> = { pnpm: "pnpm-lock.yaml", yarn: "yarn.lock", bun: "bun.lockb" };
      const lockFile = lockFiles[repoConfig.packageManager];
      if (lockFile && existsSync(join(repoDir, lockFile)) && !existsSync(join(appDir, lockFile))) {
        try { await copyFile(join(repoDir, lockFile), join(appDir, lockFile)); } catch {}
      }
    }
  }

  // Generate Dockerfile and .dockerignore
  const df = generateDockerfile(repoConfig, repoDir);
  await writeFile(join(repoDir, "Dockerfile"), df, "utf-8");

  const dockerignore = [
    "node_modules", ".next", ".git", ".gitignore", "dist", "build", "out", "output",
    ".turbo", ".cache", ".pnpm-store", "/vendor", ".env", "*.log", "!.env.example",
    "coverage", ".nyc_output", "__pycache__", "*.pyc", ".venv", "venv",
    "*.md", "*.mdx", "LICENSE", ".vscode", ".idea", ".cursor",
    "Dockerfile*", ".dockerignore", "pulumi", ".pulumi-state",
  ].join("\n");
  await writeFile(join(repoDir, ".dockerignore"), dockerignore, "utf-8");

  const pm = repoConfig.packageManager !== "unknown" ? repoConfig.packageManager : "npm";
  await appendLog(deploymentId, `[${ts()}] ✓ Generated Dockerfile (${repoConfig.runtime}/${repoConfig.framework || "generic"}, pm: ${pm}, subDir: ${repoConfig.subDir || "/"})`);

  return { repoConfig };
}

// ─── Build Docker Image ────────────────────────────────────────────

export async function buildDockerImage(opts: {
  deploymentId: string;
  repoDir: string;
  imageName: string;
  commitHash: string;
  event: DeployEvent;
  runCmd: RunCmdFn;
}): Promise<BuildResult> {
  const { deploymentId, repoDir, imageName, commitHash, event, runCmd } = opts;
  const { execSync } = await import("node:child_process");
  const { readFile, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const isStaticDeploy = event.deployStrategy === "static";
  let actualImage = imageName;
  let skippedBuild = isStaticDeploy;

  // Check for cached image from previous deployment
  if (!isStaticDeploy) {
    const cachedImage = await db.queryRow<{ docker_image: string }>`
      SELECT docker_image FROM deployments
      WHERE repo = ${event.repo} AND branch = ${event.branch} AND commit_hash = ${commitHash}
        AND docker_image != '' AND id != ${deploymentId}
        AND status NOT IN ('destroyed', 'failed')
      ORDER BY created_at DESC LIMIT 1`;
    if (cachedImage?.docker_image) {
      try {
        execSync(`docker image inspect ${JSON.stringify(cachedImage.docker_image)}`, { timeout: 10_000, stdio: "pipe" });
        actualImage = cachedImage.docker_image;
        skippedBuild = true;
        await appendLog(deploymentId, `[${ts()}] ℹ Reusing cached image: ${actualImage}`);
      } catch {}
    }
  }

  // Build Docker image locally (unless static or cached)
  if (!skippedBuild) {
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ── Build Docker Image ─────────────`);
    const MAX_BUILD_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
      const buildArgs = ["build", "--platform", "linux/amd64", "-t", imageName];
      if (attempt > 1) buildArgs.push("--no-cache");
      buildArgs.push(".");
      const buildResult = await runCmd("docker", buildArgs, { cwd: repoDir });
      if (buildResult.code === 0) {
        await appendLog(deploymentId, `[${ts()}] ✓ Docker image built: ${imageName}`);
        break;
      }
      if (attempt < MAX_BUILD_ATTEMPTS) {
        const currentDf = await readFile(join(repoDir, "Dockerfile"), "utf-8");
        const fix = patchDockerfile(buildResult.output, currentDf);
        if (fix) {
          await appendLog(deploymentId, `[${ts()}] ⚠ Build failed — auto-fixing: ${fix.description}`);
          await writeFile(join(repoDir, "Dockerfile"), fix.patched, "utf-8");
          continue;
        }
      }
      throw new Error(`docker build failed (exit code ${buildResult.code})`);
    }
  }

  // Save Docker image reference
  if (!isStaticDeploy) {
    await db.exec`UPDATE deployments SET docker_image = ${actualImage} WHERE id = ${deploymentId}`;
  }

  return { actualImage, skippedBuild };
}

// ─── Dispatch to Adapter ───────────────────────────────────────────

export async function dispatchToAdapter(opts: {
  deploymentId: string;
  repoName: string;
  shortId: string;
  region: string;
  repoDir: string;
  workDir: string;
  commitHash: string;
  provider: string;
  providerRow: { api_key: string; api_secret: string };
  event: DeployEvent;
  repoConfig: RepoConfig;
  actualImage: string;
  runCmd: RunCmdFn;
}): Promise<void> {
  const {
    deploymentId, repoName, shortId, region, repoDir, workDir, commitHash,
    provider, providerRow, event, repoConfig, actualImage, runCmd,
  } = opts;
  const { readFile, writeFile, rm } = await import("node:fs/promises");

  const isStaticDeploy = event.deployStrategy === "static";
  const deployStrategy = event.deployStrategy || "managed";
  const adapter = getAdapter(provider, deployStrategy);
  await appendLog(deploymentId, `[${ts()}] ℹ Using adapter: ${adapter.id}`);

  const detectedStack = toDetectedStack(repoConfig);

  const adapterCtx: AdapterContext = {
    deploymentId,
    repoName,
    shortId,
    region,
    repoDir,
    workDir,
    commitHash,
    providerCredentials: { apiKey: providerRow.api_key, apiSecret: providerRow.api_secret },
    event,
    detectedStack,
    runCmd,
    appendLog: (line: string) => appendLog(deploymentId, line),
    writeFile: (p, d, e) => writeFile(p, d, e as BufferEncoding),
    readFile: (p, e) => readFile(p, e as BufferEncoding),
    rm,
  };

  // Inject environment variables
  await adapter.injectEnvVars(adapterCtx, event.envVars || []);

  // Push image to provider registry
  await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
  const pushResult = await adapter.pushImage(adapterCtx, actualImage);

  // Provision infrastructure
  const imageUri = pushResult.skipped ? "" : pushResult.remoteImageUri;
  const provision = await adapter.provisionInfrastructure(adapterCtx, imageUri || actualImage);

  // Run post-deploy steps
  await adapter.runPostDeploy(adapterCtx, provision);

  // Update deployment record with success
  const finalUrl = provision.appUrl || "";
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
  await appendLog(deploymentId, `[${ts()}] ✓ ${isStaticDeploy ? "Static site deployed" : `Docker image: ${pushResult.remoteImageUri || actualImage}`}`);
  await appendLog(deploymentId, `[${ts()}] ✓ Infrastructure provisioned via ${adapter.id}`);
  if (finalUrl) {
    // Run health check before marking as success — keeps status as "deploying"
    // so the frontend shows progress while the app boots
    await waitForAppReady(deploymentId, finalUrl);

    await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${finalUrl}`);
    await db.exec`UPDATE deployments SET status = 'success', app_url = ${finalUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
  } else {
    await appendLog(deploymentId, `[${ts()}] ⚠ Could not determine app URL — check cloud console`);
    await db.exec`UPDATE deployments SET status = 'success', updated_at = NOW() WHERE id = ${deploymentId}`;
  }
}
