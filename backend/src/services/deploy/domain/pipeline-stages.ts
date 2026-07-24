/**
 * Deploy pipeline stage functions.
 *
 * Each stage reads from and writes to a shared PipelineContext instance.
 * Stages are independently testable — they require only the context
 * (with relevant properties populated) and their own dependencies.
 */

import { readFile, writeFile, rm } from "node:fs/promises";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger as obsLogger } from "../../../shared/logger.js";
import { cloneRepo, analyzeAndGenerate } from "../../../lib/build-pipeline.js";
import { containerNameFor, stackNameFor } from "../../../lib/naming.js";
import { getProviderCredentialsSafe } from "../../../lib/provider-credentials.js";
import { toDetectedStack } from "../../../lib/repo-analyzer/index.js";
import { getAdapter } from "./adapters/index.js";
import type { AdapterContext } from "./adapters/types.js";
import { extractRegionFromScript } from "./gcp-helpers.js";
import { executePostDeployScript } from "./post-deploy.js";
import { ADAPTER_TO_SERVICE, type InfraMetadata, serializeInfra } from "../types.js";
import { revealEnv } from "../../projects/domain/env.js";

import { appendLog, updateStatus, parseEnvContent, emitDeploySuccessNotification } from "./pipeline-helpers.js";
import { logTimestamp as ts } from "../../../shared/utils/time.js";
import { buildImage } from "./pipeline-build.js";
import { waitForAppReady } from "./pipeline-health.js";
import { patchDeployment } from "./deployments.js";
import { restoreProcessesAfterDeploy } from "../../processes/domain/post-deploy-restore.js";
import type { PipelineContext } from "./pipeline-context.js";

// ─── Stage 1: Provider Credentials ─────────────────────────────────

export async function stageProviderCredentials(ctx: PipelineContext): Promise<void> {
  const creds = await getProviderCredentialsSafe(ctx.event.providerId);
  if (!creds) {
    throw new Error(`Provider not found: ${ctx.event.providerId}`);
  }

  ctx.provider = creds.provider || "cloud";
  ctx.region = creds.region || "us-east-1";

  if (ctx.event.tofuScript) {
    const scriptRegion = extractRegionFromScript(ctx.event.tofuScript);
    if (scriptRegion) ctx.region = scriptRegion;
  }

  ctx.credentials = { api_key: creds.apiKey, api_secret: creds.apiSecret };
}

// ─── Stage 2: Clone Repository ──────────────────────────────────────

export async function stageClone(ctx: PipelineContext): Promise<void> {
  const { data: connRow, error } = await supabaseAdmin
    .from("git_connections")
    .select("provider, personal_token, endpoint")
    .eq("id", ctx.event.gitConnectionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error fetching git connection: ${error.message}`);
  }
  if (!connRow) throw new Error("Git connection not found");

  const result = await cloneRepo({
    git: {
      provider: connRow.provider || "",
      token: connRow.personal_token || "",
      repo: ctx.event.repo,
      endpoint: connRow.endpoint || "",
    },
    branch: ctx.event.branch,
    shortId: ctx.shortId,
    logger: ctx.logger,
  });

  ctx.repoDir = result.repoDir;
  ctx.workDir = result.workDir;
  ctx.commitHash = result.commitHash;
  await patchDeployment(ctx.deploymentId, { commit_hash: ctx.commitHash });
}

// ─── Stage 3: Load Project Context ─────────────────────────────────

export async function stageLoadProjectContext(ctx: PipelineContext): Promise<void> {
  if (!ctx.event.projectId || !ctx.event.tenantId) {
    await ctx.logger.info("No projectId/tenantId — skipping env/script fetch");
    return;
  }

  // Load env vars
  try {
    const envResult = await revealEnv({ tenantId: ctx.event.tenantId, projectId: ctx.event.projectId });
    if (envResult.exists && envResult.content) {
      ctx.envVars = parseEnvContent(envResult.content);
      await ctx.logger.info(`Loaded ${ctx.envVars.length} env vars from project settings`);
    } else {
      await ctx.logger.info("No environment file configured for this project");
    }
  } catch (envErr) {
    const msg = envErr instanceof Error ? envErr.message : String(envErr);
    await ctx.logger.warn(`Could not load project environment file: ${msg}`);
  }

  // Load deploy script and platform
  try {
    const { data: projectRow } = await supabaseAdmin
      .from("projects")
      .select("settings,platform")
      .eq("id", ctx.event.projectId)
      .maybeSingle();
    if (projectRow?.settings && typeof projectRow.settings === "object" && !Array.isArray(projectRow.settings)) {
      ctx.deployScript = (projectRow.settings as Record<string, unknown>).deployScript as string ?? "";
    }
    if (projectRow?.platform) {
      ctx.knownPlatform = projectRow.platform as string;
    }
    if (ctx.deployScript) {
      await ctx.logger.info("Deploy script loaded from project settings");
    }
  } catch (settingsErr) {
    obsLogger.warn({ err: settingsErr, projectId: ctx.event.projectId }, "[deploy] Failed to load project settings");
  }
}

// ─── Stage 4: Analyze & Generate Dockerfile ─────────────────────────

export async function stageAnalyze(ctx: PipelineContext): Promise<void> {
  const { repoConfig } = await analyzeAndGenerate({
    repoDir: ctx.repoDir,
    logger: ctx.logger,
    skipExistingDockerfile: ctx.event.useRepoDockerfile === true,
    knownPlatform: ctx.knownPlatform,
  });

  ctx.repoConfig = repoConfig;
}

// ─── Stage 5: Build Docker Image ────────────────────────────────────

export async function stageBuild(ctx: PipelineContext): Promise<void> {
  if (ctx.isStaticDeploy) {
    ctx.actualImage = `${ctx.repoName}:${ctx.shortId}`;
    ctx.skippedBuild = true;
    return;
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
    providerRow: ctx.credentials,
    projectEnvVars: ctx.envVars,
    techStack: ctx.event.techStack,
    runCmd: ctx.runCmd,
    logger: ctx.logger,
  });

  ctx.actualImage = result.actualImage;
  ctx.skippedBuild = result.skippedBuild;
}

// ─── Stage 6: Push & Provision Infrastructure ───────────────────────

export async function stageProvision(ctx: PipelineContext): Promise<void> {
  const adapter = getAdapter(ctx.provider, ctx.deployStrategy);
  await ctx.logger.info(`Using adapter: ${adapter.id}`);
  ctx.adapter = adapter;

  // Build adapter context
  const detectedStack = toDetectedStack(ctx.repoConfig);
  const adapterCtx: AdapterContext = {
    deploymentId: ctx.deploymentId,
    repoName: ctx.repoName,
    shortId: ctx.shortId,
    region: ctx.region,
    repoDir: ctx.repoDir,
    workDir: ctx.workDir,
    commitHash: ctx.commitHash,
    providerCredentials: { apiKey: ctx.credentials.api_key, apiSecret: ctx.credentials.api_secret },
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
  ctx.adapterCtx = adapterCtx;

  // Inject environment variables
  await adapter.injectEnvVars(adapterCtx, ctx.envVars);

  // Push image to provider registry
  let pushResult: { remoteImageUri: string; skipped: boolean };
  const isAlreadyRemote = ctx.actualImage.includes(".dkr.ecr.") || ctx.actualImage.includes("gcr.io") || ctx.actualImage.includes("docker.pkg.dev");

  if (isAlreadyRemote || ctx.isStaticDeploy) {
    pushResult = { remoteImageUri: ctx.actualImage, skipped: true };
    if (isAlreadyRemote) await ctx.logger.info(`Image already in registry: ${ctx.actualImage}`);
  } else {
    pushResult = await adapter.pushImage(adapterCtx, ctx.actualImage);
  }

  // Provision infrastructure
  const imageUri = pushResult.skipped ? "" : pushResult.remoteImageUri;
  ctx.provision = await adapter.provisionInfrastructure(adapterCtx, imageUri || ctx.actualImage);

  // Run adapter post-deploy steps
  await adapter.runPostDeploy(adapterCtx, ctx.provision);
}

// ─── Stage 7: Post-Deploy Script ────────────────────────────────────

export async function stagePostDeploy(ctx: PipelineContext): Promise<void> {
  if (ctx.isStaticDeploy) return;
  if (!ctx.deployScript.trim()) return;

  const containerName = containerNameFor(ctx.repoName, ctx.provider);

  await executePostDeployScript(
    {
      containerName,
      region: ctx.region,
      provider: ctx.provider,
      techStack: ctx.event.techStack || [],
      services: ctx.event.services || [],
      envVars: ctx.envVars,
      credentials: {
        apiKey: ctx.adapterCtx.providerCredentials.apiKey,
        apiSecret: ctx.adapterCtx.providerCredentials.apiSecret,
      },
      instanceId: ctx.provision.outputs.InstanceId || "",
      serverIp: ctx.provision.serverIp || "",
      deployKeyPath: ctx.adapterCtx.state.deployKeyPath || "",
      workDir: ctx.workDir,
    },
    ctx.deployScript,
    ctx.logger,
    ctx.runCmd,
    ctx.deployStrategy,
  );
}

// ─── Stage 8: Network Rules ────────────────────────────────────────

export async function stageNetworkRules(ctx: PipelineContext): Promise<void> {
  if (!ctx.event.projectId || ctx.deployStrategy !== "vps") return;

  try {
    const { applyNetworkRules } = await import("../../network/domain/applier.js");
    const networkResult = await applyNetworkRules({
      tenantId: ctx.event.tenantId,
      projectId: ctx.event.projectId,
    });
    if (networkResult.success) {
      if (networkResult.generatedConfig) {
        await ctx.logger.info("Network rules applied to nginx configuration");
      }
    } else {
      await ctx.logger.warn(`Could not apply network rules: ${networkResult.message}`);
    }
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    await ctx.logger.warn(`Could not apply network rules: ${msg}`);
  }
}

// ─── Stage 9: Finalize ──────────────────────────────────────────────

export async function stageFinalize(ctx: PipelineContext): Promise<void> {
  const finalUrl = ctx.provision.appUrl || "";
  const containerName = containerNameFor(ctx.repoName, ctx.provider);

  const service = ADAPTER_TO_SERVICE[ctx.adapter.id] || ctx.adapter.id;
  const infra: InfraMetadata = {
    provider: ctx.provider as InfraMetadata["provider"],
    service: service as InfraMetadata["service"],
    region: ctx.region,
    containerName,
    stackName: stackNameFor(ctx.repoName),
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

  await ctx.logger.section("Complete");
  await ctx.logger.success(ctx.isStaticDeploy ? "Static site deployed" : `Docker image: ${ctx.actualImage}`);
  await ctx.logger.success(`Infrastructure provisioned via ${ctx.adapter.id}`);

  if (ctx.adapterCtx.state.machineTypeFallback) {
    await ctx.logger.warn(
      `Instance type was changed from ${ctx.adapterCtx.state.originalMachineType} to ${ctx.adapterCtx.state.machineTypeFallback} due to capacity constraints in ${ctx.region}.`,
    );
  }

  if (finalUrl) {
    await waitForAppReady(ctx.deploymentId, finalUrl);
    await ctx.logger.success(`Application URL: ${finalUrl}`);
    await updateStatus(ctx.deploymentId, "success", { app_url: finalUrl, infra: serializeInfra(infra) });
  } else {
    await ctx.logger.warn("Could not determine app URL — check cloud console");
    await updateStatus(ctx.deploymentId, "success", { infra: serializeInfra(infra) });
  }

  emitDeploySuccessNotification({
    tenantId: ctx.event.tenantId,
    deploymentId: ctx.deploymentId,
    repo: ctx.event.repo,
    branch: ctx.event.branch,
    commitHash: ctx.commitHash,
    appUrl: finalUrl,
  });
}

// ─── Stage 10: Restore Processes ────────────────────────────────────

export async function stageRestoreProcesses(ctx: PipelineContext): Promise<void> {
  if (!ctx.event.projectId) return;

  try {
    await restoreProcessesAfterDeploy({
      tenantId: ctx.event.tenantId,
      projectId: ctx.event.projectId,
    });
  } catch (restoreErr) {
    const msg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
    await ctx.logger.warn(`Could not restore processes/jobs: ${msg}`);
  }
}
