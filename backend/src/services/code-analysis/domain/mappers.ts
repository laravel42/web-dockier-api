import { scanProgressSchema, summarySchema } from "../schemas.js";

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
    filesScanned: Number(meta.filesScanned ?? 0),
    filesInRepo: Number(meta.filesInRepo ?? 0),
    error: typeof meta.error === "string" ? meta.error : undefined,
    progress: progressParsed.success ? progressParsed.data : undefined,
  };
}

export function rowToScan(row: any) {
  return {
    id: row.id,
    projectId: row.project_id ?? "",
    connectionId: row.connection_id ?? "",
    repo: row.repo ?? "",
    branch: row.branch ?? "",
    status: row.status,
    summary: parseSummary(row.summary),
    commitSha: row.commit_sha ?? "",
    commitMessage: row.commit_message ?? "",
    commitAuthor: row.commit_author ?? "",
    commitDate: row.commit_date ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToFinding(row: any) {
  return {
    id: row.id,
    scanId: row.scan_id,
    ruleId: row.rule_id,
    severity: row.severity,
    message: row.message,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    snippet: row.snippet,
    createdAt: row.created_at,
  };
}

export function rowToCustomRule(row: any) {
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
