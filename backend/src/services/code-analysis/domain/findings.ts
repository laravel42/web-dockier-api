import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapList, assertOwnership } from "../../../shared/supabase/query.js";
import { findingProvider, isSensitiveDataFinding, type FindingProvider } from "./finding-filters.js";
import { rowToFinding } from "./mappers.js";
import { CodeAnalysisError } from "./scans.js";

export type { FindingProvider };

export interface ProviderSeverityCounts {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface SecurityFindingCounts {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  semgrep: number;
  sonar: number;
  custom: number;
  byProvider: Record<FindingProvider, ProviderSeverityCounts>;
}

function emptyProviderCounts(): ProviderSeverityCounts {
  return { total: 0, errors: 0, warnings: 0, infos: 0 };
}

function emptyCounts(): SecurityFindingCounts {
  return {
    total: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    semgrep: 0,
    sonar: 0,
    custom: 0,
    byProvider: {
      semgrep: emptyProviderCounts(),
      sonar: emptyProviderCounts(),
      custom: emptyProviderCounts(),
    },
  };
}

function bumpCount(bucket: ProviderSeverityCounts, severity: string): void {
  bucket.total++;
  if (severity === "error") bucket.errors++;
  else if (severity === "warning") bucket.warnings++;
  else if (severity === "info") bucket.infos++;
}

function applyFindingRow(
  counts: SecurityFindingCounts,
  row: { severity: string; rule_id: string },
): void {
  bumpCount(counts, row.severity);
  const provider = findingProvider(row.rule_id);
  counts[provider]++;
  bumpCount(counts.byProvider[provider], row.severity);
}

export async function getSecurityFindingCounts(scanId: string): Promise<SecurityFindingCounts> {
  const { data, error } = await supabaseAdmin
    .from("findings")
    .select("severity,rule_id")
    .eq("scan_id", scanId)
    .not("rule_id", "like", "sensitive-data.%");
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to count findings" });

  const counts = emptyCounts();
  for (const row of data ?? []) {
    applyFindingRow(counts, row);
  }
  return counts;
}

export type ScanSeveritySummary = Pick<SecurityFindingCounts, "total" | "errors" | "warnings" | "infos">;

/** Batch severity totals for list views (excludes sensitive-data findings). */
export async function getSecurityFindingCountsForScans(
  scanIds: string[],
): Promise<Map<string, ScanSeveritySummary>> {
  const result = new Map<string, ScanSeveritySummary>();
  if (scanIds.length === 0) return result;

  const { data, error } = await supabaseAdmin
    .from("findings")
    .select("scan_id,severity,rule_id")
    .in("scan_id", scanIds)
    .not("rule_id", "like", "sensitive-data.%");
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to count findings" });

  const byScan = new Map<string, SecurityFindingCounts>();
  for (const row of data ?? []) {
    let counts = byScan.get(row.scan_id);
    if (!counts) {
      counts = emptyCounts();
      byScan.set(row.scan_id, counts);
    }
    applyFindingRow(counts, row);
  }

  for (const scanId of scanIds) {
    const counts = byScan.get(scanId) ?? emptyCounts();
    result.set(scanId, {
      total: counts.total,
      errors: counts.errors,
      warnings: counts.warnings,
      infos: counts.infos,
    });
  }
  return result;
}

export const FINDINGS_PAGE_SIZE_DEFAULT = 40;
export const FINDINGS_PAGE_SIZE_MAX = 100;

export interface ListFindingsParams {
  scanId: string;
  tenantId: string;
  severity?: string;
  provider?: FindingProvider;
  limit?: number;
  offset?: number;
  excludeSensitiveData?: boolean;
}

export interface ListFindingsResult {
  findings: ReturnType<typeof rowToFinding>[];
  total: number;
  hasMore: boolean;
  counts: SecurityFindingCounts;
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
  assertOwnership(findingRow, tenantId, CodeAnalysisError, "Not your finding");

  const { data: scanRow, error: scanError } = await supabaseAdmin
    .from("scans")
    .select("connection_id,repo,branch,organization_id")
    .eq("id", findingRow.scan_id)
    .maybeSingle();
  throwOnError(scanError, CodeAnalysisError, { internalMsg: "Failed to load scan for finding" });
  if (!scanRow) throw new CodeAnalysisError("Scan not found for finding", "not_found");
  assertOwnership(scanRow, tenantId, CodeAnalysisError, "Not your finding");

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

export async function listFindings(params: ListFindingsParams): Promise<ListFindingsResult> {
  const {
    scanId,
    tenantId,
    severity,
    provider,
    limit: rawLimit,
    offset: rawOffset,
    excludeSensitiveData = true,
  } = params;

  const limit = Math.min(
    Math.max(rawLimit ?? FINDINGS_PAGE_SIZE_DEFAULT, 1),
    FINDINGS_PAGE_SIZE_MAX,
  );
  const offset = Math.max(rawOffset ?? 0, 0);

  const { data: scan, error: scanError } = await supabaseAdmin
    .from("scans")
    .select("organization_id")
    .eq("id", scanId)
    .maybeSingle();
  throwOnError(scanError, CodeAnalysisError, { internalMsg: "Failed to verify scan ownership" });
  if (!scan) throw new CodeAnalysisError("Scan not found", "not_found");
  assertOwnership(scan, tenantId, CodeAnalysisError, "Not your scan");

  let query = supabaseAdmin
    .from("findings")
    .select("id,scan_id,rule_id,severity,message,file_path,start_line,end_line,snippet,created_at", { count: "exact" })
    .eq("scan_id", scanId)
    .order("severity", { ascending: true })
    .order("file_path", { ascending: true })
    .order("start_line", { ascending: true });

  if (severity) query = query.eq("severity", severity);
  if (excludeSensitiveData) query = query.not("rule_id", "like", "sensitive-data.%");
  if (provider === "sonar") query = query.like("rule_id", "sonar.%");
  else if (provider === "custom") query = query.like("rule_id", "custom.%");
  else if (provider === "semgrep") {
    query = query
      .not("rule_id", "like", "sonar.%")
      .not("rule_id", "like", "custom.%")
      .not("rule_id", "like", "sensitive-data.%");
  }

  const [{ data, error, count }, counts] = await Promise.all([
    query.range(offset, offset + limit - 1),
    getSecurityFindingCounts(scanId),
  ]);
  const rows = unwrapList(data, error, CodeAnalysisError, { internalMsg: "Failed to list findings" });
  const total = count ?? rows.length;

  return {
    findings: rows.map(rowToFinding),
    total,
    hasMore: offset + rows.length < total,
    counts,
  };
}

/** Client-side guard when reading persisted rows outside listFindings. */
export function filterSecurityFindings<T extends { ruleId: string }>(findings: T[]): T[] {
  return findings.filter((finding) => !isSensitiveDataFinding(finding.ruleId));
}
