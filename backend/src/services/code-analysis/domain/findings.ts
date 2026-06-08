import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapList } from "../../../shared/supabase/query.js";
import { rowToFinding } from "./mappers.js";
import { CodeAnalysisError } from "./scans.js";

export interface ListFindingsParams {
  scanId: string;
  tenantId: string;
  severity?: string;
}

export interface FindingWithScanContext {
  id: string;
  scanId: string;
  ruleId: string;
  severity: string;
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  connectionId: string;
  repo: string;
  branch: string;
}

export async function getFindingById(findingId: string, tenantId: string): Promise<FindingWithScanContext> {
  const { data: findingRow, error: findingError } = await supabaseAdmin
    .from("findings")
    .select("id,scan_id,rule_id,severity,message,file_path,start_line,end_line,snippet,organization_id")
    .eq("id", findingId)
    .maybeSingle();
  throwOnError(findingError, CodeAnalysisError, { internalMsg: "Failed to load finding" });
  if (!findingRow) throw new CodeAnalysisError("Finding not found", "not_found");
  if (findingRow.organization_id !== tenantId) throw new CodeAnalysisError("Not your finding", "forbidden");

  const { data: scanRow, error: scanError } = await supabaseAdmin
    .from("scans")
    .select("connection_id,repo,branch,organization_id")
    .eq("id", findingRow.scan_id)
    .maybeSingle();
  throwOnError(scanError, CodeAnalysisError, { internalMsg: "Failed to load scan for finding" });
  if (!scanRow) throw new CodeAnalysisError("Scan not found for finding", "not_found");
  if (scanRow.organization_id !== tenantId) throw new CodeAnalysisError("Not your finding", "forbidden");

  return {
    id: findingRow.id,
    scanId: findingRow.scan_id,
    ruleId: findingRow.rule_id,
    severity: findingRow.severity,
    message: findingRow.message,
    filePath: findingRow.file_path,
    startLine: findingRow.start_line,
    endLine: findingRow.end_line,
    snippet: findingRow.snippet ?? "",
    connectionId: scanRow.connection_id,
    repo: scanRow.repo,
    branch: scanRow.branch,
  };
}

export async function listFindings(params: ListFindingsParams) {
  const { scanId, tenantId, severity } = params;

  // Verify scan belongs to this tenant
  const { data: scan, error: scanError } = await supabaseAdmin
    .from("scans")
    .select("organization_id")
    .eq("id", scanId)
    .maybeSingle();
  throwOnError(scanError, CodeAnalysisError, { internalMsg: "Failed to verify scan ownership" });
  if (!scan) throw new CodeAnalysisError("Scan not found", "not_found");
  if (scan.organization_id !== tenantId) throw new CodeAnalysisError("Not your scan", "forbidden");

  let query = supabaseAdmin
    .from("findings")
    .select("id,scan_id,rule_id,severity,message,file_path,start_line,end_line,snippet,created_at")
    .eq("scan_id", scanId)
    .order("severity", { ascending: true })
    .order("file_path", { ascending: true })
    .order("start_line", { ascending: true });
  if (severity) query = query.eq("severity", severity);

  const { data, error } = await query;
  const rows = unwrapList(data, error, CodeAnalysisError, { internalMsg: "Failed to list findings" });
  return rows.map(rowToFinding);
}
