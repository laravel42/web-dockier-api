// ─── Shared utilities, types, secrets, and helpers for image-builder ───

import { api, APIError } from "encore.dev/api";
import { db, initDb } from "../lib/db";
import { secret } from "encore.dev/config";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { git_integration } from "~encore/clients";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read buildspec.yml at module load time — at runtime __dirname points to
// the Encore build output, so we resolve relative to the source tree instead.
let _buildspecContent: string | null = null;
export function getBuildspecContent(): string {
  if (_buildspecContent) return _buildspecContent;
  const candidates = [
    join(__dirname, "buildspec.yml"),
    join(__dirname, "..", "image-builder", "buildspec.yml"),
    join(process.cwd(), "image-builder", "buildspec.yml"),
  ];
  for (const p of candidates) {
    try {
      _buildspecContent = readFileSync(p, "utf-8");
      console.log(`Loaded buildspec.yml from: ${p}`);
      return _buildspecContent;
    } catch { /* try next */ }
  }
  throw new Error(`buildspec.yml not found in any of: ${candidates.join(", ")}`);
}

// ─── Secrets ───

export const AwsAccessKeyId = secret("ImageBuilderAwsAccessKeyId");
export const AwsSecretAccessKey = secret("ImageBuilderAwsSecretAccessKey");
export const AwsRegion = secret("ImageBuilderAwsRegion");
export const CodeBuildProjectName = secret("ImageBuilderCodeBuildProject");
export const CallbackUrlSecret = secret("ImageBuilderCallbackUrl");

export function getAwsRegion(): string {
  try { return AwsRegion() || "us-east-1"; } catch { return "us-east-1"; }
}
export function getCodeBuildProject(): string {
  try { return CodeBuildProjectName() || "image-builder"; } catch { return "image-builder"; }
}
export function getCallbackUrl(): string {
  try { return CallbackUrlSecret() || ""; } catch { return ""; }
}

// ─── Database ───

const DatabaseUrl = secret("DatabaseUrl");
initDb(DatabaseUrl());

export { db };

// ─── Interfaces ───

export interface StartBuildParams {
  sourceRepo: string;
  sourceRef?: string;
  commitSha?: string;
  imageRepo?: string;
  dockerfilePath?: string;
  buildContext?: string;
  tags?: string[];
  projectId?: string;
  gitConnectionId?: string;
  deployTarget?: "ecs" | "apprunner" | "ec2";
  deployParams?: {
    appName?: string;
    containerPort?: number;
    cpu?: string;
    memory?: string;
    desiredCount?: number;
    maxCount?: number;
    minInstances?: number;
    maxInstances?: number;
    instanceType?: string;
    vpcId?: string;
    subnetIds?: string[];
    envVars?: Array<{ name: string; value: string }>;
  };
}

export interface BuildRecord {
  id: string;
  codebuildId: string;
  projectId: string;
  sourceRepo: string;
  sourceRef: string;
  commitSha: string;
  dockerfilePath: string;
  buildContext: string;
  imageRepo: string;
  imageUri: string;
  cacheRepoUri: string;
  status: "pending" | "submitted" | "in_progress" | "succeeded" | "failed" | "stopped";
  statusReason: string;
  logsUrl: string;
  tags: string[];
  buildMetadata: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildStatusResponse {
  id: string;
  codebuildId: string;
  sourceRepo: string;
  sourceRef: string;
  commitSha: string;
  imageUri: string;
  status: string;
  statusReason: string;
  logsUrl: string;
  tags: string[];
  buildMetadata: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
}

export interface ImageForRevisionResponse {
  imageUri: string;
  buildId: string;
  commitSha: string;
  status: string;
  createdAt: string;
}

export interface BuildLogsResponse {
  buildId: string;
  logs: string[];
  nextToken?: string;
}

export interface WebhookPayload {
  buildId: string;
  stackName?: string;
  status: "deploying" | "success" | "failed";
  appUrl?: string;
  cfnStatus?: string;
  deployTarget?: string;
  codebuildId?: string;
}

// ─── Helpers ───

export function deriveImageRepo(sourceRepo: string): string {
  const parts = sourceRepo.split("/");
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

export async function getAwsAccountId(accessKeyId: string, secretAccessKey: string, region: string): Promise<string> {
  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  const sts = new STSClient({ region, credentials: { accessKeyId, secretAccessKey } });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  return identity.Account || "";
}

export function rowToBuild(row: any): BuildRecord {
  return {
    id: row.id, codebuildId: row.codebuild_id,
    projectId: row.project_id, sourceRepo: row.source_repo, sourceRef: row.source_ref,
    commitSha: row.commit_sha, dockerfilePath: row.dockerfile_path,
    buildContext: row.build_context, imageRepo: row.image_repo, imageUri: row.image_uri,
    cacheRepoUri: row.cache_repo_uri, status: row.status, statusReason: row.status_reason,
    logsUrl: row.logs_url, tags: safeJsonParse(row.tags, []),
    buildMetadata: safeJsonParse(row.build_metadata, {}),
    startedAt: row.started_at ? row.started_at.toISOString() : "",
    finishedAt: row.finished_at ? row.finished_at.toISOString() : "",
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

export function safeJsonParse<T>(val: string, fallback: T): T {
  try { return JSON.parse(val); } catch { return fallback; }
}

export async function refreshBuildStatus(build: BuildRecord): Promise<BuildRecord> {
  const { CodeBuildClient, BatchGetBuildsCommand } = await import("@aws-sdk/client-codebuild");
  const cb = new CodeBuildClient({ region: getAwsRegion(), credentials: { accessKeyId: AwsAccessKeyId(), secretAccessKey: AwsSecretAccessKey() } });
  const result = await cb.send(new BatchGetBuildsCommand({ ids: [build.codebuildId] }));
  const cbBuild = result.builds?.[0];
  if (!cbBuild) return build;

  const statusMap: Record<string, BuildRecord["status"]> = {
    SUCCEEDED: "succeeded", FAILED: "failed", FAULT: "failed",
    TIMED_OUT: "failed", STOPPED: "stopped", IN_PROGRESS: "in_progress",
  };
  const newStatus = statusMap[cbBuild.buildStatus || ""] || build.status;
  const statusReason = cbBuild.phases?.find(p => p.phaseStatus === "FAILED")?.contexts?.[0]?.message || "";

  let imageUri = build.imageUri;
  if (newStatus === "succeeded" && !imageUri) {
    const imageVar = (cbBuild.exportedEnvironmentVariables || []).find(v => v.name === "IMAGE_URI");
    if (imageVar?.value) {
      imageUri = imageVar.value;
    } else {
      try {
        const accountId = await getAwsAccountId(AwsAccessKeyId(), AwsSecretAccessKey(), getAwsRegion());
        imageUri = `${accountId}.dkr.ecr.${getAwsRegion()}.amazonaws.com/${build.imageRepo}:latest`;
      } catch { /* best effort */ }
    }
  }

  const startedAt = cbBuild.startTime?.toISOString() || build.startedAt;
  const finishedAt = cbBuild.endTime?.toISOString() || build.finishedAt;

  await db.exec`UPDATE builds SET status = ${newStatus}, status_reason = ${statusReason}, image_uri = ${imageUri},
    started_at = ${startedAt ? new Date(startedAt) : null}, finished_at = ${finishedAt ? new Date(finishedAt) : null}, updated_at = NOW()
    WHERE id = ${build.id}`;

  return { ...build, status: newStatus, statusReason, imageUri, startedAt, finishedAt };
}

export function buildToStatusResponse(build: BuildRecord): BuildStatusResponse {
  return {
    id: build.id, codebuildId: build.codebuildId, sourceRepo: build.sourceRepo,
    sourceRef: build.sourceRef, commitSha: build.commitSha, imageUri: build.imageUri,
    status: build.status, statusReason: build.statusReason, logsUrl: build.logsUrl,
    tags: build.tags, buildMetadata: build.buildMetadata,
    startedAt: build.startedAt, finishedAt: build.finishedAt, createdAt: build.createdAt,
  };
}

// Re-export commonly needed imports for endpoint files
export { api, APIError } from "encore.dev/api";
export { v4 as uuidv4 } from "uuid";
export { getAuthData } from "~encore/auth";
export { readFileSync } from "node:fs";
export { git_integration } from "~encore/clients";
