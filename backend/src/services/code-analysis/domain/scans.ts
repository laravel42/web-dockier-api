import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { DomainError } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type { Json } from "../../../shared/supabase/types.js";
import { defaultSummary, rowToScan } from "./mappers.js";
import { enqueueScan } from "./worker.js";
import type { RunScanOptions } from "./scan-worker.js";
import { persistScanProgress } from "./scan-progress.js";
import { reconcileStaleScanById } from "./scan-reconcile.js";
import { getSecurityFindingCounts, getSecurityFindingCountsForScans } from "./findings.js";

export type { RunScanOptions };

export type CodeAnalysisErrorCode = "not_found" | "forbidden" | "bad_request" | "internal";

export class CodeAnalysisError extends DomainError {
  constructor(
    message: string,
    public readonly code: CodeAnalysisErrorCode,
    cause?: unknown,
  ) {
    super(message, code, cause);
    this.name = "CodeAnalysisError";
  }
}

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
  const now = new Date().toISOString();
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
}

export async function listScans(params: ListScansParams) {
  const { tenantId, projectId, branch } = params;
  let query = supabaseAdmin
    .from("scans")
    .select("*")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (projectId) query = query.eq("project_id", projectId);
  if (branch) query = query.eq("branch", branch);
  const { data, error } = await query;
  const rows = unwrapList(data, error, CodeAnalysisError, { internalMsg: "Failed to list scans" });
  await Promise.all(
    rows
      .filter((row) => row.status === "running" || row.status === "pending")
      .map((row) => reconcileStaleScanById(row.id)),
  );

  const { data: finalData, error: finalError } = await query;
  const finalRows = unwrapList(finalData, finalError, CodeAnalysisError, { internalMsg: "Failed to list scans" });

  const terminalIds = finalRows
    .filter((row) => row.status === "completed" || row.status === "failed")
    .map((row) => row.id);
  const severityByScan = await getSecurityFindingCountsForScans(terminalIds);

  return finalRows.map((row) => {
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

export async function getScan(scanId: string, tenantId: string) {
  await reconcileStaleScanById(scanId);

  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  const scan = unwrapQuery(data, error, CodeAnalysisError, {
    notFoundMsg: "Scan not found",
    internalMsg: "Failed to fetch scan",
  });
  if (scan.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");
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
  if (scan.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");

  const { error: findingsError } = await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  throwOnError(findingsError, CodeAnalysisError, { internalMsg: "Failed to delete scan findings" });

  const { error } = await supabaseAdmin.from("scans").delete().eq("id", scanId);
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to delete scan" });
}

export async function runScan(scanId: string, tenantId: string, options: RunScanOptions = {}) {
  await reconcileStaleScanById(scanId);

  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  const scan = unwrapQuery(data, error, CodeAnalysisError, { notFoundMsg: "Scan not found" });
  if (scan.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");

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
      updated_at: new Date().toISOString(),
    })
    .eq("id", scanId)
    .select()
    .single();
  throwOnError(updateError, CodeAnalysisError, { internalMsg: "Failed to update scan status" });

  await enqueueScan({ scanId, tenantId, options });

  await persistScanProgress(scanId, initialProgress);

  return rowToScan(updated ?? data);
}
