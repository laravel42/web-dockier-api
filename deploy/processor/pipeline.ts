/**
 * Pipeline step functions for the deploy processor.
 *
 * Each function handles one stage of the deployment pipeline with explicit
 * parameters and typed return values. The main handler in index.ts
 * orchestrates these in sequence.
 */

import { db } from "../shared";
import type { DeployEvent } from "../shared";
import { appendLog, waitForAppReady } from "./helpers";
import type { RunCmdFn } from "./run-cmd";
import type { RepoConfig } from "../../lib/repo-analyzer/types";
import type { AdapterContext } from "./adapters/types";
import { getAdapter } from "./adapters";
import { patchDockerfile, toDetectedStack } from "../../lib/repo-analyzer";
import { cloneRepo, analyzeAndGenerate } from "../../lib/build-pipeline";
import { createDeployLogger, BuildError } from "../../lib/logging";

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
  const { git_integration } = await import("~encore/clients");

  const logger = createDeployLogger(appendLog, deploymentId);
  const conn = await git_integration.getConnectionForScan({ connectionId: event.gitConnectionId });

  const result = await cloneRepo({
    git: { provider: conn.provider, token: conn.token, repo: event.repo, endpoint: conn.endpoint },
    branch: event.branch,
    shortId,
    logger,
  });

  await db.exec`UPDATE deployments SET commit_hash = ${result.commitHash} WHERE id = ${deploymentId}`;

  return result;
}

// ─── Analyze & Generate Dockerfile ─────────────────────────────────

export async function analyzeAndGenerateDockerfile(opts: {
  deploymentId: string;
  repoDir: string;
}): Promise<AnalyzeResult> {
  const { deploymentId, repoDir } = opts;

  const logger = createDeployLogger(appendLog, deploymentId);
  const { repoConfig } = await analyzeAndGenerate({ repoDir, logger });

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

  const logger = createDeployLogger(appendLog, deploymentId);
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
        await logger.info(`Reusing cached image: ${actualImage}`);
      } catch {}
    }
  }

  // Build Docker image locally (unless static or cached)
  if (!skippedBuild) {
    await logger.section("Build Docker Image");
    const MAX_BUILD_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
      const buildArgs = ["build", "--platform", "linux/amd64", "-t", imageName];
      if (attempt > 1) buildArgs.push("--no-cache");
      buildArgs.push(".");
      const buildResult = await runCmd("docker", buildArgs, { cwd: repoDir });
      if (buildResult.code === 0) {
        await logger.success(`Docker image built: ${imageName}`);
        break;
      }
      if (attempt < MAX_BUILD_ATTEMPTS) {
        const currentDf = await readFile(join(repoDir, "Dockerfile"), "utf-8");
        const fix = patchDockerfile(buildResult.output, currentDf);
        if (fix) {
          await logger.warn(`Build failed — auto-fixing: ${fix.description}`);
          await writeFile(join(repoDir, "Dockerfile"), fix.patched, "utf-8");
          continue;
        }
      }
      throw new BuildError(`docker build failed (exit code ${buildResult.code})`, "docker-build");
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

  const logger = createDeployLogger(appendLog, deploymentId);
  const isStaticDeploy = event.deployStrategy === "static";
  const deployStrategy = event.deployStrategy || "managed";
  const adapter = getAdapter(provider, deployStrategy);
  await logger.info(`Using adapter: ${adapter.id}`);

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
    state: { actualImage },
  };

  // Inject environment variables
  await adapter.injectEnvVars(adapterCtx, event.envVars || []);

  // Push image to provider registry (skip if already remote, e.g., built by CodeBuild)
  await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
  let pushResult: { remoteImageUri: string; skipped: boolean };

  const isAlreadyRemote = actualImage.includes(".dkr.ecr.") || actualImage.includes("gcr.io") || actualImage.includes("docker.pkg.dev");
  if (isAlreadyRemote) {
    // Image was built and pushed remotely (e.g., CodeBuild) — skip local push
    await logger.info(`Image already in registry: ${actualImage}`);
    pushResult = { remoteImageUri: actualImage, skipped: true };

    // Populate adapter state that provisionInfrastructure needs
    if (actualImage.includes(".dkr.ecr.")) {
      const { getAwsAccountId } = await import("../../lib/aws");
      const credentials = { accessKeyId: providerRow.api_key, secretAccessKey: providerRow.api_secret };
      const accountId = await getAwsAccountId(region, credentials);
      adapterCtx.state.awsAccountId = accountId;
      adapterCtx.state.awsCredentials = credentials;
    }
  } else {
    pushResult = await adapter.pushImage(adapterCtx, actualImage);
  }

  // Provision infrastructure
  const imageUri = pushResult.skipped ? "" : pushResult.remoteImageUri;
  const provision = await adapter.provisionInfrastructure(adapterCtx, imageUri || actualImage);

  // Run post-deploy steps
  await adapter.runPostDeploy(adapterCtx, provision);

  // Update deployment record with success
  const finalUrl = provision.appUrl || "";
  await logger.section("Complete");
  await logger.success(isStaticDeploy ? "Static site deployed" : `Docker image: ${pushResult.remoteImageUri || actualImage}`);
  await logger.success(`Infrastructure provisioned via ${adapter.id}`);
  if (finalUrl) {
    // Run health check before marking as success — keeps status as "deploying"
    // so the frontend shows progress while the app boots
    await waitForAppReady(deploymentId, finalUrl);

    await logger.success(`Application URL: ${finalUrl}`);
    await db.exec`UPDATE deployments SET status = 'success', app_url = ${finalUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
  } else {
    await logger.warn("Could not determine app URL — check cloud console");
    await db.exec`UPDATE deployments SET status = 'success', updated_at = NOW() WHERE id = ${deploymentId}`;
  }
}
