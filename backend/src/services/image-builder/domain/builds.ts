import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { composeSubmittedReason, normalizeBuildInput } from "./orchestrator.js";
import { createBuildspecPreview } from "./buildspec.js";
import { enqueueBuild } from "./worker.js";
import { escapePostgrestFilter } from "../../../shared/security.js";
import { rowToBuild } from "./mappers.js";

export type ImageBuilderErrorCode = "not_found" | "forbidden" | "bad_request" | "internal" | "precondition_failed";

export class ImageBuilderError extends Error {
  constructor(
    message: string,
    public readonly code: ImageBuilderErrorCode,
  ) {
    super(message);
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
  if (!tenantId) {
    throw new ImageBuilderError("Tenant ID is required", "bad_request");
  }
  const id = uuidv4();
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
  if (error) throw new ImageBuilderError(error.message, "bad_request");

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
  } catch (enqueueError: any) {
    await supabaseAdmin.from("builds").update({
      status: "failed",
      status_reason: `Failed to enqueue build job: ${enqueueError.message}`,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    throw new ImageBuilderError(`Failed to start build pipeline: ${enqueueError.message}`, "internal");
  }

  return rowToBuild(payload);
}

export async function getBuild(buildId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("builds").select("*").eq("id", buildId).single();
  if (error) {
    if (error.code === "PGRST116") throw new ImageBuilderError("Build not found", "not_found");
    throw new ImageBuilderError(error.message, "internal");
  }
  if (!data) throw new ImageBuilderError("Build not found", "not_found");
  if (data.organization_id !== tenantId) throw new ImageBuilderError("Not your build", "forbidden");
  return data;
}

export interface ListBuildsParams {
  tenantId: string;
  sourceRepo?: string;
  status?: string;
  limit?: number;
}

export async function listBuilds(params: ListBuildsParams) {
  const { tenantId, sourceRepo, status } = params;
  if (!tenantId) {
    throw new ImageBuilderError("Tenant ID is required", "bad_request");
  }
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
  if (error) throw new ImageBuilderError(error.message, "internal");
  return (data ?? []).map(rowToBuild);
}

export async function cancelBuild(buildId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("builds").select("*").eq("id", buildId).single();
  if (error) {
    if (error.code === "PGRST116") throw new ImageBuilderError("Build not found", "not_found");
    throw new ImageBuilderError(error.message, "internal");
  }
  if (!data) throw new ImageBuilderError("Build not found", "not_found");
  if (data.organization_id !== tenantId) throw new ImageBuilderError("Not your build", "forbidden");
  if (!["submitted", "in_progress", "pending"].includes(data.status)) {
    throw new ImageBuilderError(`Cannot cancel build in status: ${data.status}`, "precondition_failed");
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
  if (updateError) throw new ImageBuilderError(updateError.message, "bad_request");
  if (!updated) throw new ImageBuilderError("Build not found or could not be updated", "not_found");
  return rowToBuild(updated);
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
  if (error) throw new ImageBuilderError(error.message, "internal");
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
