import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapList } from "../../../shared/supabase/query.js";
import { rowToFinding } from "./mappers.js";
import { CodeAnalysisError } from "./scans.js";

export interface ListFindingsParams {
  scanId: string;
  tenantId: string;
  severity?: string;
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
