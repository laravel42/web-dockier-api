/**
 * Deploy pipeline orchestrator.
 *
 * Coordinates the full deployment lifecycle by delegating to focused stage modules:
 *   pipeline-helpers  → logging, status updates, env parsing
 *   pipeline-build    → Docker image construction (cache, local, CodeBuild)
 *   pipeline-health   → post-deploy health check polling
 *
 * Pipeline stages:
 *   1. Validate & fetch credentials
 *   2. Clone repository
 *   3. Load project env vars & deploy script
 *   4. Analyze repo & generate Dockerfile
 *   5. Build Docker image
 *   6. Push image & provision infrastructure (via adapter)
 *   7. Execute post-deploy script
 *   8. Apply network rules
 *   9. Health check & finalize
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger as obsLogger } from "../../../shared/logger.js";
import { cloneRepo, analyzeAndGenerate } from "../../../lib/build-pipeline.js";
import { createDeployLogger } from "../../../lib/logging.js";
import { toDetectedStack } from "../../../lib/repo-analyzer/index.js";
import { getAdapter } from "./adapters/index.js";
import type { AdapterContext } from "./adapters/types.js";
import { createStreamingRunCmd } from "./run-cmd.js";
import { extractRegionFromScript } from "./gcp-helpers.js";
import { getTemplateConfig } from "./project-templates.js";
import { executePostDeployScript } from "./post-deploy.js";
import { sendNotification } from "../../notifications/domain/notifications.js";
import { ADAPTER_TO_SERVICE, type InfraMetadata } from "../types.js";
import { revealEnv } from "../../projects/domain/env.js";

import { ts, appendLog, updateStatus, parseEnvContent } from "./pipeline-helpers.js";
import { buildImage } from "./pipeline-build.js";
import { waitForAppReady } from "./pipeline-health.js";
import { getDeploymentCurrentStatus, patchDeployment } from "./deployments.js";

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
  services?: Array<{ type: string; name: string; mode: string }>;
  useRepoDockerfile?: boolean;
}

// ─── Project Context Loader ────────────────────────────────────────

interface ProjectContext {
  envVars: Array<{ name: string; value: string }>;
  deployScript: string;
  knownPlatform: string;
}

async function loadProjectContext(
  event: PipelineInput,
  logger: ReturnType<typeof createDeployLogger>,
): Promise<ProjectContext> {
  let envVars: Array<{ name: string; value: string }> = [];
  let deployScript = "";
  let knownPlatform = "";

  if (!event.projectId || !event.tenantId) {
    await logger.info("No projectId/tenantId — skipping env/script fetch");
    return { envVars, deployScript, knownPlatform };
  }

  // Load env vars
  try {
    const envResult = await revealEnv({ tenantId: event.tenantId, projectId: event.projectId });
    if (envResult.exists && envResult.content) {
      envVars = parseEnvContent(envResult.content);
      await logger.info(`Loaded ${envVars.length} env vars from project settings`);
    } else {
      await logger.info("No environment file configured for this project");
    }
  } catch (envErr) {
    const msg = envErr instanceof Error ? envErr.message : String(envErr);
    await logger.warn(`Could not load project environment file: ${msg}`);
  }

  // Load deploy script and platform
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

  return { envVars, deployScript, knownPlatform };
}

// ─── Network Rules ─────────────────────────────────────────────────

async function applyNetworkRulesIfNeeded(
  event: PipelineInput,
  deployStrategy: string,
  logger: ReturnType<typeof createDeployLogger>,
): Promise<void> {
  if (!event.projectId || deployStrategy !== "vps") return;

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
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    await logger.warn(`Could not apply network rules: ${msg}`);
  }
}

// ─── Main Pipeline ─────────────────────────────────────────────────

/**
 * Execute the full deployment pipeline.
 * This runs asynchronously via the pg-boss job queue.
 */
export async function executePipeline(event: PipelineInput): Promise<void> {
  const { deploymentId } = event;

  // Idempotency guard
  const currentStatus = await getDeploymentCurrentStatus(deploymentId);
  if (currentStatus === "building" || currentStatus === "deploying") return;

  const repoName = (event.repo.split("/").pop() || "app").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const shortId = deploymentId.slice(0, 8);

  // 1. Fetch provider credentials
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

  // Template deploy path (early exit)
  if (event.templateId) {
    const templateConfig = getTemplateConfig(event.templateId);
    if (templateConfig) {
      await appendLog(deploymentId, `[${ts()}] ℹ Template deploy: ${templateConfig.name} (not yet wired in Fastify pipeline)`);
      await updateStatus(deploymentId, "failed");
      return;
    }
  }

  // Standard deploy path
  const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);

  try {
    await updateStatus(deploymentId, "building");
    await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);
    await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${provider} | Region: ${region}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${event.deployStrategy || "managed (default)"}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${event.repo} | Branch: ${event.branch}`);

    // 2. Clone repository
    const { data: connRow } = await db
      .from("git_connections")
      .select("provider, personal_token, endpoint")
      .eq("id", event.gitConnectionId)
      .maybeSingle();
    if (!connRow) throw new Error("Git connection not found");

    const logger = createDeployLogger(appendLog, deploymentId);
    const { repoDir, workDir, commitHash } = await cloneRepo({
      git: { provider: connRow.provider, token: connRow.personal_token, repo: event.repo, endpoint: connRow.endpoint || "" },
      branch: event.branch,
      shortId,
      logger,
    });

    await patchDeployment(deploymentId, { commit_hash: commitHash });

    // 3. Load project context (env vars, deploy script, platform)
    const projectCtx = await loadProjectContext(event, logger);

    // 4. Analyze and generate Dockerfile
    const { repoConfig } = await analyzeAndGenerate({
      repoDir,
      logger,
      skipExistingDockerfile: event.useRepoDockerfile === true,
      knownPlatform: projectCtx.knownPlatform,
    });

    // 5. Build Docker image
    const isStaticDeploy = event.deployStrategy === "static";
    let actualImage: string;
    let skippedBuild: boolean;

    if (isStaticDeploy) {
      actualImage = `${repoName}:${shortId}`;
      skippedBuild = true;
    } else {
      const buildResult = await buildImage({
        deploymentId,
        repoName,
        shortId,
        region,
        repoDir,
        workDir,
        commitHash,
        repoConfig,
        repo: event.repo,
        branch: event.branch,
        deployStrategy: event.deployStrategy,
        buildMethod: event.buildMethod,
        providerRow: { api_key: providerRow.api_key, api_secret: providerRow.api_secret },
        projectEnvVars: projectCtx.envVars,
        techStack: event.techStack,
        runCmd,
        logger,
      });
      actualImage = buildResult.actualImage;
      skippedBuild = buildResult.skippedBuild;
    }

    // 6. Push image & provision infrastructure (via adapter)
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
    await adapter.injectEnvVars(adapterCtx, projectCtx.envVars);

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

    // Run adapter post-deploy steps
    await adapter.runPostDeploy(adapterCtx, provision);

    // 7. Execute deploy script (user-defined post-deploy commands)
    const containerName = provider === "aws"
      ? repoName
      : repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

    if (deployStrategy !== "static" && projectCtx.deployScript.trim()) {
      await executePostDeployScript(
        {
          containerName,
          region,
          provider,
          techStack: event.techStack || [],
          services: event.services || [],
          envVars: projectCtx.envVars,
          credentials: { apiKey: adapterCtx.providerCredentials.apiKey, apiSecret: adapterCtx.providerCredentials.apiSecret },
          instanceId: provision.outputs.InstanceId || "",
          serverIp: provision.serverIp || "",
          deployKeyPath: adapterCtx.state.deployKeyPath || "",
          workDir,
        },
        projectCtx.deployScript,
        logger,
        runCmd,
        deployStrategy,
      );
    }

    // 8. Apply network rules
    await applyNetworkRulesIfNeeded(event, deployStrategy, logger);

    // 9. Finalize: health check, status update, notification
    const finalUrl = provision.appUrl || "";

    // Build infra metadata
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

    await logger.section("Complete");
    await logger.success(isStaticDeploy ? "Static site deployed" : `Docker image: ${pushResult.remoteImageUri || actualImage}`);
    await logger.success(`Infrastructure provisioned via ${adapter.id}`);

    if (adapterCtx.state.machineTypeFallback) {
      await logger.warn(`Instance type was changed from ${adapterCtx.state.originalMachineType} to ${adapterCtx.state.machineTypeFallback} due to capacity constraints in ${region}.`);
    }

    if (finalUrl) {
      await waitForAppReady(deploymentId, finalUrl);
      await logger.success(`Application URL: ${finalUrl}`);
      await updateStatus(deploymentId, "success", { app_url: finalUrl, infra });
    } else {
      await logger.warn("Could not determine app URL — check cloud console");
      await updateStatus(deploymentId, "success", { infra });
    }

    // Non-blocking notification
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
