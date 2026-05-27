import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import { defaultSummary, rowToScan } from "./mappers.js";

export type CodeAnalysisErrorCode = "not_found" | "forbidden" | "bad_request" | "internal";

export class CodeAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: CodeAnalysisErrorCode,
  ) {
    super(message);
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
  if (error) throw new CodeAnalysisError(error.message, "bad_request");
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
  if (error) throw new CodeAnalysisError(error.message, "internal");
  return (data ?? []).map(rowToScan);
}

export async function getScan(scanId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  if (error || !data) throw new CodeAnalysisError("Scan not found", "not_found");
  if (data.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");
  return rowToScan(data);
}

export async function deleteScan(scanId: string, tenantId: string) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("scans")
    .select("id,organization_id")
    .eq("id", scanId)
    .single();
  if (fetchError || !existing) throw new CodeAnalysisError("Scan not found", "not_found");
  if (existing.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");

  const { error: findingsError } = await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  if (findingsError) throw new CodeAnalysisError(findingsError.message, "internal");

  const { error } = await supabaseAdmin.from("scans").delete().eq("id", scanId);
  if (error) throw new CodeAnalysisError(error.message, "bad_request");
}

export async function runScan(scanId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin.from("scans").select("*").eq("id", scanId).single();
  if (error || !data) throw new CodeAnalysisError("Scan not found", "not_found");
  if (data.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");

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
  if (updateError) throw new CodeAnalysisError(updateError.message, "internal");

  return rowToScan(updated ?? data);
}
