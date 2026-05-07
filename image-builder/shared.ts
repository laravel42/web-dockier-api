// ─── Shared utilities, types, secrets, and helpers for image-builder ───

import { db, initDb } from "../lib/db";
import { secret } from "encore.dev/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAwsCredentials as _resolveAwsCredentials } from "../lib/provider-credentials";
import { getAwsAccountId } from "../lib/aws";

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

// ─── Secrets (optional — read from env vars) ───

export function getAwsAccessKeyId(): string {
  try { return process.env.ImageBuilderAwsAccessKeyId || ""; } catch { return ""; }
}
export function getAwsSecretAccessKey(): string {
  try { return process.env.ImageBuilderAwsSecretAccessKey || ""; } catch { return ""; }
}
export function getAwsRegion(): string {
  try { return process.env.ImageBuilderAwsRegion || "us-east-1"; } catch { return "us-east-1"; }
}
export function getCodeBuildProject(): string {
  try { return process.env.ImageBuilderCodeBuildProject || "image-builder"; } catch { return "image-builder"; }
}
export function getCallbackUrl(): string {
  try { return process.env.ImageBuilderCallbackUrl || ""; } catch { return ""; }
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
  deployTarget?: "ecs" | "ec2" | "s3";
  /** Provider ID to look up AWS credentials from the deploy service */
  providerId?: string;
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
    /** Self-hosted services to install on the EC2 instance (e.g. database, cache, queue) */
    selfHostedServices?: string[];
    /** Tech stack identifiers for service-specific setup (e.g. "laravel") */
    techStack?: string[];
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
  /** Provider ID for looking up AWS credentials from the deploy service */
  providerId: string;
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

/** Resolve AWS credentials: look up from deploy service by providerId, fall back to env vars */
export async function resolveAwsCredentials(providerId: string): Promise<{ accessKeyId: string; secretAccessKey: string; region: string }> {
  return _resolveAwsCredentials({
    providerId,
    fallback: {
      accessKeyId: getAwsAccessKeyId(),
      secretAccessKey: getAwsSecretAccessKey(),
      region: getAwsRegion(),
    },
    fetchCredentials: async (id: string) => {
      const { deploy } = await import("~encore/clients");
      const creds = await deploy.getProviderCredentials({ providerId: id });
      return { apiKey: creds.apiKey, apiSecret: creds.apiSecret, region: creds.region };
    },
  });
}

export function deriveImageRepo(sourceRepo: string): string {
  const parts = sourceRepo.split("/");
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9-]/g, "-");
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
    providerId: row.provider_id || "",
  };
}

export function safeJsonParse<T>(val: string, fallback: T): T {
  try { return JSON.parse(val); } catch { return fallback; }
}

export async function refreshBuildStatus(build: BuildRecord): Promise<BuildRecord> {
  const { accessKeyId, secretAccessKey, region } = await resolveAwsCredentials(build.providerId);

  if (!accessKeyId || !secretAccessKey) return build;

  const { CodeBuildClient, BatchGetBuildsCommand } = await import("@aws-sdk/client-codebuild");
  const cb = new CodeBuildClient({ region, credentials: { accessKeyId, secretAccessKey } });
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
        const accountId = await getAwsAccountId(region, { accessKeyId, secretAccessKey });
        imageUri = `${accountId}.dkr.ecr.${region}.amazonaws.com/${build.imageRepo}:latest`;
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
