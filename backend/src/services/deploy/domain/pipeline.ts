/**
 * Deploy pipeline executor.
 *
 * Replaces the Encore pub/sub subscription. When a deployment is created,
 * this module is called to execute the full pipeline asynchronously:
 * clone → analyze → build → push → provision → post-deploy.
 *
 * The pipeline runs in the background (fire-and-forget from the HTTP handler)
 * and updates the deployment record in the DB as it progresses.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { cloneRepo, analyzeAndGenerate } from "../../../lib/build-pipeline.js";
import { createDeployLogger, BuildError } from "../../../lib/logging.js";
import { getAwsAccountId } from "../../../lib/aws.js";
import { patchDockerfile, toDetectedStack } from "../../../lib/repo-analyzer/index.js";
import type { RepoConfig } from "../../../lib/repo-analyzer/types.js";
import { getAdapter } from "./adapters/index.js";
import type { AdapterContext } from "./adapters/types.js";
import { createStreamingRunCmd } from "./run-cmd.js";
import { pollUntil } from "./poll-until.js";
import { extractRegionFromScript } from "./gcp-helpers.js";
import { getTemplateConfig } from "./project-templates.js";
import { buildViaCodeBuild } from "./codebuild-builder.js";

const db = supabaseAdmin;

// ─── Types ─────────────────────────────────────────────────────────

export interface PipelineInput {
  deploymentId: string;
  tenantId: string;
  providerId: string;
  gitConnectionId: string;
  projectId?: string;
  repo: string;
  branch: string;
  tofuScript: string;
  techStack?: string[];
  primaryLanguage?: string;
  hasDocker?: boolean;
  deployStrategy: string;
  templateId?: string;
  buildMethod?: string;
  registryUrl?: string;
  envVars?: Array<{ name: string; value: string }>;
  postDeployCommands?: Array<{ command: string; enabled: boolean; continueOnFailure?: boolean }>;
  services?: Array<{ type: string; name: string; mode: string }>;
}

// ─── Helpers ───────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function appendLog(deploymentId: string, line: string): Promise<void> {
  const sanitized = line.replace(/\0/g, "");
  const { data: current } = await db.from("deployments").select("logs").eq("id", deploymentId).maybeSingle();
  const updatedLogs = (current?.logs || "") + sanitized + "\n";
  await db.from("deployments").update({ logs: updatedLogs }).eq("id", deploymentId);
}

async function updateStatus(deploymentId: string, status: string, extra?: Record<string, unknown>): Promise<void> {
  await db.from("deployments").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", deploymentId);
}

// ─── Health Check ──────────────────────────────────────────────────

async function waitForAppReady(deploymentId: string, appUrl: string): Promise<boolean> {
  if (!appUrl) return false;

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Health Check ──────────────────`);
  await appendLog(deploymentId, `[${ts()}] ℹ Waiting for application to become reachable...`);

  const result = await pollUntil({
    check: async (attempt) => {
      try {
        const response = await fetch(appUrl, {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
          redirect: "follow",
          headers: { "User-Agent": "Dockier-HealthCheck/1.0" },
        });

        if (response.ok) {
          const body = await response.text();
          const isNginxDefault = body.includes("Welcome to nginx") && body.includes("nginx.org");
          if (isNginxDefault) {
            await appendLog(deploymentId, `[${ts()}] ℹ Health check #${attempt}: nginx default page (app still starting...)`);
            return null;
          }
          await appendLog(deploymentId, `[${ts()}] ✓ Health check passed — application is live`);
          return true;
        }
        await appendLog(deploymentId, `[${ts()}] ℹ Health check #${attempt}: HTTP ${response.status} (retrying...)`);
      } catch {
        await appendLog(deploymentId, `[${ts()}] ℹ Health check #${attempt}: not reachable yet (retrying...)`);
      }
      return null;
    },
    intervalMs: 15_000,
    timeoutMs: 150_000,
    onTimeout: async () => {
      await appendLog(deploymentId, `[${ts()}] ⚠ Health check timed out after 150s — the app may still need a moment`);
    },
  });

  return result.success;
}

// ─── Main Pipeline ─────────────────────────────────────────────────

/**
 * Execute the full deployment pipeline.
 * This runs asynchronously — the caller should fire-and-forget.
 */
export async function executePipeline(event: PipelineInput): Promise<void> {
  const { deploymentId } = event;

  // Idempotency guard
  const { data: current } = await db.from("deployments").select("status").eq("id", deploymentId).maybeSingle();
  if (current?.status === "building" || current?.status === "deploying") return;

  const repoName = (event.repo.split("/").pop() || "app").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const shortId = deploymentId.slice(0, 8);

  // Fetch provider credentials
  const { data: providerRow } = await db
    .from("server_providers")
    .select("provider, region, api_key, api_secret")
    .eq("id", event.providerId)
    .maybeSingle();
  if (!providerRow) {
    await appendLog(deploymentId, `[${ts()}] ✗ Provider not found: ${event.providerId}`);
    await updateStatus(deploymentId, "failed");
    return;
  }

  const provider = providerRow.provider || "cloud";
  let region = providerRow.region || "us-east-1";

  if (event.tofuScript) {
    const scriptRegion = extractRegionFromScript(event.tofuScript);
    if (scriptRegion) region = scriptRegion;
  }

  // ── Template deploy path ──
  if (event.templateId) {
    const templateConfig = getTemplateConfig(event.templateId);
    if (templateConfig) {
      // Template deploys are handled separately (skip clone/analyze, use Docker image directly)
      // TODO: wire handleTemplateDeploy when needed
      await appendLog(deploymentId, `[${ts()}] ℹ Template deploy: ${templateConfig.name} (not yet wired in Fastify pipeline)`);
      await updateStatus(deploymentId, "failed");
      return;
    }
  }

  // ── Standard deploy path ──
  const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);

  try {
    await updateStatus(deploymentId, "building");
    await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);
    await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${provider} | Region: ${region}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${event.deployStrategy || "managed (default)"}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${event.repo} | Branch: ${event.branch}`);

    // 1. Fetch git connection for clone
    const { data: connRow } = await db
      .from("git_connections")
      .select("provider, personal_token, endpoint")
      .eq("id", event.gitConnectionId)
      .maybeSingle();
    if (!connRow) throw new Error("Git connection not found");

    // 2. Clone repository
    const logger = createDeployLogger(appendLog, deploymentId);
    const { repoDir, workDir, commitHash } = await cloneRepo({
      git: { provider: connRow.provider, token: connRow.personal_token, repo: event.repo, endpoint: connRow.endpoint || "" },
      branch: event.branch,
      shortId,
      logger,
    });

    await db.from("deployments").update({ commit_hash: commitHash }).eq("id", deploymentId);

    // 3. Analyze and generate Dockerfile
    const { repoConfig, detectedPort } = await analyzeAndGenerate({ repoDir, logger });

    // 4. Build Docker image (local or remote via CodeBuild)
    const isStaticDeploy = event.deployStrategy === "static";
    const imageName = `${repoName}:${shortId}`;
    let actualImage = imageName;
    let skippedBuild = isStaticDeploy;

    if (!isStaticDeploy) {
      // Check for cached image
      const { data: cachedRow } = await db
        .from("deployments")
        .select("docker_image")
        .eq("repo", event.repo)
        .eq("branch", event.branch)
        .eq("commit_hash", commitHash)
        .neq("docker_image", "")
        .neq("id", deploymentId)
        .not("status", "in", '("destroyed","failed")')
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cachedRow?.docker_image) {
        try {
          const { execSync } = await import("node:child_process");
          execSync(`docker image inspect ${JSON.stringify(cachedRow.docker_image)}`, { timeout: 10_000, stdio: "pipe" });
          actualImage = cachedRow.docker_image;
          skippedBuild = true;
          await logger.info(`Reusing cached image: ${actualImage}`);
        } catch { /* not cached locally */ }
      }

      if (!skippedBuild && event.buildMethod === "codebuild") {
        // Remote build via AWS CodeBuild
        const result = await buildViaCodeBuild({
          deploymentId,
          repoName,
          shortId,
          region,
          providerRow: { api_key: providerRow.api_key, api_secret: providerRow.api_secret },
          repoDir,
          workDir,
          commitHash,
          repoConfig,
          deployStrategy: event.deployStrategy,
          repo: event.repo,
          branch: event.branch,
          envVars: event.envVars,
          techStack: event.techStack,
          appendLog,
        });
        actualImage = result.remoteImageUri;
        skippedBuild = true; // Don't try local build after CodeBuild
      } else if (!skippedBuild) {
        await logger.section("Build Docker Image");
        const { readFile, writeFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
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

      await db.from("deployments").update({ docker_image: actualImage }).eq("id", deploymentId);
    }

    // 5. Dispatch to adapter (push + provision + post-deploy)
    const deployStrategy = event.deployStrategy || "managed";
    const adapter = getAdapter(provider, deployStrategy);
    await logger.info(`Using adapter: ${adapter.id}`);

    const detectedStack = toDetectedStack(repoConfig);
    const { readFile, writeFile, rm } = await import("node:fs/promises");

    const adapterCtx: AdapterContext = {
      deploymentId,
      repoName,
      shortId,
      region,
      repoDir,
      workDir,
      commitHash,
      providerCredentials: { apiKey: providerRow.api_key, apiSecret: providerRow.api_secret },
      event: {
        deploymentId,
        tenantId: event.tenantId,
        providerId: event.providerId,
        gitConnectionId: event.gitConnectionId,
        projectId: event.projectId,
        repo: event.repo,
        branch: event.branch,
        tofuScript: event.tofuScript,
        techStack: event.techStack,
        primaryLanguage: event.primaryLanguage,
        hasDocker: event.hasDocker,
        deployStrategy,
        templateId: event.templateId,
        buildMethod: event.buildMethod,
        registryUrl: event.registryUrl,
        envVars: event.envVars,
        postDeployCommands: event.postDeployCommands,
        services: event.services,
      },
      detectedStack,
      runCmd,
      appendLog: (line: string) => appendLog(deploymentId, `[${ts()}] ${line}`),
      writeFile: (p, d, e) => writeFile(p, d, e as BufferEncoding),
      readFile: (p, e) => readFile(p, e as BufferEncoding),
      rm,
      state: { actualImage },
    };

    // Inject environment variables
    await adapter.injectEnvVars(adapterCtx, event.envVars || []);

    // Push image to provider registry
    await updateStatus(deploymentId, "deploying");
    let pushResult: { remoteImageUri: string; skipped: boolean };

    const isAlreadyRemote = actualImage.includes(".dkr.ecr.") || actualImage.includes("gcr.io") || actualImage.includes("docker.pkg.dev");
    if (isAlreadyRemote || isStaticDeploy) {
      pushResult = { remoteImageUri: actualImage, skipped: true };
      if (isAlreadyRemote) await logger.info(`Image already in registry: ${actualImage}`);
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
      if (deployStrategy === "managed") {
        await logger.section("Post-Deploy Commands");
        await logger.warn(`Post-deploy commands are not yet supported for managed deploys (${adapter.id})`);
        await logger.info("Commands configured: " + commands.map(c => c.command).join(", "));
        await logger.info("These will be supported via ECS RunTask / Cloud Run Jobs in a future update");
      } else if (deployStrategy === "vps") {
        await logger.section("Post-Deploy Commands");
        await logger.info(`Running ${commands.length} command(s)...`);

        const containerName = provider === "aws"
          ? repoName
          : repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
        const serverIp = provision.serverIp || "";
        const deployKeyPath = adapterCtx.state.deployKeyPath || "";
        const instanceId = provision.outputs.InstanceId || "";

        // AWS EC2: use SSM SendCommand
        if (instanceId && provider === "aws") {
          const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await import("@aws-sdk/client-ssm");
          const ssm = new SSMClient({
            region,
            credentials: { accessKeyId: adapterCtx.providerCredentials.apiKey, secretAccessKey: adapterCtx.providerCredentials.apiSecret },
          });

          const cmdChain = commands
            .map(cmd => {
              const escaped = cmd.command.replace(/'/g, "'\\''");
              const exec = `docker exec ${containerName} sh -c '${escaped}'`;
              return cmd.continueOnFailure ? `(${exec} || true)` : exec;
            })
            .join(" && ");

          const isLaravel = (event.techStack || []).some(s => s.toLowerCase() === "laravel");
          const selfHostedServices = (event.services || []).filter(s => s.mode === "vps").map(s => s.type);
          const envOverrides: string[] = [];
          if (selfHostedServices.includes("database")) {
            envOverrides.push(`docker exec ${containerName} sh -c 'grep -q "^DB_HOST=" /var/www/html/.env && sed -i "s/^DB_HOST=.*/DB_HOST=host.docker.internal/" /var/www/html/.env || echo "DB_HOST=host.docker.internal" >> /var/www/html/.env'`);
          }
          if (selfHostedServices.includes("cache") || selfHostedServices.includes("broadcasting")) {
            envOverrides.push(`docker exec ${containerName} sh -c 'grep -q "^REDIS_HOST=" /var/www/html/.env && sed -i "s/^REDIS_HOST=.*/REDIS_HOST=host.docker.internal/" /var/www/html/.env || echo "REDIS_HOST=host.docker.internal" >> /var/www/html/.env'`);
          }
          const envFixCmd = envOverrides.length > 0 ? envOverrides.join(" && ") + " && " : "";

          // Build a fresh .env file from the current env vars and write it to the host.
          // This ensures the container gets the latest env vars even on redeploy
          // (cfn-hup may not have re-run yet after CloudFormation update).
          // Instead of embedding env vars in the script (which breaks with special chars),
          // we upload them to S3 and download on the instance.
          const currentEnvVars = event.envVars || [];
          let envS3DownloadCmd = "";
          if (isLaravel && currentEnvVars.length > 0) {
            // Build .env content (KEY=value format, quote only when needed)
            const envContent = currentEnvVars
              .map(v => {
                const val = v.value;
                const needsQuotes = /[\s#"'\\]/.test(val) || val === "";
                return needsQuotes
                  ? `${v.name}="${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
                  : `${v.name}=${val}`;
              })
              .join("\n");

            // Upload to S3
            const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
            const accountId = await getAwsAccountId(region, { accessKeyId: adapterCtx.providerCredentials.apiKey, secretAccessKey: adapterCtx.providerCredentials.apiSecret });
            const envBucket = `image-builder-templates-${accountId}`;
            const envKey = `env-files/${containerName}-postdeploy.env`;
            const s3 = new S3Client({ region, credentials: { accessKeyId: adapterCtx.providerCredentials.apiKey, secretAccessKey: adapterCtx.providerCredentials.apiSecret } });
            await s3.send(new PutObjectCommand({ Bucket: envBucket, Key: envKey, Body: envContent, ContentType: "text/plain" }));

            envS3DownloadCmd = `aws s3 cp s3://${envBucket}/${envKey} /tmp/${containerName}.env --region ${region}`;
          }

          // On redeploy, the host .env file (/tmp/${containerName}.env) was written by cfn-init
          // with defaults + user env vars. Just copy it into the container and apply overrides.
          const envSetup = isLaravel
            ? `docker cp /tmp/${containerName}.env ${containerName}:/var/www/html/.env 2>/dev/null || docker exec ${containerName} sh -c 'touch .env' && ${envFixCmd}`
            : "";

          const script = [
            "#!/bin/bash",
            "CONTAINER_READY=0",
            "for i in $(seq 1 90); do",
            `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi`,
            "  sleep 2",
            "done",
            `if [ "$CONTAINER_READY" != "1" ]; then echo "ERROR: Container '${containerName}' not running after 180s"; exit 1; fi`,
            `${envSetup}${cmdChain}`,
          ].join("\n");

          await logger.info("Executing via AWS SSM SendCommand...");

          try {
            const sendResult = await ssm.send(new SendCommandCommand({
              InstanceIds: [instanceId],
              DocumentName: "AWS-RunShellScript",
              Parameters: { commands: [script] },
              TimeoutSeconds: 300,
            }));

            const commandId = sendResult.Command?.CommandId;
            if (commandId) {
              let done = false;
              for (let i = 0; i < 65; i++) {
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
                    if (invocation.StandardOutputContent?.trim()) {
                      const lines = invocation.StandardOutputContent.trim().split("\n").slice(-20);
                      for (const line of lines) await logger.info(line);
                    }
                    done = true;
                    break;
                  }
                } catch {
                  // InvocationDoesNotExist — agent hasn't picked it up yet
                }
              }
              if (!done) {
                await logger.warn("SSM command still running after timeout — commands may complete in background");
              }
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await logger.warn(`SSM SendCommand failed: ${errMsg}`);
            await logger.info("The instance may not have SSM agent ready yet — commands will run via cfn-init instead");
          }

        // GCP / other VPS: use SSH
        } else if (serverIp && deployKeyPath) {
          const sshOpts = [
            "-i", deployKeyPath,
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=30",
            "-o", "LogLevel=ERROR",
          ];

          const cmdChain = commands
            .map(cmd => {
              const escaped = cmd.command.replace(/'/g, "'\\''");
              const exec = `docker exec ${containerName} sh -c '${escaped}'`;
              return cmd.continueOnFailure ? `(${exec} || true)` : exec;
            })
            .join(" && ");

          const isLaravelSsh = (event.techStack || []).some(s => s.toLowerCase() === "laravel");
          const selfHostedSvcsSsh = (event.services || []).filter(s => s.mode === "vps").map(s => s.type);
          const envOverridesSsh: string[] = [];
          if (selfHostedSvcsSsh.includes("database")) {
            envOverridesSsh.push(`docker exec ${containerName} sh -c 'grep -q "^DB_HOST=" /var/www/html/.env && sed -i "s/^DB_HOST=.*/DB_HOST=host.docker.internal/" /var/www/html/.env || echo "DB_HOST=host.docker.internal" >> /var/www/html/.env'`);
          }
          if (selfHostedSvcsSsh.includes("cache") || selfHostedSvcsSsh.includes("broadcasting")) {
            envOverridesSsh.push(`docker exec ${containerName} sh -c 'grep -q "^REDIS_HOST=" /var/www/html/.env && sed -i "s/^REDIS_HOST=.*/REDIS_HOST=host.docker.internal/" /var/www/html/.env || echo "REDIS_HOST=host.docker.internal" >> /var/www/html/.env'`);
          }
          const envFixCmdSsh = envOverridesSsh.length > 0 ? envOverridesSsh.join(" && ") + " && " : "";
          const envSetupSsh = isLaravelSsh
            ? `docker cp /tmp/${containerName}.env ${containerName}:/var/www/html/.env 2>/dev/null || docker exec ${containerName} sh -c 'touch .env' && ${envFixCmdSsh}`
            : "";

          const remoteCmd = [
            "CONTAINER_READY=0;",
            "for i in $(seq 1 60); do",
            `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi;`,
            "  sleep 2;",
            "done;",
            `[ "$CONTAINER_READY" = "1" ]`,
            `&& ${envSetupSsh}${cmdChain}`,
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

    // Health check and finalize
    const finalUrl = provision.appUrl || "";
    await logger.section("Complete");
    await logger.success(isStaticDeploy ? "Static site deployed" : `Docker image: ${pushResult.remoteImageUri || actualImage}`);
    await logger.success(`Infrastructure provisioned via ${adapter.id}`);

    if (adapterCtx.state.machineTypeFallback) {
      await logger.warn(`Instance type was changed from ${adapterCtx.state.originalMachineType} to ${adapterCtx.state.machineTypeFallback} due to capacity constraints in ${region}.`);
    }

    if (finalUrl) {
      await waitForAppReady(deploymentId, finalUrl);
      await logger.success(`Application URL: ${finalUrl}`);
      await updateStatus(deploymentId, "success", { app_url: finalUrl });
    } else {
      await logger.warn("Could not determine app URL — check cloud console");
      await updateStatus(deploymentId, "success");
    }

    // Cleanup work directory
    try { await rm(workDir, { recursive: true, force: true }); } catch {}

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${message}`);
    await updateStatus(deploymentId, "failed");
  }
}
