/**
 * Deploy pipeline orchestrator.
 *
 * Coordinates the full deployment lifecycle by delegating to focused stage functions.
 * Each stage receives a shared PipelineContext object and contributes its results.
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
 *  10. Restore background processes & scheduled jobs
 *
 * Existing stage modules remain unchanged:
 *   pipeline-helpers  → logging, status updates, env parsing
 *   pipeline-build    → Docker image construction (cache, local, CodeBuild)
 *   pipeline-health   → post-deploy health check polling
 */

import { readFile, writeFile, rm } from "node:fs/promises";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger as obsLogger } from "../../../shared/logger.js";
import { cloneRepo, analyzeAndGenerate } from "../../../lib/build-pipeline.js";
import { createDeployLogger, type ContextualLogger } from "../../../lib/logging.js";
import { toDetectedStack } from "../../../lib/repo-analyzer/index.js";
import type { RepoConfig } from "../../../lib/repo-analyzer/types.js";
import { getAdapter } from "./adapters/index.js";
import type { AdapterContext, ProvisionResult, DeployAdapter } from "./adapters/types.js";
import { createStreamingRunCmd, type RunCmdFn } from "./run-cmd.js";
import { extractRegionFromScript } from "./gcp-helpers.js";
import { getTemplateConfig } from "./project-templates.js";
import { executePostDeployScript } from "./post-deploy.js";
import { injectWpConfig } from "./wp-config-inject.js";
import { sendNotification } from "../../notifications/domain/notifications.js";
import { ADAPTER_TO_SERVICE, type InfraMetadata } from "../types.js";
import { revealEnv } from "../../projects/domain/env.js";

import { ts, appendLog, updateStatus, parseEnvContent } from "./pipeline-helpers.js";
import { buildImage } from "./pipeline-build.js";
import { waitForAppReady } from "./pipeline-health.js";
import { getDeploymentCurrentStatus, patchDeployment } from "./deployments.js";
import { restoreProcessesAfterDeploy } from "../../processes/domain/post-deploy-restore.js";

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

interface ProjectContext {
  envVars: Array<{ name: string; value: string }>;
  deployScript: string;
  knownPlatform: string;
}

// ─── Stage 1: Fetch Provider Credentials ───────────────────────────

interface ProviderResult {
  provider: string;
  region: string;
  credentials: { api_key: string; api_secret: string };
}

async function fetchProviderCredentials(
  event: PipelineInput,
): Promise<ProviderResult | null> {
  const { data: providerRow, error } = await db
    .from("server_providers")
    .select("provider, region, api_key, api_secret")
    .eq("id", event.providerId)
    .maybeSingle();

  if (error) {
    obsLogger.error({ err: error, providerId: event.providerId }, "[deploy] Failed to fetch provider credentials");
    return null;
  }
  if (!providerRow) return null;

  let region = providerRow.region || "us-east-1";
  if (event.tofuScript) {
    const scriptRegion = extractRegionFromScript(event.tofuScript);
    if (scriptRegion) region = scriptRegion;
  }

  return {
    provider: providerRow.provider || "cloud",
    region,
    credentials: {
      api_key: providerRow.api_key || "",
      api_secret: providerRow.api_secret || "",
    },
  };
}

// ─── Stage 2: Clone Repository ─────────────────────────────────────

async function cloneRepository(
  event: PipelineInput,
  shortId: string,
  logger: ContextualLogger,
): Promise<{ repoDir: string; workDir: string; commitHash: string }> {
  const { data: connRow, error } = await db
    .from("git_connections")
    .select("provider, personal_token, endpoint")
    .eq("id", event.gitConnectionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error fetching git connection: ${error.message}`);
  }
  if (!connRow) throw new Error("Git connection not found");

  return await cloneRepo({
    git: {
      provider: connRow.provider || "",
      token: connRow.personal_token || "",
      repo: event.repo,
      endpoint: connRow.endpoint || "",
    },
    branch: event.branch,
    shortId,
    logger,
  });
}

// ─── Stage 3: Load Project Context ────────────────────────────────

async function loadProjectContext(
  event: PipelineInput,
  logger: ContextualLogger,
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

// ─── Stage 5: Build Docker Image ──────────────────────────────────

interface BuildResult {
  actualImage: string;
  skippedBuild: boolean;
}

async function buildDockerImage(ctx: {
  event: PipelineInput;
  deploymentId: string;
  repoName: string;
  shortId: string;
  region: string;
  repoDir: string;
  workDir: string;
  commitHash: string;
  repoConfig: RepoConfig;
  providerCredentials: { api_key: string; api_secret: string };
  projectCtx: ProjectContext;
  runCmd: RunCmdFn;
  logger: ContextualLogger;
}): Promise<BuildResult> {
  const isStaticDeploy = ctx.event.deployStrategy === "static";

  if (isStaticDeploy) {
    return {
      actualImage: `${ctx.repoName}:${ctx.shortId}`,
      skippedBuild: true,
    };
  }

  const result = await buildImage({
    deploymentId: ctx.deploymentId,
    repoName: ctx.repoName,
    shortId: ctx.shortId,
    region: ctx.region,
    repoDir: ctx.repoDir,
    workDir: ctx.workDir,
    commitHash: ctx.commitHash,
    repoConfig: ctx.repoConfig,
    repo: ctx.event.repo,
    branch: ctx.event.branch,
    deployStrategy: ctx.event.deployStrategy,
    buildMethod: ctx.event.buildMethod,
    providerRow: ctx.providerCredentials,
    projectEnvVars: ctx.projectCtx.envVars,
    techStack: ctx.event.techStack,
    runCmd: ctx.runCmd,
    logger: ctx.logger,
  });

  return { actualImage: result.actualImage, skippedBuild: result.skippedBuild };
}

// ─── Stage 6: Push & Provision ─────────────────────────────────────

function buildAdapterContext(ctx: {
  deploymentId: string;
  repoName: string;
  shortId: string;
  region: string;
  repoDir: string;
  workDir: string;
  commitHash: string;
  providerCredentials: { api_key: string; api_secret: string };
  event: PipelineInput;
  deployStrategy: string;
  repoConfig: RepoConfig;
  actualImage: string;
  runCmd: RunCmdFn;
}): AdapterContext {
  const detectedStack = toDetectedStack(ctx.repoConfig);

  return {
    deploymentId: ctx.deploymentId,
    repoName: ctx.repoName,
    shortId: ctx.shortId,
    region: ctx.region,
    repoDir: ctx.repoDir,
    workDir: ctx.workDir,
    commitHash: ctx.commitHash,
    providerCredentials: { apiKey: ctx.providerCredentials.api_key, apiSecret: ctx.providerCredentials.api_secret },
    event: {
      deploymentId: ctx.event.deploymentId,
      tenantId: ctx.event.tenantId,
      providerId: ctx.event.providerId,
      gitConnectionId: ctx.event.gitConnectionId,
      projectId: ctx.event.projectId,
      repo: ctx.event.repo,
      branch: ctx.event.branch,
      tofuScript: ctx.event.tofuScript,
      techStack: ctx.event.techStack,
      primaryLanguage: ctx.event.primaryLanguage,
      hasDocker: ctx.event.hasDocker,
      deployStrategy: ctx.deployStrategy,
      templateId: ctx.event.templateId,
      buildMethod: ctx.event.buildMethod,
      registryUrl: ctx.event.registryUrl,
      services: ctx.event.services,
    },
    detectedStack,
    runCmd: ctx.runCmd,
    appendLog: (line: string) => appendLog(ctx.deploymentId, `[${ts()}] ${line}`),
    writeFile: (p, d, e) => writeFile(p, d, e as BufferEncoding),
    readFile: (p, e) => readFile(p, e as BufferEncoding),
    rm,
    state: { actualImage: ctx.actualImage },
  };
}

async function pushAndProvision(
  adapter: DeployAdapter,
  adapterCtx: AdapterContext,
  actualImage: string,
  isStaticDeploy: boolean,
  projectCtx: ProjectContext,
  logger: ContextualLogger,
): Promise<ProvisionResult> {
  // Inject environment variables
  await adapter.injectEnvVars(adapterCtx, projectCtx.envVars);

  // Push image to provider registry
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

  return provision;
}

// ─── Stage 7: Post-Deploy Script ───────────────────────────────────

async function runPostDeployScriptIfNeeded(ctx: {
  event: PipelineInput;
  deployStrategy: string;
  provider: string;
  repoName: string;
  region: string;
  adapterCtx: AdapterContext;
  provision: ProvisionResult;
  projectCtx: ProjectContext;
  logger: ContextualLogger;
  runCmd: RunCmdFn;
  workDir: string;
}): Promise<void> {
  if (ctx.deployStrategy === "static") return;
  if (!ctx.projectCtx.deployScript.trim()) return;

  const containerName = ctx.provider === "aws"
    ? ctx.repoName
    : ctx.repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  await executePostDeployScript(
    {
      containerName,
      region: ctx.region,
      provider: ctx.provider,
      techStack: ctx.event.techStack || [],
      services: ctx.event.services || [],
      envVars: ctx.projectCtx.envVars,
      credentials: {
        apiKey: ctx.adapterCtx.providerCredentials.apiKey,
        apiSecret: ctx.adapterCtx.providerCredentials.apiSecret,
      },
      instanceId: ctx.provision.outputs.InstanceId || "",
      serverIp: ctx.provision.serverIp || "",
      deployKeyPath: ctx.adapterCtx.state.deployKeyPath || "",
      workDir: ctx.workDir,
    },
    ctx.projectCtx.deployScript,
    ctx.logger,
    ctx.runCmd,
    ctx.deployStrategy,
  );
}

// ─── Stage 8: Network Rules ───────────────────────────────────────

async function applyNetworkRulesIfNeeded(
  event: PipelineInput,
  deployStrategy: string,
  logger: ContextualLogger,
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

// ─── Stage 9: Finalize ─────────────────────────────────────────────

function buildInfraMetadata(ctx: {
  provider: string;
  region: string;
  repoName: string;
  deployStrategy: string;
  adapter: DeployAdapter;
  provision: ProvisionResult;
}): InfraMetadata {
  const containerName = ctx.provider === "aws"
    ? ctx.repoName
    : ctx.repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  const service = ADAPTER_TO_SERVICE[ctx.adapter.id] || ctx.adapter.id;
  const infra: InfraMetadata = {
    provider: ctx.provider as InfraMetadata["provider"],
    service: service as InfraMetadata["service"],
    region: ctx.region,
    containerName,
    stackName: `image-builder-app-${ctx.repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
  };

  if (ctx.provision.outputs?.InstanceId) infra.instanceId = ctx.provision.outputs.InstanceId;
  if (ctx.provision.serverIp) infra.serverIp = ctx.provision.serverIp;
  if (ctx.provision.outputs?.PublicIp) infra.serverIp = ctx.provision.outputs.PublicIp;

  if (ctx.deployStrategy === "managed" && ctx.provider === "aws") {
    infra.ecsCluster = ctx.repoName;
    infra.ecsTaskFamily = ctx.repoName;
  }
  if (ctx.deployStrategy === "managed" && ctx.provider === "gcp") {
    infra.cloudRunService = containerName;
  }

  return infra;
}

async function finalizeDeploy(ctx: {
  deploymentId: string;
  event: PipelineInput;
  repoName: string;
  provider: string;
  region: string;
  deployStrategy: string;
  adapter: DeployAdapter;
  adapterCtx: AdapterContext;
  provision: ProvisionResult;
  actualImage: string;
  commitHash: string;
  logger: ContextualLogger;
}): Promise<void> {
  const isStaticDeploy = ctx.deployStrategy === "static";
  const finalUrl = ctx.provision.appUrl || "";

  const infra = buildInfraMetadata({
    provider: ctx.provider,
    region: ctx.region,
    repoName: ctx.repoName,
    deployStrategy: ctx.deployStrategy,
    adapter: ctx.adapter,
    provision: ctx.provision,
  });

  await ctx.logger.section("Complete");
  await ctx.logger.success(isStaticDeploy ? "Static site deployed" : `Docker image: ${ctx.actualImage}`);
  await ctx.logger.success(`Infrastructure provisioned via ${ctx.adapter.id}`);

  if (ctx.adapterCtx.state.machineTypeFallback) {
    await ctx.logger.warn(
      `Instance type was changed from ${ctx.adapterCtx.state.originalMachineType} to ${ctx.adapterCtx.state.machineTypeFallback} due to capacity constraints in ${ctx.region}.`,
    );
  }

  if (finalUrl) {
    await waitForAppReady(ctx.deploymentId, finalUrl);
    await ctx.logger.success(`Application URL: ${finalUrl}`);
    await updateStatus(ctx.deploymentId, "success", { app_url: finalUrl, infra });
  } else {
    await ctx.logger.warn("Could not determine app URL — check cloud console");
    await updateStatus(ctx.deploymentId, "success", { infra });
  }

  // Non-blocking notification
  const deployMessage = finalUrl
    ? `Deployment of ${ctx.event.repo} (${ctx.event.branch}) succeeded. App URL: ${finalUrl}`
    : `Deployment of ${ctx.event.repo} (${ctx.event.branch}) succeeded.`;

  void sendNotification({
    tenantId: ctx.event.tenantId,
    title: "Deployment succeeded",
    message: deployMessage,
    metadata: {
      kind: "deploy",
      repo: ctx.event.repo,
      branch: ctx.event.branch,
      commit: ctx.commitHash || undefined,
      appUrl: finalUrl || undefined,
      deployId: ctx.deploymentId,
    },
  }).catch((err) => {
    obsLogger.error({ err }, `[deploy] Failed to send deploy complete notification for ${ctx.deploymentId}`);
  });
}

// ─── Main Pipeline Orchestrator ────────────────────────────────────

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
  const providerResult = await fetchProviderCredentials(event);
  if (!providerResult) {
    await appendLog(deploymentId, `[${ts()}] ✗ Provider not found: ${event.providerId}`);
    await updateStatus(deploymentId, "failed");
    return;
  }

  const { provider, region, credentials: providerCredentials } = providerResult;

  // Template deploy path (early exit)
  if (event.templateId) {
    const templateConfig = getTemplateConfig(event.templateId);
    if (templateConfig) {
      const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);
      const logger = createDeployLogger(appendLog, deploymentId);

      try {
        await updateStatus(deploymentId, "building");
        await appendLog(deploymentId, `[${ts()}] ▶ Starting template deployment: ${templateConfig.name}`);
        await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${provider} | Region: ${region}`);
        await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${event.deployStrategy || "vps"}`);
        await appendLog(deploymentId, `[${ts()}] ℹ Docker image: ${templateConfig.dockerImage}`);

        // Use the official Docker image — no build needed
        const actualImage = templateConfig.dockerImage;

        // Merge template env vars with any project-level env vars
        const projectCtx = await loadProjectContext(event, logger);
        const templateEnvVars = templateConfig.envVars.filter(
          (tv) => !projectCtx.envVars.some((pv) => pv.name === tv.name),
        );
        const mergedEnvVars = [...templateEnvVars, ...projectCtx.envVars];

        // Merge template services into event
        const mergedServices = event.services?.length
          ? event.services
          : templateConfig.services.map((s) => ({ type: s.type, name: s.name, mode: "vps" }));

        // Build a synthetic RepoConfig for the adapter context
        const repoConfig: RepoConfig = {
          runtime: templateConfig.runtime.name as RepoConfig["runtime"],
          runtimeVersion: templateConfig.runtime.version,
          packageManager: "unknown",
          packageManagerVersion: "",
          framework: templateConfig.id,
          frameworkVersion: "",
          buildCommand: templateConfig.runtime.buildCmd,
          startCommand: templateConfig.runtime.startCmd,
          port: templateConfig.runtime.port,
          nodeVersion: "",
          hasStandalone: false,
          nativeDeps: [],
          nextConfig: {},
          phpVersion: templateConfig.runtime.name === "php" ? templateConfig.runtime.version : "",
          phpExtensions: [],
          composerScripts: [],
          pythonVersion: "",
          goVersion: "",
          subDir: "",
          features: new Set(),
        };

        const deployStrategy = event.deployStrategy || "vps";
        const adapter = getAdapter(provider, deployStrategy);
        await logger.info(`Using adapter: ${adapter.id}`);

        const adapterCtx = buildAdapterContext({
          deploymentId,
          repoName,
          shortId,
          region,
          repoDir: "",
          workDir: "",
          commitHash: "",
          providerCredentials,
          event: {
            ...event,
            services: mergedServices,
            techStack: event.techStack?.length ? event.techStack : templateConfig.techStack,
            primaryLanguage: event.primaryLanguage || templateConfig.primaryLanguage,
          },
          deployStrategy,
          repoConfig,
          actualImage,
          runCmd,
        });

        // Inject template + project env vars
        await updateStatus(deploymentId, "deploying");
        await adapter.injectEnvVars(adapterCtx, mergedEnvVars);

        // Pull the public Docker image locally and push to ECR
        // (CloudFormation ec2.yml expects an ECR URI for docker pull on the instance)
        // Force linux/amd64 platform since EC2 instances are x86_64
        await logger.info(`Pulling ${actualImage} from Docker Hub...`);
        const pullResult = await runCmd("docker", ["pull", "--platform", "linux/amd64", actualImage]);
        if (pullResult.code !== 0) {
          throw new Error(`Failed to pull Docker image: ${pullResult.output.split("\n").slice(-3).join(" ")}`);
        }
        await logger.success(`Pulled ${actualImage}`);

        // Push to ECR via the adapter (tags, pushes, and returns the ECR URI)
        const pushResult = await adapter.pushImage(adapterCtx, actualImage);
        const ecrImageUri = pushResult.remoteImageUri;

        // Provision infrastructure with the ECR image URI
        const provision = await adapter.provisionInfrastructure(adapterCtx, ecrImageUri);

        // Run adapter post-deploy steps
        await adapter.runPostDeploy(adapterCtx, provision);

        // Inject wp-config.php into the WordPress container (non-fatal)
        if (event.templateId === "wordpress" && event.projectId && event.tenantId) {
          try {
            await injectWpConfig(
              {
                tenantId: event.tenantId,
                projectId: event.projectId,
                containerName: provider === "aws"
                  ? repoName
                  : repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
                region,
                provider,
                credentials: {
                  apiKey: providerCredentials.api_key,
                  apiSecret: providerCredentials.api_secret,
                },
                instanceId: provision.outputs.InstanceId || "",
                serverIp: provision.serverIp || "",
                deployKeyPath: adapterCtx.state.deployKeyPath || "",
                workDir: "",
              },
              logger,
              runCmd,
            );
          } catch (wpErr) {
            const msg = wpErr instanceof Error ? wpErr.message : String(wpErr);
            await logger.warn(`Could not inject wp-config.php: ${msg}`);
          }
        }

        // Execute post-deploy script if configured
        if (projectCtx.deployScript.trim()) {
          const containerName = provider === "aws"
            ? repoName
            : repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

          await executePostDeployScript(
            {
              containerName,
              region,
              provider,
              techStack: templateConfig.techStack,
              services: mergedServices,
              envVars: mergedEnvVars,
              credentials: {
                apiKey: providerCredentials.api_key,
                apiSecret: providerCredentials.api_secret,
              },
              instanceId: provision.outputs.InstanceId || "",
              serverIp: provision.serverIp || "",
              deployKeyPath: adapterCtx.state.deployKeyPath || "",
              workDir: "",
            },
            projectCtx.deployScript,
            logger,
            runCmd,
            deployStrategy,
          );
        }

        // Apply network rules
        await applyNetworkRulesIfNeeded(event, deployStrategy, logger);

        // WordPress containers need extra time for MySQL + Apache to fully start
        if (event.templateId === "wordpress") {
          await logger.info("Waiting for WordPress container to stabilize...");
          await new Promise((resolve) => setTimeout(resolve, 30_000));
        }

        // Finalize
        await finalizeDeploy({
          deploymentId,
          event,
          repoName,
          provider,
          region,
          deployStrategy,
          adapter,
          adapterCtx,
          provision,
          actualImage,
          commitHash: "",
          logger,
        });

        // Restore background processes
        if (event.projectId) {
          try {
            await restoreProcessesAfterDeploy({
              tenantId: event.tenantId,
              projectId: event.projectId,
            });
          } catch (restoreErr) {
            const msg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
            await logger.warn(`Could not restore processes/jobs: ${msg}`);
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ✗ Template deployment failed: ${message}`);
        await updateStatus(deploymentId, "failed");
      }

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
    const logger = createDeployLogger(appendLog, deploymentId);
    const { repoDir, workDir, commitHash } = await cloneRepository(event, shortId, logger);
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
    const { actualImage, skippedBuild: _skippedBuild } = await buildDockerImage({
      event,
      deploymentId,
      repoName,
      shortId,
      region,
      repoDir,
      workDir,
      commitHash,
      repoConfig,
      providerCredentials,
      projectCtx,
      runCmd,
      logger,
    });

    // 6. Push image & provision infrastructure
    const deployStrategy = event.deployStrategy || "managed";
    const adapter = getAdapter(provider, deployStrategy);
    await logger.info(`Using adapter: ${adapter.id}`);

    const adapterCtx = buildAdapterContext({
      deploymentId,
      repoName,
      shortId,
      region,
      repoDir,
      workDir,
      commitHash,
      providerCredentials,
      event,
      deployStrategy,
      repoConfig,
      actualImage,
      runCmd,
    });

    await updateStatus(deploymentId, "deploying");
    const provision = await pushAndProvision(
      adapter,
      adapterCtx,
      actualImage,
      event.deployStrategy === "static",
      projectCtx,
      logger,
    );

    // 7. Execute post-deploy script
    await runPostDeployScriptIfNeeded({
      event,
      deployStrategy,
      provider,
      repoName,
      region,
      adapterCtx,
      provision,
      projectCtx,
      logger,
      runCmd,
      workDir,
    });

    // 8. Apply network rules
    await applyNetworkRulesIfNeeded(event, deployStrategy, logger);

    // 9. Finalize: health check, status update, notification
    await finalizeDeploy({
      deploymentId,
      event,
      repoName,
      provider,
      region,
      deployStrategy,
      adapter,
      adapterCtx,
      provision,
      actualImage,
      commitHash,
      logger,
    });

    // 10. Restore background processes and scheduled jobs
    if (event.projectId) {
      try {
        await restoreProcessesAfterDeploy({
          tenantId: event.tenantId,
          projectId: event.projectId,
        });
      } catch (restoreErr) {
        const msg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
        await logger.warn(`Could not restore processes/jobs: ${msg}`);
      }
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
