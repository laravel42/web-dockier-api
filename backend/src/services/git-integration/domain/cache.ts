/**
 * Git Integration — Cache Utilities
 *
 * Centralizes all cache read/write/invalidation logic for the git-integration
 * service. Cache writes are best-effort: failures are logged but never fail
 * the caller's request.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Database, Json } from "../../../shared/supabase/types.js";

/** Minimal logger interface compatible with both pino and Fastify's logger. */
export interface CacheLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

// ─── JSON Field Parsing ────────────────────────────────────────────

/**
 * Parse a Supabase JSON/JSONB field that may come back as a string
 * (older client versions, RPC calls) or an already-parsed object.
 *
 * Returns the parsed value or `null` if the input is nullish.
 */
export function parseJsonField<T = unknown>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

// ─── Cache Write Infrastructure ────────────────────────────────────

/**
 * Run a best-effort cache write. Logs (but does not throw on) both the
 * returned Supabase error and any thrown rejection (network/connection
 * failure), so a cache hiccup never fails an otherwise-successful request.
 */
export async function runCacheWrite(
  table: string,
  run: () => PromiseLike<{ error: unknown }>,
  logger: CacheLogger,
): Promise<void> {
  try {
    const { error } = await run();
    if (error) {
      logger.warn({ err: error, table }, `git-integration: failed to write cache table "${table}"`);
    }
  } catch (err) {
    logger.warn({ err, table }, `git-integration: failed to write cache table "${table}"`);
  }
}

// ─── Cache Invalidation ────────────────────────────────────────────

/**
 * Delete cached rows for a tenant, optionally scoped to a repo and/or branch.
 * Backs the cache-invalidation endpoints (stats/stack/analysis).
 */
export async function invalidateCache(
  table: "stats_cache" | "stack_cache" | "analysis_cache",
  tenantId: string,
  filters: { repo?: string; branch?: string },
  logger: CacheLogger,
): Promise<void> {
  const db = supabaseAdmin;
  await runCacheWrite(table, () => {
    let del = db.from(table).delete().eq("organization_id", tenantId);
    if (filters.repo) del = del.eq("repo", filters.repo);
    if (filters.branch) del = del.eq("branch", filters.branch);
    return del;
  }, logger);
}

// ─── Cache Writes ──────────────────────────────────────────────────

export interface RepoCacheParams {
  tenantId: string;
  repoKey: string;
  branch: string;
  projectId?: string;
  result: Json;
}

/**
 * Upsert a repo-scoped cache row (stats/stack) keyed by tenant + repo + branch.
 */
export async function writeRepoCache(
  table: "stats_cache" | "stack_cache",
  params: RepoCacheParams,
  logger: CacheLogger,
): Promise<void> {
  const db = supabaseAdmin;
  await runCacheWrite(table, () =>
    db.from(table).upsert(
      {
        id: `${params.tenantId}:${params.repoKey}:${params.branch}`,
        repo: params.repoKey,
        branch: params.branch,
        result: params.result,
        created_at: new Date().toISOString(),
        organization_id: params.tenantId,
        project_id: params.projectId ?? "",
      },
      { onConflict: "organization_id,repo,branch" },
    ),
  logger);
}

export interface AnalysisCacheParams {
  tenantId: string;
  repoKey: string;
  branch: string;
  projectId?: string;
  result: Json;
}

/**
 * Upsert an analysis cache row keyed by tenant + repo + branch.
 */
export async function writeAnalysisCache(
  params: AnalysisCacheParams,
  logger: CacheLogger,
): Promise<void> {
  const db = supabaseAdmin;
  await runCacheWrite("analysis_cache", () =>
    db.from("analysis_cache").upsert(
      {
        id: `${params.tenantId}:${params.repoKey}:${params.branch}`,
        repo: params.repoKey,
        branch: params.branch,
        commit_sha: "",
        result: params.result as unknown as Database["public"]["Tables"]["analysis_cache"]["Row"]["result"],
        created_at: new Date().toISOString(),
        organization_id: params.tenantId,
        project_id: params.projectId ?? "",
      },
      { onConflict: "organization_id,repo,branch" },
    ),
  logger);
}

/**
 * Update an existing analysis cache row (e.g. to add AI analysis to an existing entry).
 */
export async function updateAnalysisCache(
  repoKey: string,
  branch: string,
  result: Json,
  logger: CacheLogger,
): Promise<void> {
  const db = supabaseAdmin;
  await runCacheWrite("analysis_cache", () =>
    db.from("analysis_cache").update({ result: result as Database["public"]["Tables"]["analysis_cache"]["Row"]["result"] }).eq("repo", repoKey).eq("branch", branch),
  logger);
}

/**
 * Latest successful deployment for a repo+branch.
 * Used to scope favicon cache validity until the next deploy.
 */
export async function getLatestSuccessfulDeployId(
  repoKey: string,
  branch: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("deployments")
    .select("id")
    .eq("repo", repoKey)
    .eq("branch", branch)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

/**
 * Remove repoFavicon from analysis_cache so the next request re-resolves from source.
 * Called when a deployment succeeds (repo content may have changed).
 */
export async function clearRepoFaviconFromAnalysisCache(
  repoKey: string,
  branch: string,
  logger: CacheLogger,
): Promise<void> {
  const db = supabaseAdmin;
  const { data } = await db
    .from("analysis_cache")
    .select("result")
    .eq("repo", repoKey)
    .eq("branch", branch)
    .maybeSingle();

  if (!data?.result) return;

  const parsed = parseJsonField<Record<string, unknown>>(data.result);
  if (!parsed || !("repoFavicon" in parsed)) return;

  const { repoFavicon: _removed, ...rest } = parsed;
  await updateAnalysisCache(repoKey, branch, rest as Json, logger);
}

/**
 * Write to the repo_cache table (connection-scoped repository list).
 */
export async function writeRepoListCache(
  connectionId: string,
  tenantId: string,
  repos: Json,
  logger: CacheLogger,
): Promise<void> {
  const db = supabaseAdmin;
  await runCacheWrite("repo_cache", () =>
    db.from("repo_cache").upsert(
      {
        id: connectionId,
        connection_id: connectionId,
        organization_id: tenantId,
        repos,
        created_at: new Date().toISOString(),
      },
      { onConflict: "connection_id" },
    ),
  logger);
}

/**
 * Write to the sensitive_cache table (project-scoped schema analysis).
 */
export async function writeSensitiveCache(
  projectId: string,
  result: Json,
  logger: CacheLogger,
): Promise<void> {
  const db = supabaseAdmin;
  await runCacheWrite("sensitive_cache", () =>
    db.from("sensitive_cache").upsert(
      {
        id: projectId,
        project_id: projectId,
        result,
        created_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    ),
  logger);
}
