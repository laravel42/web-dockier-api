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
  status: string;
  summary: ScanSummary;
  commitSha: string;
  commitMessage: string;
  commitAuthor: string;
  commitDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
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
  sonar: number;
  custom: number;
  byProvider: Record<"semgrep" | "sonar" | "custom", ProviderSeverityCounts>;
}

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
