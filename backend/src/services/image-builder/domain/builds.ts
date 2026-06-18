import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { DomainError } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList, assertOwnership } from "../../../shared/supabase/query.js";
import { composeSubmittedReason, normalizeBuildInput } from "./orchestrator.js";
import { createBuildspecPreview } from "./buildspec.js";
import { enqueueBuild } from "./worker.js";
import { escapePostgrestFilter } from "../../../shared/security.js";
import { rowToBuild } from "./mappers.js";
import { resolveAwsCredentials } from "../../../lib/provider-credentials.js";
import { lookupCodeBuildId, refreshBuildStatus } from "./aws-runtime.js";
import { checkDeployStatus, deriveAppName, deriveStackName, type DeployStatusResult } from "./cfn-deploy.js";

export type ImageBuilderErrorCode = "not_found" | "forbidden" | "bad_request" | "internal" | "precondition_failed";

export class ImageBuilderError extends DomainError {
  constructor(
    message: string,
    public readonly code: ImageBuilderErrorCode,
    cause?: unknown,
  ) {
    super(message, code, cause);
    this.name = "ImageBuilderError";
  }
}

export interface CreateBuildParams {
  tenantId: string;
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
  providerId?: string;
  deployParams?: Record<string, any>;
}

export async function createBuild(params: CreateBuildParams) {
  const { tenantId } = params;
  const id = randomUUID();
  const now = new Date().toISOString();
  const normalized = normalizeBuildInput(params);
  const payload = {
    id,
    organization_id: tenantId,
    project_id: params.projectId ?? "",
    source_repo: params.sourceRepo,
    source_ref: normalized.sourceRef,
    commit_sha: params.commitSha ?? "",
    dockerfile_path: normalized.dockerfilePath,
    build_context: normalized.buildContext,
    image_repo: normalized.imageRepo,
    image_uri: "",
    cache_repo_uri: "",
    status: "pending",
    status_reason: composeSubmittedReason(normalized.inferredRuntime),
    logs_url: "",
    tags: JSON.stringify(normalized.tags),
    build_metadata: JSON.stringify({
      ...normalized.metadata,
      deployParams: JSON.stringify(params.deployParams ?? {}),
      buildspecPreview: createBuildspecPreview({
        runtime: normalized.inferredRuntime,
        sourceRef: normalized.sourceRef,
        dockerfilePath: normalized.dockerfilePath,
        buildContext: normalized.buildContext,
        imageRepo: normalized.imageRepo,
        tags: normalized.tags,
      }),
    }),
    provider_id: params.providerId ?? "",
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabaseAdmin.from("builds").insert(payload);
  throwOnError(error, ImageBuilderError, { internalMsg: "Failed to create build" });

  try {
    await enqueueBuild({
      buildId: id,
      sourceRepo: params.sourceRepo,
      sourceRef: normalized.sourceRef,
      commitSha: params.commitSha ?? "",
      imageRepo: normalized.imageRepo,
      dockerfilePath: normalized.dockerfilePath,
      buildContext: normalized.buildContext,
      tags: normalized.tags,
      providerId: params.providerId ?? "",
      gitConnectionId: params.gitConnectionId ?? "",
      deployTarget: params.deployTarget ?? "",
      deployParams: params.deployParams ?? {},
    });
  } catch (enqueueError: unknown) {
    const message = enqueueError instanceof Error ? enqueueError.message : String(enqueueError);
    await supabaseAdmin.from("builds").update({
      status: "failed",
      status_reason: `Failed to enqueue build job: ${message}`,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    throw new ImageBuilderError(`Failed to start build pipeline: ${message}`, "internal");
  }

  return rowToBuild(payload);
}

export async function getBuild(buildId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("builds").select("*").eq("id", buildId).single();
  const build = unwrapQuery(data, error, ImageBuilderError, {
    notFoundMsg: "Build not found",
    internalMsg: "Failed to fetch build",
  });
  assertOwnership(build, tenantId, ImageBuilderError, "Not your build");
  return build;
}

export interface ListBuildsParams {
  tenantId: string;
  sourceRepo?: string;
  status?: string;
  limit?: number;
}

export async function listBuilds(params: ListBuildsParams) {
  const { tenantId, sourceRepo, status } = params;
  const limit = params.limit ?? 50;
  let query = supabaseAdmin
    .from("builds")
    .select("*")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sourceRepo) query = query.eq("source_repo", sourceRepo);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  const rows = unwrapList(data, error, ImageBuilderError, { internalMsg: "Failed to list builds" });
  return rows.map(rowToBuild);
}

export async function cancelBuild(buildId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("builds").select("*").eq("id", buildId).single();
  const build = unwrapQuery(data, error, ImageBuilderError, {
    notFoundMsg: "Build not found",
    internalMsg: "Failed to fetch build",
  });
  assertOwnership(build, tenantId, ImageBuilderError, "Not your build");
  if (!["submitted", "in_progress", "pending"].includes(build.status)) {
    throw new ImageBuilderError(`Cannot cancel build in status: ${build.status}`, "precondition_failed");
  }
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("builds")
    .update({
      status: "stopped",
      status_reason: "Cancelled by user",
      updated_at: new Date().toISOString(),
    })
    .eq("id", buildId)
    .select("*")
    .single();
  const cancelled = unwrapQuery(updated, updateError, ImageBuilderError, {
    notFoundMsg: "Build not found or could not be updated",
    internalMsg: "Failed to cancel build",
  });
  return rowToBuild(cancelled);
}

export async function resolveImageByRevision(revision: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("builds")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("status", "succeeded")
    .neq("image_uri", "")
    .or(`commit_sha.ilike.${escapePostgrestFilter(revision)}%,source_ref.eq.${escapePostgrestFilter(revision)}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwOnError(error, ImageBuilderError, { internalMsg: "Failed to resolve image by revision" });
  if (!data) throw new ImageBuilderError(`No successful build found for revision: ${revision}`, "not_found");
  const build = rowToBuild(data);
  return {
    imageUri: build.imageUri,
    buildId: build.id,
    commitSha: build.commitSha,
    status: build.status,
    createdAt: build.createdAt,
  };
}

// ─── Build Status with CodeBuild Backfill ──────────────────────────────────

/**
 * Fetches a build and ensures its CodeBuild ID and status are up-to-date.
 *
 * If the build lacks a codebuild_id but has a provider, attempts to look it up
 * from CodeBuild. If the build is still in a pending/running state, refreshes
 * the status from the CodeBuild API.
 *
 * Returns the mapped build object ready for API response.
 */
export async function getBuildWithStatus(buildId: string, tenantId: string) {
  let row = await getBuild(buildId, tenantId);

  if (!row.codebuild_id && row.provider_id) {
    const credentials = await resolveAwsCredentials(row.provider_id);
    if (credentials) {
      const codebuildId = await lookupCodeBuildId(credentials, buildId);
      if (codebuildId) {
        await supabaseAdmin.from("builds").update({
          codebuild_id: codebuildId,
          updated_at: new Date().toISOString(),
        }).eq("id", buildId);
        row = { ...row, codebuild_id: codebuildId };
      }
    }
  }

  if (row.codebuild_id && ["submitted", "in_progress", "pending"].includes(row.status)) {
    row = await refreshBuildStatus(row);
  }

  return rowToBuild(row);
}

// ─── Build Row for Logs ────────────────────────────────────────────────────

/** Minimal row shape needed for log fetching. */
export interface BuildLogRow {
  id: string;
  provider_id: string;
  codebuild_id: string;
  status: string;
  status_reason: string;
  updated_at: string;
}

/**
 * Fetches a build row with the fields needed for log retrieval, performing
 * ownership validation and CodeBuild ID backfill if necessary.
 */
export async function getBuildForLogs(buildId: string, tenantId: string): Promise<BuildLogRow> {
  const { data, error } = await supabaseAdmin
    .from("builds")
    .select("id,organization_id,provider_id,codebuild_id,status,status_reason,updated_at")
    .eq("id", buildId)
    .single();

  if (error || !data) throw new ImageBuilderError("Build not found", "not_found");
  assertOwnership(data, tenantId, ImageBuilderError, "Not your build");

  let row = data;

  if (!row.codebuild_id && row.provider_id) {
    const credentials = await resolveAwsCredentials(row.provider_id);
    if (credentials) {
      const codebuildId = await lookupCodeBuildId(credentials, buildId);
      if (codebuildId) {
        await supabaseAdmin.from("builds").update({
          codebuild_id: codebuildId,
          updated_at: new Date().toISOString(),
        }).eq("id", buildId);
        row = { ...row, codebuild_id: codebuildId };
      }
    }
  }

  return row;
}

// ─── Deploy Status ─────────────────────────────────────────────────────────

export interface DeployStatusLogger {
  debug(msg: string): void;
}

/**
 * Resolves the deploy status for a build, coordinating metadata checks,
 * credential resolution, and CloudFormation stack polling.
 *
 * Returns the deploy status result ready for API response.
 */
export async function getDeployStatus(
  buildId: string,
  tenantId: string,
  logger: DeployStatusLogger,
): Promise<DeployStatusResult> {
  const { data, error } = await supabaseAdmin.from("builds").select("*").eq("id", buildId).single();
  if (error || !data) throw new ImageBuilderError("Build not found", "not_found");
  assertOwnership(data, tenantId, ImageBuilderError, "Not your build");

  const build = rowToBuild(data);

  // If we already have the appUrl cached, return immediately
  if (build.buildMetadata.appUrl) {
    return {
      status: "success",
      appUrl: build.buildMetadata.appUrl,
      stackName: build.buildMetadata.stackName ?? "",
    };
  }
  if (build.status === "failed") return { status: "failed", appUrl: "", stackName: "" };

  const appName = deriveAppName(build.sourceRepo);
  const stackName = deriveStackName(appName);

  // Without credentials we can only report based on DB status
  const credentials = await resolveAwsCredentials(data.provider_id || "");
  if (!credentials) {
    if (build.status === "succeeded") return { status: "success", appUrl: "", stackName };
    return { status: "deploying", appUrl: "", stackName };
  }

  // Delegate CloudFormation polling and fallback creation to the orchestrator
  try {
    return await checkDeployStatus({
      buildId,
      buildRow: {
        id: data.id,
        source_repo: data.source_repo,
        commit_sha: data.commit_sha,
        image_uri: data.image_uri,
        status: data.status,
        build_metadata: data.build_metadata,
        provider_id: data.provider_id,
        finished_at: data.finished_at,
      },
      build: {
        id: build.id,
        sourceRepo: build.sourceRepo,
        commitSha: build.commitSha,
        status: build.status,
        buildMetadata: build.buildMetadata,
        imageUri: build.imageUri,
      },
      credentials,
      logger,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`deploy-status error: ${message}`);
    if (build.status === "succeeded") return { status: "success", appUrl: "", stackName };
    return { status: "deploying", appUrl: "", stackName };
  }
}
