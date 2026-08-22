import { scanProgressSchema, summarySchema, type ScanStatus, type FindingSeverity } from "../schemas.js";
import type { TableRow } from "../../../shared/supabase/types.js";

type ScanRow = TableRow<"scans">;
type FindingRow = TableRow<"findings">;
type CustomRuleRow = TableRow<"custom_rules">;

/**
 * Accepts both full query rows and freshly-built insert payloads, which omit
 * the commit_* fields (populated later by the scan worker) and are read here
 * with `?? ""` fallbacks.
 */
type ScanRowInput = Partial<ScanRow> & Pick<ScanRow, "id" | "status" | "summary" | "created_at" | "updated_at">;

/** The findings list query selects only the columns mapped below (no organization_id). */
type FindingRowInput = Pick<
  FindingRow,
  "id" | "scan_id" | "rule_id" | "severity" | "message" | "file_path" | "start_line" | "end_line" | "snippet" | "created_at"
>;

export interface ScanSummary {
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  filesScanned: number;
  filesInRepo: number;
  error?: string;
  progress?: ReturnType<typeof scanProgressSchema.parse>;
}

function normalizeSummaryRaw(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export function defaultSummary(): ScanSummary {
  return {
    totalFindings: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    filesScanned: 0,
    filesInRepo: 0,
  };
}

/** Parse scan summary JSON without dropping in-flight `progress` on validation errors. */
export function parseSummary(raw: unknown): ScanSummary {
  const normalized = normalizeSummaryRaw(raw);
  const parsed = summarySchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  const fallback = defaultSummary();
  if (!normalized || typeof normalized !== "object") {
    return fallback;
  }

  const meta = normalized as Record<string, unknown>;
  const progressParsed = scanProgressSchema.safeParse(meta.progress);

  return {
    ...fallback,
    totalFindings: Number(meta.totalFindings ?? 0),
    errors: Number(meta.errors ?? 0),
    warnings: Number(meta.warnings ?? 0),
    infos: Number(meta.infos ?? 0),
    filesScanned: Number(
      meta.filesScanned ?? (progressParsed.success ? progressParsed.data.filesScanned : 0) ?? 0,
    ),
    filesInRepo: Number(
      meta.filesInRepo ?? (progressParsed.success ? progressParsed.data.filesInRepo : 0) ?? 0,
    ),
    error: typeof meta.error === "string" ? meta.error : undefined,
    progress: progressParsed.success ? progressParsed.data : undefined,
  };
}

export function rowToScan(row: ScanRowInput) {
  return {
    id: row.id,
    projectId: row.project_id ?? "",
    connectionId: row.connection_id ?? "",
    repo: row.repo ?? "",
    branch: row.branch ?? "",
    status: row.status as ScanStatus,
    summary: parseSummary(row.summary),
    commitSha: row.commit_sha ?? "",
    commitMessage: row.commit_message ?? "",
    commitAuthor: row.commit_author ?? "",
    commitDate: row.commit_date ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToFinding(row: FindingRowInput) {
  return {
    id: row.id,
    scanId: row.scan_id,
    ruleId: row.rule_id,
    severity: row.severity as FindingSeverity,
    message: row.message,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    snippet: row.snippet,
    createdAt: row.created_at,
  };
}

export function rowToCustomRule(row: CustomRuleRow) {
  return {
    id: row.id,
    ruleId: row.rule_id,
    severity: row.severity,
    message: row.message,
    pattern: row.pattern ?? "",
    extensions: row.extensions ?? [],
    enabled: row.enabled,
    isSystem: row.organization_id === "",
    type: row.type,
    yamlContent: row.yaml_content ?? "",
    createdAt: row.created_at,
  };
}
