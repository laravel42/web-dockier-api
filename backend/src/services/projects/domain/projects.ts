import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, normalizePagination, paginatedRows } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import type { Database } from "../../../shared/supabase/types.js";
import type { Json } from "../../../shared/supabase/types.js";
import { escapePostgrestLike } from "../../../shared/http/security.js";
import { rowToProject } from "./mappers.js";
import { saveWpConfig, generateWpConfig } from "./wp-config.js";

export const ProjectsError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal" | "service_unavailable">("ProjectsError");
export type ProjectsError = InstanceType<typeof ProjectsError>;

/** A commit candidate sourced from a deployment or scan row. */
interface CommitCandidate {
  commit: string;
  /** Epoch millis of the source row's `updated_at`; 0 when missing/unparseable. */
  ts: number;
}

/** Parse a nullable ISO timestamp into epoch millis, defaulting to 0. */
function commitTs(when: string | null | undefined): number {
  return when ? Date.parse(when) || 0 : 0;
}

/**
 * Pick the newer of two commit candidates, ignoring blank commits.
 *
 * Ties are broken toward the deploy candidate (the first argument), matching
 * the historical behavior of both the single- and batch-project lookups.
 * Returns "" when neither candidate has a commit.
 */
function pickNewerCommit(deploy: CommitCandidate, scan: CommitCandidate): string {
  if (!deploy.commit && !scan.commit) return "";
  if (!scan.commit) return deploy.commit;
  if (!deploy.commit) return scan.commit;
  return scan.ts > deploy.ts ? scan.commit : deploy.commit;
}

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

  // Reduce each table to its newest commit per project (rows arrive ordered by
  // updated_at desc, so the first non-blank hit per project is the newest).
  const bestDeploy = new Map<string, CommitCandidate>();
  const bestScan = new Map<string, CommitCandidate>();
  const collect = (
    into: Map<string, CommitCandidate>,
    pid: string | null,
    commit: string | null,
    when: string | null,
  ) => {
    if (!pid || !commit) return;
    const ts = commitTs(when);
    const existing = into.get(pid);
    if (!existing || ts > existing.ts) into.set(pid, { commit, ts });
  };
  for (const row of deployRes.data ?? []) collect(bestDeploy, row.project_id, row.commit_hash, row.updated_at);
  for (const row of scanRes.data ?? []) collect(bestScan, row.project_id, row.commit_sha, row.updated_at);

  const out: Record<string, string> = {};
  for (const pid of new Set([...bestDeploy.keys(), ...bestScan.keys()])) {
    out[pid] = pickNewerCommit(
      bestDeploy.get(pid) ?? { commit: "", ts: 0 },
      bestScan.get(pid) ?? { commit: "", ts: 0 },
    );
  }
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

  return pickNewerCommit(
    { commit: deployRes.data?.commit_hash ?? "", ts: commitTs(deployRes.data?.updated_at) },
    { commit: scanRes.data?.commit_sha ?? "", ts: commitTs(scanRes.data?.updated_at) },
  );
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

  const { rows, count } = await paginatedRows(query, { limit, offset }, ProjectsError, {
    internalMsg: "Failed to list projects",
  });
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
  // Verify the project exists and belongs to the tenant before we do any
  // (potentially slow) infrastructure teardown.
  const { data: existing, error: findError } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .maybeSingle();
  throwOnError(findError, ProjectsError, { internalMsg: "Failed to delete project" });
  if (!existing) {
    throw new ProjectsError("Project not found", "not_found");
  }

  // Best-effort: release provisioned infrastructure (VPS + Dokploy resources)
  // before removing the project row, so we don't orphan billable cloud VMs.
  // Never block deletion on teardown failure — surface it in logs instead.
  await teardownProjectInfraSafely(projectId, tenantId);

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

/**
 * Tear down a project's provisioned infrastructure without ever throwing.
 *
 * Uses a dynamic import to avoid a static dependency cycle between the projects
 * and deploy services. Teardown failures are logged but do not block project
 * deletion — a stuck/unreachable provider must not make projects undeletable.
 */
async function teardownProjectInfraSafely(projectId: string, tenantId: string): Promise<void> {
  try {
    const { teardownProjectInfrastructure } = await import(
      "../../deploy/domain/lifecycle/project-teardown.js"
    );
    const result = await teardownProjectInfrastructure(projectId, tenantId);
    if (result.status === "partial") {
      const { logger } = await import("../../../shared/logger.js");
      logger.warn({ projectId, result }, "[projects] Infrastructure teardown incomplete on project delete");
    }
  } catch (err) {
    const { logger } = await import("../../../shared/logger.js");
    logger.error({ err, projectId }, "[projects] Infrastructure teardown failed on project delete");
  }
}
