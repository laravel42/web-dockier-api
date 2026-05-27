import { supabaseAdmin } from "../../../shared/supabase/client.js";
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
  if (scanError) throw new CodeAnalysisError(scanError.message, "internal");
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
  if (error) throw new CodeAnalysisError(error.message, "internal");
  return (data ?? []).map(rowToFinding);
}
