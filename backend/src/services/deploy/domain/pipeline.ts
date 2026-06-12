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
import { patchDockerfile, toDetectedStack } from "../../../lib/repo-analyzer/index.js";
import { getAdapter } from "./adapters/index.js";
import type { AdapterContext } from "./adapters/types.js";
import { createStreamingRunCmd } from "./run-cmd.js";
import { pollUntil } from "./poll-until.js";
import { extractRegionFromScript } from "./gcp-helpers.js";
import { getTemplateConfig } from "./project-templates.js";
import { buildViaCodeBuild } from "./codebuild-builder.js";
import { executePostDeployCommands } from "./post-deploy.js";
import { sendNotification } from "../../notifications/domain/notifications.js";

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
  useRepoDockerfile?: boolean;
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
    const { repoConfig } = await analyzeAndGenerate({
      repoDir,
      logger,
      skipExistingDockerfile: event.useRepoDockerfile === true,
    });

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
    if (deployStrategy !== "static") {
      const containerName = provider === "aws"
        ? repoName
        : repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

      await executePostDeployCommands(
        {
          containerName,
          region,
          provider,
          techStack: event.techStack || [],
          services: event.services || [],
          envVars: event.envVars || [],
          credentials: { apiKey: adapterCtx.providerCredentials.apiKey, apiSecret: adapterCtx.providerCredentials.apiSecret },
          instanceId: provision.outputs.InstanceId || "",
          serverIp: provision.serverIp || "",
          deployKeyPath: adapterCtx.state.deployKeyPath || "",
          workDir,
        },
        event.postDeployCommands || [],
        logger,
        runCmd,
        deployStrategy,
      );
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

    const deployMessage = finalUrl
      ? `Deployment of ${event.repo} (${event.branch}) succeeded. App URL: ${finalUrl}`
      : `Deployment of ${event.repo} (${event.branch}) succeeded.`;
    void sendNotification({
      tenantId: event.tenantId,
      title: "Deployment succeeded",
      message: deployMessage,
    }).catch((err) => {
      console.error(`[deploy] Failed to send deploy complete notification for ${deploymentId}:`, err);
    });

    // Cleanup work directory
    try { await rm(workDir, { recursive: true, force: true }); } catch {}

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${message}`);
    await updateStatus(deploymentId, "failed");
  }
}
