/**
 * Deploy pipeline stage functions.
 *
 * Each stage reads from and writes to a shared PipelineContext instance.
 * Stages are independently testable — they require only the context
 * (with relevant properties populated) and their own dependencies.
 *
 * Stages delegate to shared helper functions in pipeline.ts where possible,
 * so the template deploy path (pipeline-template.ts) and the standard path
 * share a single implementation.
 */

import { cloneRepo, analyzeAndGenerate } from "../../../lib/build-pipeline.js";
import { containerNameFor } from "../../../lib/naming.js";
import { getProviderCredentialsSafe } from "../../../lib/provider-credentials.js";
import { getGitConnectionCredentials } from "../../../shared/service-clients/git-connections.js";
import { getAdapter } from "./adapters/index.js";
import { extractRegionFromScript } from "./gcp-helpers.js";
import { executePostDeployScript } from "./post-deploy.js";
import { isCloudProvider } from "../types.js";

import { buildImage } from "./pipeline-build.js";
import { patchDeployment } from "./deployments.js";
import { restoreProcessesAfterDeploy } from "../../processes/domain/post-deploy-restore.js";
import type { PipelineContext } from "./pipeline-context.js";
import {
  loadProjectContext,
  buildAdapterContext,
  applyNetworkRulesIfNeeded,
  finalizeDeploy,
} from "./pipeline.js";

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
