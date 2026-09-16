import { randomUUID } from "node:crypto";
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

export async function createScan(params: CreateScanParams) {
  const { tenantId, projectId, connectionId, repo, branch } = params;
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

  // Enrich terminal scans with finding severity counts
  const terminalIds = finalRows
    .filter((row) => row.status === "completed" || row.status === "failed")
    .map((row) => row.id);
  const severityByScan = await getSecurityFindingCountsForScans(terminalIds);

  const scans = finalRows.map((row) => {
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

  return { scans, total };
}

export async function getScan(scanId: string, tenantId: string) {
  await reconcileStaleScanById(scanId);

  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  const scan = unwrapQuery(data, error, CodeAnalysisError, {
    notFoundMsg: "Scan not found",
    internalMsg: "Failed to fetch scan",
  });
  assertOwnership(scan, tenantId, CodeAnalysisError, "Not your scan");
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
    .select("id,organization_id")
    .eq("id", scanId)
    .single();
  const scan = unwrapQuery(existing, fetchError, CodeAnalysisError, { notFoundMsg: "Scan not found" });
  assertOwnership(scan, tenantId, CodeAnalysisError, "Not your scan");

  const { error: findingsError } = await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  throwOnError(findingsError, CodeAnalysisError, { internalMsg: "Failed to delete scan findings" });

  const { error } = await supabaseAdmin.from("scans").delete().eq("id", scanId);
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to delete scan" });
}

export async function runScan(scanId: string, tenantId: string, options: RunScanOptions = {}, correlationId?: string) {
  await reconcileStaleScanById(scanId);

  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  const scan = unwrapQuery(data, error, CodeAnalysisError, { notFoundMsg: "Scan not found" });
  assertOwnership(scan, tenantId, CodeAnalysisError, "Not your scan");

  if (scan.status === "running") {
    throw new CodeAnalysisError("A scan is already running for this record. Wait for it to finish or start a new scan.", "bad_request");
  }

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

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("scans")
    .update({
      status: "running",
      summary: runningSummary as unknown as Json,
      updated_at: nowIso(),
    })
    .eq("id", scanId)
    .select()
    .single();
  throwOnError(updateError, CodeAnalysisError, { internalMsg: "Failed to update scan status" });

  await enqueueScan({ scanId, tenantId, options, correlationId });

  await persistScanProgress(scanId, initialProgress);

  return rowToScan(updated ?? scan);
}
