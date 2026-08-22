/**
 * Security scan domain types — single source of truth.
 *
 * Backend Zod schemas: backend/src/services/code-analysis/schemas.ts
 */

export type ScanStatus = "pending" | "running" | "completed" | "failed";

export type FindingSeverity = "error" | "warning" | "info";

export interface ScanProgress {
  phase: string;
  filesScanned: number;
  filesInRepo: number;
  findingsCount: number;
  currentFile?: string;
  currentRule?: string;
  scanner?: string;
  rulesChecked?: number;
  rulesTotal?: number;
}

export interface ScanSummary {
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  filesScanned: number;
  filesInRepo: number;
  error?: string;
  progress?: ScanProgress;
}

export interface Scan {
  id: string;
  projectId: string;
  repo: string;
  branch: string;
  status: ScanStatus;
  summary: ScanSummary;
  commitSha: string;
  commitMessage: string;
  commitAuthor: string;
  commitDate: string;
  createdAt: string;
  updatedAt: string;
}

/** A single security/quality finding from a scan. */
export interface Finding {
  id: string;
  /** The scanner rule that triggered this finding (e.g. "javascript.lang.xss"). */
  ruleId: string;
  /** Severity classification: error, warning, or info. */
  severity: FindingSeverity;
  /** Human-readable description of the issue. */
  message: string;
  /** Path to the affected file relative to the repo root. */
  filePath: string;
  /** First line of the affected code range (1-indexed). */
  startLine: number;
  /** Last line of the affected code range (1-indexed). */
  endLine: number;
  /** Source code excerpt showing the affected lines. */
  snippet: string;
}

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
  bearer: number;
  custom: number;
  codeql: number;
  byProvider: Record<"semgrep" | "bearer" | "custom" | "codeql", ProviderSeverityCounts>;
}
