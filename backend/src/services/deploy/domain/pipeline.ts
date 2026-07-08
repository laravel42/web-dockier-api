/**
 * Deploy pipeline executor.
 *
 * When a deployment is created, this module is called to execute the full
 * pipeline asynchronously:
 * clone → analyze → build → push → provision → post-deploy.
 *
 * The pipeline runs in the background (fire-and-forget from the HTTP handler)
 * and updates the deployment record in the DB as it progresses.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger as obsLogger } from "../../../shared/logger.js";
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
import { executePostDeployScript } from "./post-deploy.js";
import { sendNotification } from "../../notifications/domain/notifications.js";
import { ADAPTER_TO_SERVICE, type InfraMetadata } from "../types.js";
import { revealEnv } from "../../projects/domain/env.js";

const db = supabaseAdmin;

// ─── Env Parser ────────────────────────────────────────────────────

/** Parse .env file content into key-value pairs */
function parseEnvContent(content: string): Array<{ name: string; value: string }> {
  const vars: Array<{ name: string; value: string }> = [];
  let currentKey = "";
  let currentValue = "";
  let inMultiLine = false;
  let quoteChar = "";

  for (const line of content.split("\n")) {
    if (inMultiLine) {
      // Continue accumulating multi-line value
      if (line.endsWith(quoteChar)) {
        currentValue += "\n" + line.slice(0, -1);
        vars.push({ name: currentKey, value: currentValue });
        inMultiLine = false;
      } else {
        currentValue += "\n" + line;
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const name = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1);

    // Handle quoted values (may be multi-line)
    const stripped = value.trimStart();
    if ((stripped.startsWith('"') || stripped.startsWith("'")) && !stripped.endsWith(stripped[0])) {
      // Multi-line value: opening quote without matching close
      quoteChar = stripped[0];
      currentKey = name;
      currentValue = stripped.slice(1);
      inMultiLine = true;
      continue;
    }

    // Single-line: strip surrounding quotes
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Remove inline comments (unquoted)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf(" #");
      if (commentIdx > -1) value = value.slice(0, commentIdx).trimEnd();
    }

    if (name) vars.push({ name, value });
  }

  // If we were still in a multi-line value, push what we have
  if (inMultiLine && currentKey) {
    vars.push({ name: currentKey, value: currentValue });
  }

  return vars;
}

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

    // 2b. Fetch project env vars and deploy script
    let projectEnvVars: Array<{ name: string; value: string }> = [];
    let deployScript = "";
    let knownPlatform = "";
    if (event.projectId && event.tenantId) {
      try {
        const envResult = await revealEnv({ tenantId: event.tenantId, projectId: event.projectId });
        if (envResult.exists && envResult.content) {
          projectEnvVars = parseEnvContent(envResult.content);
          await logger.info(`Loaded ${projectEnvVars.length} env vars from project settings`);
        } else {
          await logger.info("No environment file configured for this project");
        }
      } catch (envErr) {
        const msg = envErr instanceof Error ? envErr.message : String(envErr);
        await logger.warn(`Could not load project environment file: ${msg}`);
      }
      try {
        const { data: projectRow } = await db
          .from("projects")
          .select("settings,platform")
          .eq("id", event.projectId)
          .maybeSingle();
        if (projectRow?.settings && typeof projectRow.settings === "object" && !Array.isArray(projectRow.settings)) {
          deployScript = (projectRow.settings as Record<string, unknown>).deployScript as string ?? "";
        }
        if (projectRow?.platform) {
          knownPlatform = projectRow.platform as string;
        }
        if (deployScript) {
          await logger.info("Deploy script loaded from project settings");
        }
      } catch (settingsErr) {
        obsLogger.warn({ err: settingsErr, projectId: event.projectId }, "[deploy] Failed to load project settings");
      }
    } else {
      await logger.info("No projectId/tenantId — skipping env/script fetch");
    }

    // 3. Analyze and generate Dockerfile
    const { repoConfig } = await analyzeAndGenerate({
      repoDir,
      logger,
      skipExistingDockerfile: event.useRepoDockerfile === true,
      knownPlatform,
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
          envVars: projectEnvVars,
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
    await adapter.injectEnvVars(adapterCtx, projectEnvVars);

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

    // Container name derivation (used by post-deploy commands and infra metadata)
    const containerName = provider === "aws"
      ? repoName
      : repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

    // Execute deploy script (post-deploy commands)
    if (deployStrategy !== "static" && deployScript.trim()) {
      await executePostDeployScript(
        {
          containerName,
          region,
          provider,
          techStack: event.techStack || [],
          services: event.services || [],
          envVars: projectEnvVars,
          credentials: { apiKey: adapterCtx.providerCredentials.apiKey, apiSecret: adapterCtx.providerCredentials.apiSecret },
          instanceId: provision.outputs.InstanceId || "",
          serverIp: provision.serverIp || "",
          deployKeyPath: adapterCtx.state.deployKeyPath || "",
          workDir,
        },
        deployScript,
        logger,
        runCmd,
        deployStrategy,
      );
    }

    // Apply network rules (security + redirects) if the project has any configured
    if (event.projectId && deployStrategy === "vps") {
      try {
        const { applyNetworkRules } = await import("../../network/domain/applier.js");
        const networkResult = await applyNetworkRules({
          tenantId: event.tenantId,
          projectId: event.projectId,
        });
        if (networkResult.success) {
          if (networkResult.generatedConfig) {
            await logger.info("Network rules applied to nginx configuration");
          }
        } else {
          await logger.warn(`Could not apply network rules: ${networkResult.message}`);
        }
      } catch (networkErr) {
        // Non-fatal: log and continue
        const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
        await logger.warn(`Could not apply network rules: ${msg}`);
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

    // Build infrastructure metadata for downstream use (commands, scaling, etc.)
    const service = ADAPTER_TO_SERVICE[adapter.id] || adapter.id;
    const infra: InfraMetadata = {
      provider: provider as InfraMetadata["provider"],
      service: service as InfraMetadata["service"],
      region,
      containerName,
      stackName: `image-builder-app-${repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
    };
    if (provision.outputs?.InstanceId) infra.instanceId = provision.outputs.InstanceId;
    if (provision.serverIp) infra.serverIp = provision.serverIp;
    if (provision.outputs?.PublicIp) infra.serverIp = provision.outputs.PublicIp;
    if (deployStrategy === "managed" && provider === "aws") {
      infra.ecsCluster = repoName;
      infra.ecsTaskFamily = repoName;
    }
    if (deployStrategy === "managed" && provider === "gcp") {
      infra.cloudRunService = containerName;
    }

    if (finalUrl) {
      await waitForAppReady(deploymentId, finalUrl);
      await logger.success(`Application URL: ${finalUrl}`);
      await updateStatus(deploymentId, "success", { app_url: finalUrl, infra });
    } else {
      await logger.warn("Could not determine app URL — check cloud console");
      await updateStatus(deploymentId, "success", { infra });
    }

    const deployMessage = finalUrl
      ? `Deployment of ${event.repo} (${event.branch}) succeeded. App URL: ${finalUrl}`
      : `Deployment of ${event.repo} (${event.branch}) succeeded.`;
    void sendNotification({
      tenantId: event.tenantId,
      title: "Deployment succeeded",
      message: deployMessage,
      metadata: {
        kind: "deploy",
        repo: event.repo,
        branch: event.branch,
        commit: commitHash || undefined,
        appUrl: finalUrl || undefined,
        deployId: deploymentId,
      },
    }).catch((err) => {
      obsLogger.error({ err }, `[deploy] Failed to send deploy complete notification for ${deploymentId}`);
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
