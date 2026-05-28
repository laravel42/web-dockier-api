import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { DomainError, type BaseDomainErrorCode } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type { Json } from "../../../shared/supabase/types.js";
import { defaultSummary, rowToScan } from "./mappers.js";

export type CodeAnalysisErrorCode = "not_found" | "forbidden" | "bad_request" | "internal";

export class CodeAnalysisError extends DomainError {
  constructor(
    message: string,
    public readonly code: CodeAnalysisErrorCode & BaseDomainErrorCode,
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
  const id = uuidv4();
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
  return rows.map(rowToScan);
}

export async function getScan(scanId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  const scan = unwrapQuery(data, error, CodeAnalysisError, {
    notFoundMsg: "Scan not found",
    internalMsg: "Failed to fetch scan",
  });
  if (scan.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");
  return rowToScan(scan);
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

export async function runScan(scanId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  const scan = unwrapQuery(data, error, CodeAnalysisError, { notFoundMsg: "Scan not found" });
  if (scan.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("scans")
    .update({
      status: "running",
      summary: {
        ...defaultSummary(),
        note: "Scan queued; external semgrep/sonarqube workers will populate findings asynchronously.",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", scanId)
    .select()
    .single();
  throwOnError(updateError, CodeAnalysisError, { internalMsg: "Failed to update scan status" });

  return rowToScan(updated ?? data);
}
