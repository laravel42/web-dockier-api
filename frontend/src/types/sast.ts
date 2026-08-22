/**
 * Types for the SAST workers service (`code-analysis/workers`).
 *
 * These mirror `src/api/schemas.py` exactly. That service validates its own
 * responses against those models, so a mismatch here is a real divergence rather
 * than a guess — keep the two in step.
 */

export interface SastScanOptions {
  enableSemgrep?: boolean;
  enableBearer?: boolean;
  enableSonarqube?: boolean;
  enableCodeql?: boolean;
  enableCustomRules?: boolean;
  enableSensitiveData?: boolean;
}

export type SastScanStatus = "pending" | "running" | "completed" | "failed";

export type SastSeverity = "error" | "warning" | "info";

export type SastEngine = "semgrep" | "regex" | "bearer" | "codeql";

export interface SastEngineStatus {
  status: "ok" | "failed";
  error: string | null;
}

export interface SastScanSummary {
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  filesScanned: number;
  filesInRepo: number;
  /**
   * True when at least one engine failed. `status` is a closed enum with no room
   * for "degraded", so this is the only signal that a scan reporting zero
   * findings may simply not have looked.
   */
  partial: boolean;
  failedEngines: string[];
}

export interface SastScanProgress {
  phase: "cloning" | "scanning" | "persisting" | "done";
  filesScanned: number;
  filesInRepo: number;
  findingsCount: number;
  scanner?: string | null;
  currentFile?: string | null;
}

export interface SastScanState {
  scanId: string;
  status: SastScanStatus;
  summary: SastScanSummary;
  engineStatus: Partial<Record<SastEngine, SastEngineStatus>>;
  /** Null while running, and null for a partial scan — an unevaluated gate is not a pass. */
  qualityGateStatus: "passed" | "failed" | null;
  progress: SastScanProgress | null;
  updatedAt: string | null;
}

export interface SastFinding {
  id: string;
  ruleId: string;
  severity: SastSeverity;
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  /** Findings judged false positives are retained, not deleted. */
  suppressedByLlm: boolean;
  suppressionReason: string | null;
  createdAt: string | null;
}

export interface SastFindingCounts {
  error: number;
  warning: number;
  info: number;
  suppressed: number;
}

export interface SastFindingsPage {
  findings: SastFinding[];
  total: number;
  hasMore: boolean;
  counts: SastFindingCounts;
}

export interface SastRunResponse {
  jobId: string;
  scanId: string;
  status: "queued";
}

export interface SastQueueDepth {
  name: string;
  queued: number;
  active: number;
}

export interface SastHealth {
  status: "ok" | "degraded";
  database: boolean;
  queues: SastQueueDepth[];
}


// ─── Engine settings ───
//
// Credentials are deliberately absent. The service refuses to store a token,
// secret, password or apiKey in a settings row — those live in the secret
// store — and the database enforces it with a CHECK constraint.

export interface BearerSettings {
  enabled: boolean;
  scanners: Array<"sast" | "secrets">;
  severities: string;
  skipTest: boolean;
  skipPaths: string[];
  timeoutSeconds: number;
}

export type CodeQLLanguage =
  | "python" | "javascript" | "go" | "ruby" | "java" | "csharp" | "cpp";

export type CodeQLSuite =
  | "security-and-quality" | "security-extended" | "code-scanning";

export interface CodeQLSettings {
  enabled: boolean;
  /** Narrows what the gateway detected; cannot add a language the repo lacks. */
  languages: CodeQLLanguage[];
  querySuite: CodeQLSuite;
  buildMode: "none" | "autobuild";
  timeoutSeconds: number;
}

export interface SemgrepSettings {
  enabled: boolean;
  ruleTimeoutSeconds: number;
  scanTimeoutSeconds: number;
  /** Files larger than this are not analysed. Minified bundles blow past it. */
  maxTargetBytes: number;
  /** Added to the built-in dependency and build globs, never instead of them. */
  extraExcludes: string[];
}

export interface RegexSettings {
  enabled: boolean;
  /** The two pattern scanners share one walk but switch independently. */
  customRules: boolean;
  sensitiveData: boolean;
  maxFileBytes: number;
  extraExcludes: string[];
}

export interface EngineSettings {
  semgrep: SemgrepSettings;
  regex: RegexSettings;
  bearer: BearerSettings;
  codeql: CodeQLSettings;
}

export type EngineName = keyof EngineSettings;
