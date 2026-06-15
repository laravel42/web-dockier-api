import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { DomainError } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type { Database } from "../../../shared/supabase/types.js";
import type { Json } from "../../../shared/supabase/types.js";
import { rowToProject } from "./mappers.js";

export type ProjectsErrorCode = "not_found" | "forbidden" | "bad_request" | "internal";

export class ProjectsError extends DomainError {
  constructor(
    message: string,
    public readonly code: ProjectsErrorCode,
    cause?: unknown,
  ) {
    super(message, code, cause);
    this.name = "ProjectsError";
  }
}

export interface CreateProjectParams {
  tenantId: string;
  name: string;
  repository: string;
  branch: string;
  connectionId?: string;
  platform?: string;
  sourceType?: string;
  template?: string;
  config?: Record<string, unknown>;
}

export async function createProject(params: CreateProjectParams) {
  const { tenantId, name, repository, branch } = params;
  if (!name.trim()) throw new ProjectsError("Project name is required", "bad_request");

  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = {
    id,
    organization_id: tenantId,
    name,
    repository,
    branch,
    connection_id: params.connectionId ?? "",
    platform: params.platform ?? "",
    source_type: params.sourceType ?? "repository",
    template: params.template ?? "",
    config: (params.config ?? {}) as unknown as Json,
    created_at: now,
  };
  const { error } = await supabaseAdmin.from("projects").insert(payload);
  throwOnError(error, ProjectsError, {
    internalMsg: "Failed to create project",
    duplicateMsg: "A project with this name already exists",
  });
  return rowToProject(payload);
}

export async function getProject(projectId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id,name,repository,branch,connection_id,platform,source_type,template,config,created_at")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();
  const project = unwrapQuery(data, error, ProjectsError, {
    notFoundMsg: "Project not found",
    internalMsg: "Failed to fetch project",
  });
  return rowToProject(project);
}

export async function listProjects(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id,name,repository,branch,connection_id,platform,source_type,template,config,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  const rows = unwrapList(data, error, ProjectsError, { internalMsg: "Failed to list projects" });
  return rows.map(rowToProject);
}

export interface UpdateProjectParams {
  projectId: string;
  tenantId: string;
  name?: string;
  repository?: string;
  branch?: string;
  connectionId?: string;
  platform?: string;
  sourceType?: string;
  template?: string;
  config?: Record<string, unknown>;
}

export async function updateProject(params: UpdateProjectParams) {
  const { projectId, tenantId } = params;

  // Verify project exists and belongs to tenant
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("projects")
    .select("organization_id,config")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();
  const verified = unwrapQuery(existing, existingError, ProjectsError, {
    notFoundMsg: "Project not found",
    internalMsg: "Failed to fetch project",
  });

  const updates: Database["public"]["Tables"]["projects"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (params.name !== undefined) updates.name = params.name;
  if (params.repository !== undefined) updates.repository = params.repository;
  if (params.branch !== undefined) updates.branch = params.branch;
  if (params.connectionId !== undefined) updates.connection_id = params.connectionId;
  if (params.platform !== undefined) updates.platform = params.platform;
  if (params.sourceType !== undefined) updates.source_type = params.sourceType;
  if (params.template !== undefined) updates.template = params.template;
  if (params.config !== undefined) {
    updates.config = { ...(typeof verified.config === "object" ? (verified.config as object) : {}), ...params.config } as unknown as Json;
  }

  const { data, error } = await supabaseAdmin
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .select("id,name,repository,branch,connection_id,platform,source_type,template,config,created_at")
    .single();
  const updated = unwrapQuery(data, error, ProjectsError, {
    notFoundMsg: "Project not found",
    internalMsg: "Failed to update project",
    duplicateMsg: "A project with this name already exists",
  });
  return rowToProject(updated);
}

export async function deleteProject(projectId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .select("id");
  throwOnError(error, ProjectsError, { internalMsg: "Failed to delete project" });
  if (!data || data.length === 0) {
    throw new ProjectsError("Project not found", "not_found");
  }
}
