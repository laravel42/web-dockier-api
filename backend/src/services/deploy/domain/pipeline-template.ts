/**
 * Template Deploy Pipeline
 *
 * Handles deployment of pre-built Docker images from known templates (e.g. WordPress).
 * Skips clone/analyze/build stages — pulls the official image, pushes to ECR,
 * provisions infrastructure, and runs post-deploy steps.
 *
 * Extracted from pipeline.ts to keep the standard deploy path readable
 * and allow independent testing of template deployments.
 */

import type { RepoConfig } from "../../../lib/repo-analyzer/types.js";
import { createRepoConfig } from "../../../lib/repo-analyzer/types.js";
import type { ContextualLogger } from "../../../lib/logging.js";
import { createDeployLogger } from "../../../lib/logging.js";
import { getAdapter } from "./adapters/index.js";
import { createStreamingRunCmd } from "./run-cmd.js";
import { executePostDeployScript } from "./post-deploy.js";
import { injectWpConfig } from "./wp-config-inject.js";
import { restoreProcessesAfterDeploy } from "../../processes/domain/post-deploy-restore.js";
import type { TemplateConfig } from "./project-templates.js";

import { appendLog, updateStatus } from "./pipeline-helpers.js";
import { logTimestamp as ts } from "../../../shared/utils/time.js";
import { logger as obsLogger } from "../../../shared/logger.js";
import { containerNameFor, deriveRepoName } from "../../../lib/naming.js";
import {
  loadProjectContext,
  buildAdapterContext,
  applyNetworkRulesIfNeeded,
  finalizeDeploy,
  type PipelineInput,
  type ProviderResult,
} from "./pipeline-shared.js";

// ─── Template Pipeline ─────────────────────────────────────────────

/**
 * Execute the template deployment pipeline.
 *
 * Template deploys skip clone/analyze/build and instead pull a known Docker
 * image, push it to the provider registry, and provision infrastructure.
 */
export async function executeTemplatePipeline(
  event: PipelineInput,
  providerResult: ProviderResult,
  templateConfig: TemplateConfig,
): Promise<void> {
  const { deploymentId } = event;
  const { provider, region, credentials: providerCredentials } = providerResult;

  const repoName = deriveRepoName(event.repo);
  const shortId = deploymentId.slice(0, 8);

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
    const repoConfig: RepoConfig = createRepoConfig({
      runtime: templateConfig.runtime.name as RepoConfig["runtime"],
      runtimeVersion: templateConfig.runtime.version,
      framework: templateConfig.id,
      buildCommand: templateConfig.runtime.buildCmd,
      startCommand: templateConfig.runtime.startCmd,
      port: templateConfig.runtime.port,
      phpVersion: templateConfig.runtime.name === "php" ? templateConfig.runtime.version : "",
    });

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
      await injectWpConfigSafe({
        event,
        repoName,
        provider,
        region,
        providerCredentials,
        adapterCtx,
        provision,
        logger,
        runCmd,
      });
    }

    // Execute post-deploy script if configured
    if (projectCtx.deployScript.trim()) {
      await runTemplatePostDeployScript({
        repoName,
        provider,
        region,
        templateConfig,
        mergedServices,
        mergedEnvVars,
        providerCredentials,
        adapterCtx,
        provision,
        projectCtx,
        logger,
        runCmd,
        deployStrategy,
      });
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
    try {
      await updateStatus(deploymentId, "failed");
    } catch (statusErr) {
      obsLogger.error({ err: statusErr, deploymentId }, "[deploy] Could not mark template deployment as failed");
    }
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────

async function injectWpConfigSafe(ctx: {
  event: PipelineInput;
  repoName: string;
  provider: string;
  region: string;
  providerCredentials: { api_key: string; api_secret: string };
  adapterCtx: Awaited<ReturnType<typeof buildAdapterContext>>;
  provision: { outputs: Record<string, string>; serverIp?: string };
  logger: ContextualLogger;
  runCmd: ReturnType<typeof createStreamingRunCmd>;
}): Promise<void> {
  try {
    await injectWpConfig(
      {
        tenantId: ctx.event.tenantId,
        projectId: ctx.event.projectId!,
        containerName: containerNameFor(ctx.repoName, ctx.provider),
        region: ctx.region,
        provider: ctx.provider,
        credentials: {
          apiKey: ctx.providerCredentials.api_key,
          apiSecret: ctx.providerCredentials.api_secret,
        },
        instanceId: ctx.provision.outputs.InstanceId || "",
        serverIp: ctx.provision.serverIp || "",
        deployKeyPath: ctx.adapterCtx.state.deployKeyPath || "",
        workDir: "",
      },
      ctx.logger,
      ctx.runCmd,
    );
  } catch (wpErr) {
    const msg = wpErr instanceof Error ? wpErr.message : String(wpErr);
    await ctx.logger.warn(`Could not inject wp-config.php: ${msg}`);
  }
}

async function runTemplatePostDeployScript(ctx: {
  repoName: string;
  provider: string;
  region: string;
  templateConfig: TemplateConfig;
  mergedServices: Array<{ type: string; name: string; mode: string }>;
  mergedEnvVars: Array<{ name: string; value: string }>;
  providerCredentials: { api_key: string; api_secret: string };
  adapterCtx: Awaited<ReturnType<typeof buildAdapterContext>>;
  provision: { outputs: Record<string, string>; serverIp?: string };
  projectCtx: { deployScript: string };
  logger: ContextualLogger;
  runCmd: ReturnType<typeof createStreamingRunCmd>;
  deployStrategy: string;
}): Promise<void> {
  const containerName = containerNameFor(ctx.repoName, ctx.provider);

  await executePostDeployScript(
    {
      containerName,
      region: ctx.region,
      provider: ctx.provider,
      techStack: ctx.templateConfig.techStack,
      services: ctx.mergedServices,
      envVars: ctx.mergedEnvVars,
      credentials: {
        apiKey: ctx.providerCredentials.api_key,
        apiSecret: ctx.providerCredentials.api_secret,
      },
      instanceId: ctx.provision.outputs.InstanceId || "",
      serverIp: ctx.provision.serverIp || "",
      deployKeyPath: ctx.adapterCtx.state.deployKeyPath || "",
      workDir: "",
    },
    ctx.projectCtx.deployScript,
    ctx.logger,
    ctx.runCmd,
    ctx.deployStrategy,
  );
}
