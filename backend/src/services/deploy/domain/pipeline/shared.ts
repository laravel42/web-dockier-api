/**
 * Deploy Pipeline — Shared Types & Stage Helpers
 *
 * Contains types (PipelineInput, ProjectContext, ProviderResult) and
 * reusable stage helper functions that are consumed by:
 *   - pipeline.ts (orchestrator)
 *   - pipeline-stages.ts (individual stages)
 *   - pipeline-template.ts (template deploy path)
 *   - pipeline-context.ts (context class)
 *   - worker.ts (queue consumer)
 *
 * This module has NO dependency on pipeline.ts, breaking the circular
 * import pressure that existed when these lived in the orchestrator.
 */

import { readFile, writeFile, rm } from "node:fs/promises";
import { logger as obsLogger } from "../../../../shared/logger.js";
import type { ContextualLogger } from "../../../../lib/logging.js";
import { containerNameFor, stackNameFor } from "../../../../lib/naming.js";
import { toDetectedStack } from "../../../../lib/repo-analyzer/index.js";
import type { RepoConfig } from "../../../../lib/repo-analyzer/types.js";
import type { AdapterContext, ProvisionResult, DeployAdapter } from "../adapters/types.js";
import type { RunCmdFn } from "../run-cmd.js";
import type { ProviderCredential } from "../../../../lib/provider-credentials.js";
import { ADAPTER_TO_SERVICE, type CloudProvider, type InfraMetadata, serializeInfra } from "../../types.js";
import { revealEnv } from "../../../projects/domain/env.js";
import { getProjectDeployConfig } from "../../../../shared/service-clients/projects.js";
import { parseEnvContent } from "../../../../shared/env/parse-env.js";

import { appendLog, updateStatus, emitDeploySuccessNotification } from "./helpers.js";
import { markProjectInfraLive } from "../lifecycle/project-teardown.js";
import { clearRepoFaviconFromAnalysisCache } from "../../../git-integration/domain/cache.js";
import { logger } from "../../../../shared/logger.js";
import { logTimestamp as ts } from "../../../../shared/utils/time.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { waitForAppReady } from "./health.js";

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
  /** Selected plan's instance size (e.g. "t3.small" / "n2d-standard-2"). Used for VPS provisioning. */
  instanceType?: string;
  /** Target region for provisioning. Falls back to the provider's configured region. */
  region?: string;
  /**
   * Explicit server start command derived from repo analysis (detectDeployRuntime).
   * The Dokploy pipeline hands this to Railpack so SSR Node apps without a
   * `start` script actually launch. Undefined → let the builder infer it.
   */
  startCommand?: string;
  /** Deploy status poll interval (ms) for the Dokploy pipeline. Test-only override; defaults to 5000. */
  deployPollIntervalMs?: number;
  /** Request ID from the originating HTTP request — used for log correlation. */
  correlationId?: string;
}

export interface ProjectContext {
  envVars: Array<{ name: string; value: string }>;
  deployScript: string;
  knownPlatform: string;
  healthCheckEnabled: boolean;
  healthCheckUrl: string;
}

export interface ProviderResult {
  provider: CloudProvider;
  region: string;
  credential: ProviderCredential;
}

// ─── Stage 3: Load Project Context ────────────────────────────────

export async function loadProjectContext(
  event: PipelineInput,
  logger: ContextualLogger,
): Promise<ProjectContext> {
  let envVars: Array<{ name: string; value: string }> = [];
  let deployScript = "";
  let knownPlatform = "";
  let healthCheckEnabled = false;
  let healthCheckUrl = "";

  if (!event.projectId || !event.tenantId) {
    await logger.info("No projectId/tenantId — skipping env/script fetch");
    return { envVars, deployScript, knownPlatform, healthCheckEnabled, healthCheckUrl };
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
    const msg = getErrMsg(envErr);
    await logger.warn(`Could not load project environment file: ${msg}`);
  }

  // Load deploy script and platform
  try {
    const projectConfig = await getProjectDeployConfig(event.projectId);
    if (projectConfig) {
      deployScript = projectConfig.deployScript;
      knownPlatform = projectConfig.platform;
      healthCheckEnabled = projectConfig.healthCheckEnabled;
      healthCheckUrl = projectConfig.healthCheckUrl;
    }
    if (deployScript) {
      await logger.info("Deploy script loaded from project settings");
    }
  } catch (settingsErr) {
    obsLogger.warn({ err: settingsErr, projectId: event.projectId }, "[deploy] Failed to load project settings");
  }

  return { envVars, deployScript, knownPlatform, healthCheckEnabled, healthCheckUrl };
}

// ─── Stage 6: Build Adapter Context ───────────────────────────────

export function buildAdapterContext(ctx: {
  deploymentId: string;
  repoName: string;
  shortId: string;
  region: string;
  repoDir: string;
  workDir: string;
  commitHash: string;
  credential: ProviderCredential;
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
    credential: ctx.credential,
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
    const { applyNetworkRules } = await import("../../../network/domain/applier.js");
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
    const msg = getErrMsg(networkErr);
    await logger.warn(`Could not apply network rules: ${msg}`);
  }
}

// ─── Stage 9: Finalize ─────────────────────────────────────────────

function buildInfraMetadata(ctx: {
  provider: CloudProvider;
  region: string;
  repoName: string;
  deployStrategy: string;
  adapter: DeployAdapter;
  provision: ProvisionResult;
}): InfraMetadata {
  const containerName = containerNameFor(ctx.repoName, ctx.provider);

  const service = ADAPTER_TO_SERVICE[ctx.adapter.id] || ctx.adapter.id;
  const infra: InfraMetadata = {
    provider: ctx.provider,
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
  provider: CloudProvider;
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

  // Infrastructure is now provisioned — mark the project's infra state live.
  await markProjectInfraLive(ctx.event.projectId);
  await clearRepoFaviconFromAnalysisCache(ctx.event.repo, ctx.event.branch, logger);

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
