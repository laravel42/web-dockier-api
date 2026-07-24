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
import { createDeployLogger, type ContextualLogger } from "../../../lib/logging.js";
import { containerNameFor, stackNameFor } from "../../../lib/naming.js";
export { containerNameFor, deriveRepoName } from "../../../lib/naming.js";
import { getProviderCredentialsSafe } from "../../../lib/provider-credentials.js";
import { toDetectedStack } from "../../../lib/repo-analyzer/index.js";
import type { RepoConfig } from "../../../lib/repo-analyzer/types.js";
import type { AdapterContext, ProvisionResult, DeployAdapter } from "./adapters/types.js";
import { createStreamingRunCmd, type RunCmdFn } from "./run-cmd.js";
import { extractRegionFromScript } from "./gcp-helpers.js";
import { getTemplateConfig } from "./project-templates.js";
import { ADAPTER_TO_SERVICE, type InfraMetadata, serializeInfra } from "../types.js";
import { revealEnv } from "../../projects/domain/env.js";
import { executeTemplatePipeline } from "./pipeline-template.js";

import { appendLog, updateStatus, parseEnvContent, emitDeploySuccessNotification } from "./pipeline-helpers.js";
import { logTimestamp as ts } from "../../../shared/utils/time.js";
import { waitForAppReady } from "./pipeline-health.js";
import { getDeploymentCurrentStatus } from "./deployments.js";

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

export type { ProjectContext };

// ─── Stage 1: Fetch Provider Credentials ───────────────────────────

export interface ProviderResult {
  provider: string;
  region: string;
  credentials: { api_key: string; api_secret: string };
}

async function fetchProviderCredentials(
  event: PipelineInput,
): Promise<ProviderResult | null> {
  const creds = await getProviderCredentialsSafe(event.providerId);
  if (!creds) {
    obsLogger.error({ providerId: event.providerId }, "[deploy] Provider not found or credentials unavailable");
    return null;
  }

  let region = creds.region || "us-east-1";
  if (event.tofuScript) {
    const scriptRegion = extractRegionFromScript(event.tofuScript);
    if (scriptRegion) region = scriptRegion;
  }

  return {
    provider: creds.provider || "cloud",
    region,
    credentials: {
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
    },
  };
}

// ─── Stage 3: Load Project Context ────────────────────────────────

export async function loadProjectContext(
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

// ─── Stage 6: Push & Provision ─────────────────────────────────────

export function buildAdapterContext(ctx: {
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

// ─── Stage 8: Network Rules ───────────────────────────────────────

export async function applyNetworkRulesIfNeeded(
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

  return infra;
}

export async function finalizeDeploy(ctx: {
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
    await updateStatus(ctx.deploymentId, "success", { app_url: finalUrl, infra: serializeInfra(infra) });
  } else {
    await ctx.logger.warn("Could not determine app URL — check cloud console");
    await updateStatus(ctx.deploymentId, "success", { infra: serializeInfra(infra) });
  }

  // Non-blocking notification
  emitDeploySuccessNotification({
    tenantId: ctx.event.tenantId,
    deploymentId: ctx.deploymentId,
    repo: ctx.event.repo,
    branch: ctx.event.branch,
    commitHash: ctx.commitHash,
    appUrl: finalUrl,
  });
}

// ─── Main Pipeline Orchestrator ────────────────────────────────────

import { PipelineContext } from "./pipeline-context.js";
import {
  stageProviderCredentials,
  stageClone,
  stageLoadProjectContext,
  stageAnalyze,
  stageBuild,
  stageProvision,
  stagePostDeploy,
  stageNetworkRules,
  stageFinalize,
  stageRestoreProcesses,
} from "./pipeline-stages.js";

/**
 * Execute the full deployment pipeline.
 * This runs asynchronously via the pg-boss job queue.
 */
export async function executePipeline(event: PipelineInput): Promise<void> {
  const { deploymentId } = event;

  // Idempotency guard
  const currentStatus = await getDeploymentCurrentStatus(deploymentId);
  if (currentStatus === "building" || currentStatus === "deploying") return;

  // Template deploy path (early exit)
  if (event.templateId) {
    const templateConfig = getTemplateConfig(event.templateId);
    if (templateConfig) {
      const providerResult = await fetchProviderCredentials(event);
      if (providerResult) {
        await executeTemplatePipeline(event, providerResult, templateConfig);
        return;
      }
    }
  }

  // Standard deploy path
  const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);
  const logger = createDeployLogger(appendLog, deploymentId);
  const ctx = new PipelineContext(event, logger, runCmd);

  try {
    await updateStatus(deploymentId, "building");
    await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);

    await stageProviderCredentials(ctx);
    await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${ctx.provider} | Region: ${ctx.region}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${ctx.deployStrategy}`);
    await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${ctx.event.repo} | Branch: ${ctx.event.branch}`);

    await stageClone(ctx);
    await stageLoadProjectContext(ctx);
    await stageAnalyze(ctx);
    await stageBuild(ctx);

    await updateStatus(deploymentId, "deploying");
    await stageProvision(ctx);
    await stagePostDeploy(ctx);
    await stageNetworkRules(ctx);
    await stageFinalize(ctx);
    await stageRestoreProcesses(ctx);

    await rm(ctx.workDir, { recursive: true, force: true }).catch(() => {});
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${message}`);
    await updateStatus(deploymentId, "failed");
  }
}
