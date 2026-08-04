import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList, normalizePagination } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import type { Database } from "../../../shared/supabase/types.js";
import type { Json } from "../../../shared/supabase/types.js";
import { escapePostgrestLike } from "../../../shared/http/security.js";
import { rowToProject } from "./mappers.js";
import { saveWpConfig, generateWpConfig } from "./wp-config.js";

export const ProjectsError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal" | "service_unavailable">("ProjectsError");
export type ProjectsError = InstanceType<typeof ProjectsError>;

/**
 * Resolves the most recent known commit per project for a tenant, derived from
 * the latest deployment (`commit_hash`) or security scan (`commit_sha`). Used to
 * surface a `lastCommitHash` on the project entity so list/detail pages can show
 * a branch · commit label even when the project itself stores no commit.
 */
async function latestCommitByProject(tenantId: string, projectIds?: string[]): Promise<Record<string, string>> {
  // Skip if no projects to look up
  if (projectIds && projectIds.length === 0) return {};

  // Cap the result set to avoid unbounded reads. In the worst case we need
  // one row per project from each table — use 2× projectIds length as headroom
  // for duplicates, or a sensible default when no filter is applied.
  const maxRows = projectIds ? projectIds.length * 2 : 200;

  let deployQuery = supabaseAdmin
    .from("deployments")
    .select("project_id,commit_hash,updated_at")
    .eq("organization_id", tenantId)
    .neq("commit_hash", "")
    .order("updated_at", { ascending: false })
    .limit(maxRows);
  let scanQuery = supabaseAdmin
    .from("scans")
    .select("project_id,commit_sha,updated_at")
    .eq("organization_id", tenantId)
    .neq("commit_sha", "")
    .order("updated_at", { ascending: false })
    .limit(maxRows);
  if (projectIds) {
    deployQuery = deployQuery.in("project_id", projectIds);
    scanQuery = scanQuery.in("project_id", projectIds);
  }

  const [deployRes, scanRes] = await Promise.all([deployQuery, scanQuery]);

  const best: Record<string, { commit: string; ts: number }> = {};
  const consider = (pid: string | null, commit: string | null, when: string | null) => {
    if (!pid || !commit) return;
    const ts = when ? Date.parse(when) || 0 : 0;
    const existing = best[pid];
    if (!existing || ts > existing.ts) best[pid] = { commit, ts };
  };
  for (const row of deployRes.data ?? []) consider(row.project_id, row.commit_hash, row.updated_at);
  for (const row of scanRes.data ?? []) consider(row.project_id, row.commit_sha, row.updated_at);

  const out: Record<string, string> = {};
  for (const [pid, value] of Object.entries(best)) out[pid] = value.commit;
  return out;
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
  settings?: Record<string, unknown>;
}

export async function createProject(params: CreateProjectParams) {
  const { tenantId, name, repository, branch } = params;
  if (!name.trim()) throw new ProjectsError("Project name is required", "bad_request");

  const id = randomUUID();
  const now = nowIso();
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
    settings: (params.settings ?? {}) as unknown as Json,
    created_at: now,
  };
  const { error } = await supabaseAdmin.from("projects").insert(payload);
  throwOnError(error, ProjectsError, {
    internalMsg: "Failed to create project",
    duplicateMsg: "A project with this name already exists",
  });

  // Seed default wp-config.php for WordPress template projects
  if (params.sourceType === "template" && params.template === "wordpress") {
    try {
      await saveWpConfig({ tenantId, projectId: id, content: generateWpConfig() });
    } catch {
      // Non-blocking — user can still configure it manually later
    }
  }

  return rowToProject(payload);
}

/**
 * Optimized single-project commit lookup. Uses LIMIT 1 per table
 * instead of the batch function which uses IN clauses.
 */
async function latestCommitForProject(tenantId: string, projectId: string): Promise<string> {
  const [deployRes, scanRes] = await Promise.all([
    supabaseAdmin
      .from("deployments")
      .select("commit_hash,updated_at")
      .eq("organization_id", tenantId)
      .eq("project_id", projectId)
      .neq("commit_hash", "")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("scans")
      .select("commit_sha,updated_at")
      .eq("organization_id", tenantId)
      .eq("project_id", projectId)
      .neq("commit_sha", "")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const deployCommit = deployRes.data?.commit_hash ?? "";
  const deployTs = deployRes.data?.updated_at ? Date.parse(deployRes.data.updated_at) || 0 : 0;
  const scanCommit = scanRes.data?.commit_sha ?? "";
  const scanTs = scanRes.data?.updated_at ? Date.parse(scanRes.data.updated_at) || 0 : 0;

  if (!deployCommit && !scanCommit) return "";
  return scanTs > deployTs ? scanCommit : deployCommit;
}

export async function getProject(projectId: string, tenantId: string) {
  const [projectResult, commit] = await Promise.all([
    supabaseAdmin
      .from("projects")
      .select("id,name,repository,branch,connection_id,platform,source_type,template,config,settings,infra_state,created_at")
      .eq("id", projectId)
      .eq("organization_id", tenantId)
      .single(),
    latestCommitForProject(tenantId, projectId),
  ]);
  const project = unwrapQuery(projectResult.data, projectResult.error, ProjectsError, {
    notFoundMsg: "Project not found",
    internalMsg: "Failed to fetch project",
  });
  return rowToProject(project, commit);
}

export async function listProjects(tenantId: string, params?: { limit?: number; offset?: number; search?: string }) {
  const { limit, offset } = normalizePagination({ limit: params?.limit ?? 50, offset: params?.offset });

  let query = supabaseAdmin
    .from("projects")
    .select("id,name,repository,branch,connection_id,platform,source_type,template,config,settings,infra_state,created_at", { count: "exact" })
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });

  if (params?.search) {
    query = query.ilike("name", `%${escapePostgrestLike(params.search)}%`);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  const rows = unwrapList(data, error, ProjectsError, { internalMsg: "Failed to list projects" });
  const projectIds = rows.map((row) => row.id);
  const commits = await latestCommitByProject(tenantId, projectIds);
  return {
    projects: rows.map((row) => rowToProject(row, commits[row.id] ?? "")),
    total: count ?? 0,
  };
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
  settings?: Record<string, unknown>;
}

export async function updateProject(params: UpdateProjectParams) {
  const { projectId, tenantId } = params;

  // Verify project exists and belongs to tenant
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("projects")
    .select("organization_id,config,settings")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();
  const verified = unwrapQuery(existing, existingError, ProjectsError, {
    notFoundMsg: "Project not found",
    internalMsg: "Failed to fetch project",
  });

  const updates: Database["public"]["Tables"]["projects"]["Update"] = {
    updated_at: nowIso(),
  };
  if (params.name !== undefined) updates.name = params.name;
  if (params.repository !== undefined) updates.repository = params.repository;
  if (params.branch !== undefined) updates.branch = params.branch;
  if (params.connectionId !== undefined) updates.connection_id = params.connectionId;
  if (params.platform !== undefined) updates.platform = params.platform;
  if (params.sourceType !== undefined) updates.source_type = params.sourceType;
  if (params.template !== undefined) updates.template = params.template;
  if (params.config !== undefined) {
    const existingConfig =
      verified.config !== null && typeof verified.config === "object" && !Array.isArray(verified.config)
        ? (verified.config as Record<string, unknown>)
        : {};
    updates.config = { ...existingConfig, ...params.config } as unknown as Json;
  }
  if (params.settings !== undefined) {
    const existingSettings =
      verified.settings !== null && typeof verified.settings === "object" && !Array.isArray(verified.settings)
        ? (verified.settings as Record<string, unknown>)
        : {};
    updates.settings = { ...existingSettings, ...params.settings } as unknown as Json;
  }

  const { data, error } = await supabaseAdmin
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .select("id,name,repository,branch,connection_id,platform,source_type,template,config,settings,infra_state,created_at")
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
