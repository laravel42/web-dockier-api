/**
 * Deploy pipeline stage functions.
 *
 * Each stage reads from and writes to a shared PipelineContext instance.
 * Stages are independently testable — they require only the context
 * (with relevant properties populated) and their own dependencies.
 *
 * Stages delegate to shared helper functions in shared.ts where possible.
 * Template deploys skip clone/analyze/build and use template-specific
 * initialization instead (stageTemplateInit, stageTemplatePull).
 */

import { cloneRepo, analyzeAndGenerate } from "../../../../lib/build-pipeline.js";
import { containerNameFor } from "../../../../lib/naming.js";
import { getProviderCredentialsSafe } from "../../../../lib/provider-credentials.js";
import { getGitConnectionCredentials } from "../../../../shared/service-clients/git-connections.js";
import { getAdapter } from "../adapters/index.js";
import { extractRegionFromScript } from "../infra/gcp-helpers.js";
import { executePostDeployScript } from "../lifecycle/post-deploy.js";
import { injectWpConfig } from "../lifecycle/wp-config-inject.js";
import { isCloudProvider } from "../../types.js";
import { createRepoConfig } from "../../../../lib/repo-analyzer/types.js";
import type { RepoConfig } from "../../../../lib/repo-analyzer/types.js";

import { buildImage } from "./build.js";
import { patchDeployment } from "../deployments.js";
import { restoreProcessesAfterDeploy } from "../../../../shared/service-clients/processes.js";
import type { PipelineContext } from "./context.js";
import {
  loadProjectContext,
  buildAdapterContext,
  applyNetworkRulesIfNeeded,
  finalizeDeploy,
} from "./shared.js";

// ─── Stage 1: Provider Credentials ─────────────────────────────────

export async function stageProviderCredentials(ctx: PipelineContext): Promise<void> {
  const creds = await getProviderCredentialsSafe(ctx.event.providerId);
  if (!creds) {
    throw new Error(`Provider not found: ${ctx.event.providerId}`);
  }

  const rawProvider = creds.provider || "";
  if (!isCloudProvider(rawProvider)) {
    throw new Error(`Unsupported cloud provider: "${rawProvider}". Expected "aws" or "gcp".`);
  }

  ctx.provider = rawProvider;
  ctx.region = creds.region || "us-east-1";

  if (ctx.event.tofuScript) {
    const scriptRegion = extractRegionFromScript(ctx.event.tofuScript);
    if (scriptRegion) ctx.region = scriptRegion;
  }

  ctx.credentials = { api_key: creds.apiKey, api_secret: creds.apiSecret };
}

// ─── Stage 2: Clone Repository ──────────────────────────────────────

export async function stageClone(ctx: PipelineContext): Promise<void> {
  const creds = await getGitConnectionCredentials(ctx.event.gitConnectionId);
  if (!creds) throw new Error("Git connection not found");

  const result = await cloneRepo({
    git: {
      provider: creds.provider,
      token: creds.token,
      repo: ctx.event.repo,
      endpoint: creds.endpoint,
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
  const result = await loadProjectContext(ctx.event, ctx.logger);
  ctx.envVars = result.envVars;
  ctx.deployScript = result.deployScript;
  ctx.knownPlatform = result.knownPlatform;
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

  // Build adapter context using the shared helper
  const adapterCtx = buildAdapterContext({
    deploymentId: ctx.deploymentId,
    repoName: ctx.repoName,
    shortId: ctx.shortId,
    region: ctx.region,
    repoDir: ctx.repoDir,
    workDir: ctx.workDir,
    commitHash: ctx.commitHash,
    providerCredentials: ctx.credentials,
    event: ctx.event,
    deployStrategy: ctx.deployStrategy,
    repoConfig: ctx.repoConfig,
    actualImage: ctx.actualImage,
    runCmd: ctx.runCmd,
  });
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
  await applyNetworkRulesIfNeeded(ctx.event, ctx.deployStrategy, ctx.logger);
}

// ─── Stage 9: Finalize ──────────────────────────────────────────────

export async function stageFinalize(ctx: PipelineContext): Promise<void> {
  await finalizeDeploy({
    deploymentId: ctx.deploymentId,
    event: ctx.event,
    repoName: ctx.repoName,
    provider: ctx.provider,
    region: ctx.region,
    deployStrategy: ctx.deployStrategy,
    adapter: ctx.adapter,
    adapterCtx: ctx.adapterCtx,
    provision: ctx.provision,
    actualImage: ctx.actualImage,
    commitHash: ctx.commitHash,
    logger: ctx.logger,
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

// ═══════════════════════════════════════════════════════════════════
// Template-specific stages
// ═══════════════════════════════════════════════════════════════════

// ─── Template Init: Replaces Clone + Analyze + Build ────────────────

/**
 * Initialize template deploy context.
 *
 * Sets up the synthetic RepoConfig, merges env vars with template defaults,
 * and sets actualImage to the template's Docker image. This replaces
 * stageClone, stageAnalyze, and stageBuild for template deploys.
 */
export async function stageTemplateInit(ctx: PipelineContext): Promise<void> {
  const tc = ctx.templateConfig!;

  await ctx.logger.info(`Docker image: ${tc.dockerImage}`);

  // Set the actual image — no build needed
  ctx.actualImage = tc.dockerImage;
  ctx.skippedBuild = true;

  // Build a synthetic RepoConfig for the adapter context
  ctx.repoConfig = createRepoConfig({
    runtime: tc.runtime.name as RepoConfig["runtime"],
    runtimeVersion: tc.runtime.version,
    framework: tc.id,
    buildCommand: tc.runtime.buildCmd,
    startCommand: tc.runtime.startCmd,
    port: tc.runtime.port,
    phpVersion: tc.runtime.name === "php" ? tc.runtime.version : "",
  });

  // Merge template env vars with project-level env vars (project wins on conflict)
  const templateEnvVars = tc.envVars.filter(
    (tv) => !ctx.envVars.some((pv) => pv.name === tv.name),
  );
  ctx.envVars = [...templateEnvVars, ...ctx.envVars];

  // Merge template services into event if not already set
  if (!ctx.event.services?.length) {
    ctx.event.services = tc.services.map((s) => ({ type: s.type, name: s.name, mode: "vps" }));
  }

  // Backfill techStack/primaryLanguage from template if not set by user
  if (!ctx.event.techStack?.length) {
    ctx.event.techStack = tc.techStack;
  }
  if (!ctx.event.primaryLanguage) {
    ctx.event.primaryLanguage = tc.primaryLanguage;
  }
}

// ─── Template Pull: Pull Docker Image ───────────────────────────────

/**
 * Pull the template's Docker image locally.
 *
 * Forces linux/amd64 platform since EC2 instances are x86_64.
 * This runs before stageProvision so the image is available for push.
 */
export async function stageTemplatePull(ctx: PipelineContext): Promise<void> {
  const image = ctx.actualImage;
  await ctx.logger.info(`Pulling ${image} from Docker Hub...`);

  const pullResult = await ctx.runCmd("docker", ["pull", "--platform", "linux/amd64", image]);
  if (pullResult.code !== 0) {
    throw new Error(`Failed to pull Docker image: ${pullResult.output.split("\n").slice(-3).join(" ")}`);
  }
  await ctx.logger.success(`Pulled ${image}`);
}

// ─── Template Post-Deploy: WordPress-specific steps ─────────────────

/**
 * WordPress-specific post-deploy steps:
 * 1. Inject wp-config.php into the container (non-fatal)
 * 2. Wait for MySQL + Apache to stabilize
 */
export async function stageTemplatePostDeploy(ctx: PipelineContext): Promise<void> {
  if (ctx.event.templateId !== "wordpress") return;
  if (!ctx.event.projectId || !ctx.event.tenantId) return;

  // Inject wp-config.php (non-fatal)
  try {
    await injectWpConfig(
      {
        tenantId: ctx.event.tenantId,
        projectId: ctx.event.projectId,
        containerName: containerNameFor(ctx.repoName, ctx.provider),
        region: ctx.region,
        provider: ctx.provider,
        credentials: {
          apiKey: ctx.credentials.api_key,
          apiSecret: ctx.credentials.api_secret,
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

  // WordPress containers need extra time for MySQL + Apache to fully start
  await ctx.logger.info("Waiting for WordPress container to stabilize...");
  await new Promise((resolve) => setTimeout(resolve, 30_000));
}
