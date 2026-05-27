import { summarySchema } from "../schemas.js";

export interface ScanSummary {
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  filesScanned: number;
  filesInRepo: number;
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

export function parseSummary(raw: unknown): ScanSummary {
  if (typeof raw === "string") {
    try {
      return summarySchema.parse(JSON.parse(raw));
    } catch {
      return defaultSummary();
    }
  }
  try {
    return summarySchema.parse(raw);
  } catch {
    return defaultSummary();
  }
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
