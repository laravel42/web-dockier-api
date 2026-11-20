import { randomUUID } from "node:crypto";
import { gitConnectionBelongsToTenant, projectBelongsToTenant } from "../../../shared/service-clients/tenant-ownership.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList, assertOwnership } from "../../../shared/supabase/query.js";
import type { Json } from "../../../shared/supabase/types.js";
import { nowIso } from "../../../shared/utils/time.js";
import { defaultSummary, rowToScan } from "./mappers.js";
import { enqueueScan } from "./worker.js";
import type { RunScanOptions } from "./scan-worker.js";
import { persistScanProgress } from "./scan-progress.js";
import { reconcileStaleScanById } from "./scan-reconcile.js";
import { requestScanCancel } from "./scan-cancel.js";
import { markScanFailed } from "./scan-persistence.js";
import { getSecurityFindingCounts, getSecurityFindingCountsForScans, countDistinctFindingFiles } from "./findings.js";

export type { RunScanOptions };

export const CodeAnalysisError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("CodeAnalysisError");
export type CodeAnalysisError = InstanceType<typeof CodeAnalysisError>;

export interface CreateScanParams {
  tenantId: string;
  projectId: string;
  connectionId: string;
  repo: string;
  branch: string;
}

const PROJECT_SCAN_RUNNING_MESSAGE =
  "A scan of this project is already running. Wait for it to finish or cancel it first.";
const projectScanRunningError = () => new CodeAnalysisError(PROJECT_SCAN_RUNNING_MESSAGE, "bad_request");

/**
 * Whether the project has a running scan whose owner is alive. One that is
 * stale (owner died) is marked failed on the way, so it cannot block the project.
 * The unique index of migration 0089 is the real guard; this gives the refusal
 * before a scan row is created, and frees a project a crash left "running".
 */
async function hasLiveRunningScan(tenantId: string, projectId: string, exceptScanId?: string): Promise<boolean> {
  // Tenant-scoped: createScan does not verify projectId, so this must not report on another tenant's project.
  let query = supabaseAdmin
    .from("scans")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .eq("status", "running");
  if (exceptScanId) query = query.neq("id", exceptScanId);
  const { data } = await query;
  const results = await Promise.allSettled((data ?? []).map((s) => reconcileStaleScanById(s.id)));
  // reconcile returns true when it marked the scan failed; anything else is still running.
  return results.some((r) => !(r.status === "fulfilled" && r.value));
}

export async function createScan(params: CreateScanParams) {
  const { tenantId, projectId, connectionId, repo, branch } = params;
  // Both ids come from the body. A foreign projectId would hold THAT project's
  // one-running-scan slot (idx_scans_one_running_per_project is global on
  // project_id) and block its owner's scans; a foreign connectionId is refused
  // later by the worker, but only after the scan row exists.
  const [projectOwned, connectionOwned] = await Promise.all([
    projectBelongsToTenant(projectId, tenantId),
    gitConnectionBelongsToTenant(connectionId, tenantId),
  ]);
  if (!projectOwned) throw new CodeAnalysisError("Project not found", "not_found");
  if (!connectionOwned) throw new CodeAnalysisError("Git connection not found", "not_found");
  if (await hasLiveRunningScan(tenantId, projectId)) throw projectScanRunningError();
  const id = randomUUID();
  const now = nowIso();
  const payload = {
    id,
    organization_id: tenantId,
    project_id: projectId,
    connection_id: connectionId,
    repo,
    branch,
    status: "pending",
    summary: defaultSummary() as unknown as Json,
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabaseAdmin.from("scans").insert(payload);
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to create scan" });
  return rowToScan(payload);
}

export interface ListScansParams {
  tenantId: string;
  projectId?: string;
  branch?: string;
  limit?: number;
  offset?: number;
}

export async function listScans(params: ListScansParams) {
  const { tenantId, projectId, branch, limit = 20, offset = 0 } = params;

  // Count query for pagination metadata
  let countQuery = supabaseAdmin
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenantId);
  if (projectId) countQuery = countQuery.eq("project_id", projectId);
  if (branch) countQuery = countQuery.eq("branch", branch);
  const { count } = await countQuery;
  const total = count ?? 0;

  // Build the data query
  let query = supabaseAdmin
    .from("scans")
    .select("*")
    .eq("organization_id", tenantId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (projectId) query = query.eq("project_id", projectId);
  if (branch) query = query.eq("branch", branch);

  const { data, error } = await query;
  const rows = unwrapList(data, error, CodeAnalysisError, { internalMsg: "Failed to list scans" });

  // Reconcile stale scans (running/pending that may have been abandoned).
  // Wrap each in try/catch so a single stuck scan doesn't break the list.
  const staleRows = rows.filter((row) => row.status === "running" || row.status === "pending");
  let needsRefresh = false;

  if (staleRows.length > 0) {
    const results = await Promise.allSettled(
      staleRows.map((row) => reconcileStaleScanById(row.id)),
    );
    needsRefresh = results.some((r) => r.status === "fulfilled" && r.value);
  }

  // Re-fetch only if reconciliation actually changed any rows
  let finalRows = rows;
  if (needsRefresh) {
    let refreshQuery = supabaseAdmin
      .from("scans")
      .select("*")
      .eq("organization_id", tenantId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (projectId) refreshQuery = refreshQuery.eq("project_id", projectId);
    if (branch) refreshQuery = refreshQuery.eq("branch", branch);

    const { data: refreshData, error: refreshError } = await refreshQuery;
    finalRows = unwrapList(refreshData, refreshError, CodeAnalysisError, { internalMsg: "Failed to list scans" });
  }

  return { scans: await mapScansWithCounts(finalRows), total };
}

type ScanRowForMapping = Parameters<typeof rowToScan>[0];

/** Map rows to scans, with terminal scans' summaries carrying their finding severity counts. */
async function mapScansWithCounts(rows: ScanRowForMapping[]) {
  const terminalIds = rows
    .filter((row) => row.status === "completed" || row.status === "failed")
    .map((row) => row.id);
  const severityByScan = await getSecurityFindingCountsForScans(terminalIds);

  return rows.map((row) => {
    const mapped = rowToScan(row);
    const counts = severityByScan.get(row.id);
    if (!counts) return mapped;
    return {
      ...mapped,
      summary: {
        ...mapped.summary,
        totalFindings: counts.total,
        errors: counts.errors,
        warnings: counts.warnings,
        infos: counts.infos,
      },
    };
  });
}

/**
 * Per project: its scan count, newest scan and newest completed scan, in one query
 * (`latest_scans_for_projects`, migration 0085). Projects outside the tenant come
 * back with a count of 0 and no scans.
 */
export async function listLatestScansByProject(tenantId: string, projectIds: string[]) {
  const load = async () => {
    const { data, error } = await supabaseAdmin.rpc("latest_scans_for_projects", {
      p_organization_id: tenantId,
      p_project_ids: projectIds,
    });
    return unwrapList(data, error, CodeAnalysisError, { internalMsg: "Failed to list latest scans" });
  };

  let rows = await load();
  // Same as listScans: a scan stuck in running/pending is reconciled, or it would
  // read as in progress forever. Only a project's newest scan can be one.
  const stale = rows.flatMap((r) =>
    r.latest && (r.latest.status === "running" || r.latest.status === "pending") ? [r.latest.id] : [],
  );
  if (stale.length > 0) {
    const results = await Promise.allSettled(stale.map((id) => reconcileStaleScanById(id)));
    if (results.some((r) => r.status === "fulfilled" && r.value)) rows = await load();
  }

  const scanRows = rows.flatMap((r) => [r.latest, r.latest_completed].filter((s) => s !== null));
  const byId = new Map((await mapScansWithCounts(scanRows)).map((s) => [s.id, s]));
  return rows.map((r) => ({
    projectId: r.project_id,
    scanCount: Number(r.scan_count),
    latest: r.latest ? byId.get(r.latest.id) ?? null : null,
    latestCompleted: r.latest_completed ? byId.get(r.latest_completed.id) ?? null : null,
  }));
}

export async function getScan(scanId: string, tenantId: string) {
  const load = async () => {
    const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
    return unwrapQuery(data, error, CodeAnalysisError, {
      notFoundMsg: "Scan not found",
      internalMsg: "Failed to fetch scan",
    });
  };
  let scan = await load();
  assertOwnership(scan, tenantId, CodeAnalysisError, "Not your scan");
  // After the ownership check: the reconcile writes, and must not run on another tenant's scan.
  if (await reconcileStaleScanById(scanId)) scan = await load();
  const mapped = rowToScan(scan);
  if (mapped.status === "completed" || mapped.status === "failed") {
    const counts = await getSecurityFindingCounts(scanId);
    mapped.summary = {
      ...mapped.summary,
      totalFindings: counts.total,
      errors: counts.errors,
      warnings: counts.warnings,
      infos: counts.infos,
    };

    if (mapped.summary.filesInRepo === 0) {
      const distinctFiles = await countDistinctFindingFiles(scanId);
      if (distinctFiles > 0) {
        mapped.summary.filesInRepo = distinctFiles;
        if (mapped.summary.filesScanned === 0) {
          mapped.summary.filesScanned = distinctFiles;
        }
      }
    } else if (mapped.summary.filesScanned === 0) {
      mapped.summary.filesScanned = mapped.summary.filesInRepo;
    }
  }
  return mapped;
}

export async function deleteScan(scanId: string, tenantId: string) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("scans")
    .select("id,organization_id,status")
    .eq("id", scanId)
    .single();
  const scan = unwrapQuery(existing, fetchError, CodeAnalysisError, { notFoundMsg: "Scan not found" });
  assertOwnership(scan, tenantId, CodeAnalysisError, "Not your scan");

  // Deleting the row stopped nothing: the subprocess ran on for up to 50 min and
  // wrote findings for a scan that no longer existed. A stale one (owner died) is
  // marked failed here, so it stays deletable.
  if (scan.status === "running" && !(await reconcileStaleScanById(scanId))) {
    throw new CodeAnalysisError("This scan is still running. Cancel it first, then delete it.", "bad_request");
  }

  const { error: findingsError } = await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  throwOnError(findingsError, CodeAnalysisError, { internalMsg: "Failed to delete scan findings" });

  const { error } = await supabaseAdmin.from("scans").delete().eq("id", scanId);
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to delete scan" });
}

/** Records the request only; the instance running the scan stops it on its next poll. */
export async function cancelScan(scanId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  const scan = unwrapQuery(data, error, CodeAnalysisError, { notFoundMsg: "Scan not found" });
  assertOwnership(scan, tenantId, CodeAnalysisError, "Not your scan");

  if (!(await requestScanCancel(scanId))) {
    throw new CodeAnalysisError("This scan is not running, so there is nothing to cancel.", "bad_request");
  }
  return rowToScan(scan);
}

export async function runScan(scanId: string, tenantId: string, options: RunScanOptions = {}, correlationId?: string) {
  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  const scan = unwrapQuery(data, error, CodeAnalysisError, { notFoundMsg: "Scan not found" });
  assertOwnership(scan, tenantId, CodeAnalysisError, "Not your scan");
  // After the ownership check (it writes). A stale "running" row is failed here, so
  // the status lock below lets the re-run through; only repo/project_id are read from `scan`.
  await reconcileStaleScanById(scanId);

  if (await hasLiveRunningScan(tenantId, scan.project_id, scanId)) throw projectScanRunningError();

  const initialProgress = {
    phase: "cloning" as const,
    scanner: "cloning" as const,
    filesScanned: 0,
    filesInRepo: 0,
    findingsCount: 0,
    currentFile: scan.repo,
  };
  const runningSummary = {
    ...defaultSummary(),
    progress: initialProgress,
  };

  // This UPDATE is the lock, not a preceding status read: two concurrent runs
  // both read the same non-running row and both pass any check made before the
  // write, then both enqueue. Two subprocesses then clone the same repo and
  // both reach persistFindings(), which DELETEs by scan_id before inserting —
  // interleaved, that loses or duplicates findings. `neq` makes the transition
  // the serialization point, so the loser gets 0 rows back and bails out.
  // The queue cannot do this: `security-scan` is created without a policy, so
  // it is `standard`, where pg-boss ignores singletonKey for deduplication.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("scans")
    .update({
      status: "running",
      summary: runningSummary as unknown as Json,
      // A fresh run must not inherit the cancel request of the previous one.
      cancel_requested_at: null,
      updated_at: nowIso(),
    })
    .eq("id", scanId)
    .neq("status", "running")
    .select()
    .maybeSingle();
  if (updateError?.code === "23505") {
    // Lost the race to a run started between the check above and this write. A
    // just-created (pending) scan is recorded as refused instead of left behind.
    await markScanFailed(scanId, PROJECT_SCAN_RUNNING_MESSAGE);
    throw projectScanRunningError();
  }
  throwOnError(updateError, CodeAnalysisError, { internalMsg: "Failed to update scan status" });
  if (!updated) {
    throw new CodeAnalysisError(
      "A scan is already running for this record. Wait for it to finish or start a new scan.",
      "bad_request",
    );
  }

  await enqueueScan({ scanId, tenantId, options, correlationId });

  await persistScanProgress(scanId, initialProgress);

  return rowToScan(updated);
}
