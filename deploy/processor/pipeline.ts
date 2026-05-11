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

  // Execute user-defined post-deploy commands
  const commands = (event.postDeployCommands || []).filter(c => c.enabled);
  if (commands.length > 0 && deployStrategy !== "static") {
    // Managed deploys (ECS/Cloud Run) don't support post-deploy commands yet —
    // the container runs in the cloud, not locally. VPS deploys use SSH.
    if (deployStrategy === "managed") {
      await logger.section("Post-Deploy Commands");
      await logger.warn(`Post-deploy commands are not yet supported for managed deploys (${adapter.id})`);
      await logger.info("Commands configured: " + commands.map(c => c.command).join(", "));
      await logger.info("These will be supported via ECS RunTask / Cloud Run Jobs in a future update");
    } else if (deployStrategy === "vps") {
      await logger.section("Post-Deploy Commands");
      await logger.info(`Running ${commands.length} command(s)...`);

      const containerName = repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
      const serverIp = provision.serverIp || "";
      const deployKeyPath = adapterCtx.state.deployKeyPath || "";
      const instanceId = provision.outputs.InstanceId || "";

      // AWS EC2: use SSM SendCommand (no SSH key needed)
      if (instanceId && provider === "aws") {
        const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await import("@aws-sdk/client-ssm");
        const ssm = new SSMClient({
          region,
          credentials: { accessKeyId: adapterCtx.providerCredentials.apiKey, secretAccessKey: adapterCtx.providerCredentials.apiSecret },
        });

        // Build a shell script that waits for Docker + container, then runs commands
        const cmdChain = commands
          .map(cmd => `docker exec $(docker ps -q | head -1) sh -c '${cmd.command.replace(/'/g, "'\\''")}'`)
          .join(" && ");

        const script = [
          "#!/bin/bash",
          "for i in $(seq 1 60); do",
          "  if docker ps -q 2>/dev/null | grep -q .; then break; fi",
          "  sleep 2",
          "done",
          cmdChain,
        ].join("\n");

        await logger.info("Executing via AWS SSM SendCommand...");

        try {
          const sendResult = await ssm.send(new SendCommandCommand({
            InstanceIds: [instanceId],
            DocumentName: "AWS-RunShellScript",
            Parameters: { commands: [script] },
            TimeoutSeconds: 120,
          }));

          const commandId = sendResult.Command?.CommandId;
          if (commandId) {
            // Poll for completion
            let done = false;
            for (let i = 0; i < 30; i++) {
              await new Promise(r => setTimeout(r, 5000));
              try {
                const invocation = await ssm.send(new GetCommandInvocationCommand({
                  CommandId: commandId,
                  InstanceId: instanceId,
                }));
                const status = invocation.Status;
                if (status === "Success") {
                  await logger.success("All post-deploy commands executed successfully");
                  if (invocation.StandardOutputContent?.trim()) {
                    const lines = invocation.StandardOutputContent.trim().split("\n").slice(0, 20);
                    for (const line of lines) await logger.info(line);
                  }
                  done = true;
                  break;
                } else if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
                  await logger.warn(`SSM command ${status}`);
                  if (invocation.StandardErrorContent?.trim()) {
                    await logger.info(invocation.StandardErrorContent.trim().slice(0, 500));
                  }
                  done = true;
                  break;
                }
                // InProgress — keep polling
              } catch {
                // InvocationDoesNotExist — agent hasn't picked it up yet
              }
            }
            if (!done) {
              await logger.warn("SSM command still running after timeout — commands may complete in background");
            }
          }
        } catch (err: any) {
          await logger.warn(`SSM SendCommand failed: ${err.message || err}`);
          await logger.info("The instance may not have SSM agent ready yet — commands will run via cfn-init instead");
        }

      // GCP Compute / other VPS: use SSH
      } else if (serverIp && deployKeyPath) {
        const sshOpts = [
          "-i", deployKeyPath,
          "-o", "StrictHostKeyChecking=no",
          "-o", "UserKnownHostsFile=/dev/null",
          "-o", "ConnectTimeout=30",
          "-o", "LogLevel=ERROR",
        ];

        // Build the command chain. Find the running container dynamically by ID
        const cmdChain = commands
          .map(cmd => {
            const escaped = cmd.command.replace(/'/g, "'\\''");
            return `docker exec $(docker ps -q | head -1) sh -c '${escaped}'`;
          })
          .join(" && ");

        // Wait until docker daemon is running and a container is up, then execute
        const remoteCmd = [
          "for i in $(seq 1 60); do",
          "  if docker ps -q 2>/dev/null | grep -q .; then break; fi;",
          "  sleep 2;",
          "done",
          `&& ${cmdChain}`,
          "&& echo POST_DEPLOY_DONE",
        ].join(" ");

        await logger.info("Commands will execute once container is ready...");
        const result = await runCmd("ssh", [...sshOpts, `root@${serverIp}`, remoteCmd], { cwd: workDir });

        if (result.output.includes("POST_DEPLOY_DONE")) {
          await logger.success("All post-deploy commands executed successfully");
          const outputLines = result.output.split("\n").filter(l =>
            l.trim() && !l.includes("POST_DEPLOY_DONE") && !l.includes("Warning:")
          );
          for (const line of outputLines.slice(0, 20)) {
            await logger.info(line.trim());
          }
        } else {
          await logger.warn("Post-deploy commands may not have completed successfully");
          const output = result.output.trim().replace(/Warning:.*\n?/g, "").slice(0, 500);
          if (output) await logger.info(output);
        }
      } else {
        await logger.warn("Cannot execute post-deploy commands — no SSH key or SSM instance available");
      }
    }
  }

  // Update deployment record with success
  const finalUrl = provision.appUrl || "";
  await logger.section("Complete");
  await logger.success(isStaticDeploy ? "Static site deployed" : `Docker image: ${pushResult.remoteImageUri || actualImage}`);
  await logger.success(`Infrastructure provisioned via ${adapter.id}`);
  if (adapterCtx.state.machineTypeFallback) {
    await logger.warn(`Instance type was changed from ${adapterCtx.state.originalMachineType} to ${adapterCtx.state.machineTypeFallback} due to capacity constraints in ${region}. You can redeploy with a different region if you need the original instance type.`);
  }
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
