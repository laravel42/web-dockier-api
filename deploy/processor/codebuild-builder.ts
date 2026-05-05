/**
 * CodeBuild Builder — remote image build via AWS CodeBuild.
 *
 * This module handles the "codebuild" build method: it zips the source,
 * uploads to S3, triggers CodeBuild via SNS, and polls until the image
 * is built and pushed to ECR. It returns the ECR image URI so the caller
 * can hand off to the standard adapter dispatch for infrastructure provisioning.
 */

import { db, getDeployCallbackUrl, type DeployEvent } from "../shared";
import { appendLog, ts } from "./helpers";
import type { RepoConfig } from "../../lib/repo-analyzer/types";
import { toDetectedStack } from "../../lib/repo-analyzer";
import { generateBuildspec } from "../../lib/buildspec-generator";

// ─── Types ─────────────────────────────────────────────────────────

export interface CodeBuildResult {
  /** ECR image URI after successful build (e.g., 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:abc12345) */
  remoteImageUri: string;
  /** The image repo name used in ECR */
  imageRepoName: string;
}

export interface CodeBuildOptions {
  deploymentId: string;
  repoName: string;
  shortId: string;
  region: string;
  providerRow: { api_key: string; api_secret: string };
  repoDir: string;
  workDir: string;
  commitHash: string;
  repoConfig: RepoConfig;
  event: DeployEvent;
}

// ─── Constants ─────────────────────────────────────────────────────

const CODEBUILD_PROJECT = "image-builder";
const CODEBUILD_POLL_INTERVAL_MS = 15_000;
const CODEBUILD_MAX_ATTEMPTS = 60; // 15 minutes

// ─── Main Function ─────────────────────────────────────────────────

/**
 * Build a Docker image remotely via AWS CodeBuild.
 *
 * Flow:
 * 1. Generate buildspec from detected stack
 * 2. Zip source code (excluding node_modules, .git, etc.)
 * 3. Upload zip to S3
 * 4. Publish SNS message to trigger CodeBuild
 * 5. Poll CodeBuild until image is built and pushed to ECR
 * 6. Return the ECR image URI
 *
 * Throws if the build fails or times out.
 */
export async function buildViaCodeBuild(opts: CodeBuildOptions): Promise<CodeBuildResult> {
  const { deploymentId, repoName, repoDir, workDir, commitHash, region, event } = opts;
  const accessKeyId = opts.providerRow.api_key || "";
  const secretAccessKey = opts.providerRow.api_secret || "";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials not configured on provider.");
  }

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Build via CodeBuild ─────────────`);

  // 1. Get AWS account ID
  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  const sts = new STSClient({ region, credentials: { accessKeyId, secretAccessKey } });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account || "";

  const imageRepoName = repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const cacheRepoName = `${imageRepoName}-cache`;
  const bucketName = `${CODEBUILD_PROJECT}-source-${accountId}`;

  // 2. Generate and inject buildspec
  const buildspecContent = generateBuildspec(toDetectedStack(opts.repoConfig));
  const { writeFile, rm } = await import("node:fs/promises");
  await writeFile(`${repoDir}/buildspec.yml`, buildspecContent, "utf-8");

  // 3. Zip source
  await rm(`${repoDir}/.git`, { recursive: true, force: true });
  const zipBuffer = await zipSourceDirectory(repoDir);
  await appendLog(deploymentId, `[${ts()}] ℹ Source bundle: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  // 4. Upload to S3
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  const s3Key = `${deploymentId}.zip`;
  await s3.send(new PutObjectCommand({ Bucket: bucketName, Key: s3Key, Body: zipBuffer, ContentType: "application/zip" }));
  await appendLog(deploymentId, `[${ts()}] ✓ Source uploaded to S3 (${bucketName}/${s3Key})`);

  // 5. Publish SNS message to trigger CodeBuild
  const deployTargetMap: Record<string, string> = { vps: "ec2", managed: "ecs" };
  const deployTarget = deployTargetMap[event.deployStrategy] || "ec2";
  const deployParams = buildDeployParams(repoName, opts.repoConfig, event, deployTarget);

  let callbackUrl = "";
  try { callbackUrl = getDeployCallbackUrl(); } catch { /* ignore */ }

  const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns");
  const sns = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });
  const buildRequestTopicArn = `arn:aws:sns:${region}:${accountId}:${CODEBUILD_PROJECT}-build-request`;

  await sns.send(new PublishCommand({
    TopicArn: buildRequestTopicArn,
    Subject: "build-request",
    Message: JSON.stringify({
      buildId: deploymentId, sourceRepo: event.repo, sourceRef: event.branch, commitSha: commitHash,
      imageRepoName, cacheRepoName, s3Bucket: bucketName, s3Key, accountId, region,
      codebuildProject: CODEBUILD_PROJECT, deployTarget, deployParams, callbackUrl,
    }),
  }));
  await appendLog(deploymentId, `[${ts()}] ✓ Build queued via SNS → CodeBuild`);

  // 6. Cleanup work directory
  try { await rm(workDir, { recursive: true, force: true }); } catch {}

  // 7. Poll CodeBuild until image is ready
  const remoteImageUri = await pollCodeBuild({
    deploymentId, region, accessKeyId, secretAccessKey, accountId, imageRepoName,
  });

  return { remoteImageUri, imageRepoName };
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Zip the source directory, excluding heavy/unnecessary directories.
 */
async function zipSourceDirectory(repoDir: string): Promise<Buffer> {
  const { default: AdmZip } = await import("adm-zip");
  const { readdirSync } = await import("node:fs");
  const { join } = await import("node:path");

  const zip = new AdmZip();
  const skipDirs = new Set(["node_modules", ".git", ".pnpm-store", ".turbo", ".cache", "__pycache__", ".venv", "venv"]);
  const skipRootOnly = new Set(["vendor"]);

  const addDir = (dirPath: string, zipPrefix: string) => {
    const items = readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory() && skipDirs.has(item.name)) continue;
      if (item.isDirectory() && skipRootOnly.has(item.name) && !zipPrefix) continue;
      const fullPath = join(dirPath, item.name);
      if (item.isDirectory()) addDir(fullPath, zipPrefix ? `${zipPrefix}/${item.name}` : item.name);
      else zip.addLocalFile(fullPath, zipPrefix || undefined);
    }
  };

  addDir(repoDir, "");
  return zip.toBuffer();
}

/**
 * Build the deploy params object sent via SNS to CodeBuild.
 */
function buildDeployParams(
  repoName: string,
  repoConfig: RepoConfig,
  event: DeployEvent,
  deployTarget: string,
): Record<string, unknown> {
  const deployParams: Record<string, unknown> = {
    appName: repoName,
    containerPort: repoConfig.port || 3000,
  };

  if (deployTarget === "ecs") {
    deployParams.cpu = "512";
    deployParams.memory = "1024";
  }
  if (deployTarget === "ec2") {
    deployParams.instanceType = "t3.small";
  }
  if (event.envVars && event.envVars.length > 0) {
    deployParams.envVars = event.envVars;
  }
  if (event.techStack && event.techStack.length > 0) {
    deployParams.techStack = event.techStack;
  }

  // Auto-detect self-hosted services
  const selfHostedServices: string[] = [];
  const hasDbEnvVars = (event.envVars || []).some(v =>
    ["DB_CONNECTION", "DB_DATABASE", "DB_HOST"].includes(v.name),
  );
  if (event.techStack?.some(t => t.toLowerCase() === "laravel") || hasDbEnvVars) {
    selfHostedServices.push("database");
  }
  if (selfHostedServices.length > 0) {
    deployParams.selfHostedServices = selfHostedServices;
  }

  return deployParams;
}

/**
 * Poll CodeBuild until the build succeeds (image pushed to ECR).
 * Throws if the build fails or times out.
 */
async function pollCodeBuild(opts: {
  deploymentId: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  accountId: string;
  imageRepoName: string;
}): Promise<string> {
  const { deploymentId, region, accessKeyId, secretAccessKey, accountId, imageRepoName } = opts;
  const credentials = { accessKeyId, secretAccessKey };

  const { CodeBuildClient, ListBuildsForProjectCommand, BatchGetBuildsCommand } = await import("@aws-sdk/client-codebuild");
  const cbClient = new CodeBuildClient({ region, credentials });

  let codebuildId = "";

  for (let attempt = 0; attempt < CODEBUILD_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, CODEBUILD_POLL_INTERVAL_MS));

    // Find the CodeBuild build matching our deployment
    if (!codebuildId) {
      try {
        const listResult = await cbClient.send(new ListBuildsForProjectCommand({
          projectName: CODEBUILD_PROJECT, sortOrder: "DESCENDING",
        }));
        const buildIds = (listResult.ids || []).slice(0, 10);
        if (buildIds.length > 0) {
          const batchResult = await cbClient.send(new BatchGetBuildsCommand({ ids: buildIds }));
          const match = (batchResult.builds || []).find(b =>
            (b.source?.location || "").includes(`${deploymentId}.zip`),
          );
          if (match?.id) {
            codebuildId = match.id;
            await appendLog(deploymentId, `[${ts()}] ℹ CodeBuild started: ${codebuildId}`);
          }
        }
      } catch { /* retry next iteration */ }
    }

    // Check build status
    if (codebuildId) {
      try {
        const batchResult = await cbClient.send(new BatchGetBuildsCommand({ ids: [codebuildId] }));
        const cbBuild = batchResult.builds?.[0];
        if (cbBuild) {
          const cbStatus = cbBuild.buildStatus || "";
          if (cbStatus === "SUCCEEDED") {
            await appendLog(deploymentId, `[${ts()}] ✓ CodeBuild succeeded — image pushed to ECR`);
            const ecrUri = `${accountId}.dkr.ecr.${region}.amazonaws.com`;
            return `${ecrUri}/${imageRepoName}:latest`;
          } else if (["FAILED", "FAULT", "TIMED_OUT", "STOPPED"].includes(cbStatus)) {
            const reason = cbBuild.phases?.find(p => p.phaseStatus === "FAILED")?.contexts?.[0]?.message || cbStatus;
            throw new Error(`CodeBuild failed: ${reason}`);
          } else if (attempt % 4 === 0) {
            await appendLog(deploymentId, `[${ts()}] ℹ CodeBuild: ${cbBuild.currentPhase || "QUEUED"}...`);
          }
        }
      } catch (e: any) {
        if (e.message?.startsWith("CodeBuild failed")) throw e;
        /* transient error, retry */
      }
    } else if (attempt % 4 === 0) {
      await appendLog(deploymentId, `[${ts()}] ℹ Waiting for CodeBuild to start...`);
    }
  }

  throw new Error("CodeBuild did not complete within timeout (15 minutes)");
}
