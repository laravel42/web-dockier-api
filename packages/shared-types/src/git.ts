/**
 * Git integration domain types — single source of truth.
 *
 * Backend Zod schemas: backend/src/services/git-integration/schemas.ts
 */

export interface Connection {
  id: string;
  provider: string;
  label: string;
  repoUrl: string;
  endpoint: string;
  createdAt: string;
}

export interface Repo {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
}

export interface TechBadgeInfo {
  name: string;
  category: string;
  confidence: number;
}

export interface RepoStats {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  language: string;
  languages: Record<string, number>;
  lastCommitDate: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  lastCommitHash: string;
  totalCommits: number;
  contributors: number;
  topContributors: Array<{
    name: string;
    avatarUrl: string;
    commits: number;
    profileUrl: string;
    additions: number;
    deletions: number;
  }>;
}

export interface RepoMember {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
}

export interface FixResult {
  mrUrl: string;
  mrId: string;
  mrTitle: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorLogin?: string;
  authorAvatar?: string;
  date: string;
  url?: string;
  additions?: number;
  deletions?: number;
}

export interface RepoIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
  comments: number;
  labels: Array<{ name: string; color: string }>;
}

export interface RepoPullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
  draft: boolean;
}

// ─── Repo analysis ───

export interface DeployOption {
  provider: string;
  type: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedMonthlyCost: string;
  bestFor: string;
}

export interface DetectedServiceInfo {
  type: string;
  name: string;
  provider: string;
  confidence: number;
  configFile?: string;
}

export interface RepoAiAnalysis {
  runtime: string;
  runtimeVersion: string;
  framework: string;
  frameworkVersion: string;
  phpExtensions?: string[];
  nodeVersion?: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  needsScheduler: boolean;
  needsQueueWorker: boolean;
  needsWebsockets: boolean;
  envVars: string[];
  nginxConfig: "php-fpm" | "reverse-proxy" | "static";
  summary: string;
  description?: string;
  sections?: {
    overview: string;
    howItWorks: string;
    techStack: string;
    architecture: string;
    dataStorage: string;
    codeQuality: string;
    security: string;
    deployment: string;
  };
  deployOptions?: DeployOption[];
}

export interface SensitiveDataField {
  entity: string;
  field: string;
  sensitivity: "personal" | "sensitive" | "secret";
  reason: string;
}

export interface RepoVulnerability {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  details: string;
  aliases: string[];
  url: string;
}

export interface RepoDependency {
  name: string;
  version: string;
  type: "production" | "dev";
  ecosystem: "npm" | "composer" | "pip" | "gem" | "go" | "cargo";
  repoUrl: string;
  latestVersion?: string;
  status: "active" | "outdated" | "deprecated" | "unknown";
  vulnerabilities: RepoVulnerability[];
}

export interface MultiServiceHint {
  /**
   * First compose file found, repo-relative. Absent when the tree holds no
   * compose file; a compose file alone never triggers the hint.
   */
  composeFile?: string;
  /**
   * Candidate service directories, "" = repo root — app-manifest dirs, or the
   * Dockerfile dirs of a compose repo with no recognised manifest. Sorted,
   * capped at 8. Always holds 2 or more entries when a hint is present.
   */
  serviceDirs: string[];
}
export interface RepoAnalysisResponse {
  techStack: TechBadgeInfo[];
  deployOptions: DeployOption[];
  detectedServices: DetectedServiceInfo[];
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
  /**
   * Whether the repo can be served as a static site. `false` is a CONFIDENT
   * server-only verdict (Laravel/Django/SSR/etc.); `undefined` means undecided
   * → show both deploy targets. Drives the deploy wizard's "Static hosting"
   * gating.
   */
  staticCapable?: boolean;
  /**
   * Database engine parsed from a committed `.env.example` `DB_CONNECTION`
   * (lowercased, e.g. "mysql" | "pgsql" | "sqlite"). A real file value, not an
   * AI guess — the wizard prefers it when identifying the database engine.
   * `undefined` when no `.env.example` declares one.
   */
  detectedDbEngine?: string;
  /**
   * Present when the repo looks like it holds more than one deployable service
   * (app manifests in two or more directories, or a compose file beside
   * Dockerfiles in two or more directories). Drives the
   * deploy wizard's informational single-service warning. `null` means checked
   * and single-service; `undefined` means the analysis predates the field.
   */
  multiService?: MultiServiceHint | null;
  aiAnalysis?: RepoAiAnalysis;
  sensitiveData?: SensitiveDataField[];
  dependencies?: RepoDependency[];
}

// ─── Stack analysis ───

export interface StackComponent {
  id: string;
  name: string;
  path: string[];
  tech: string | null;
  techs: string[];
  languages: Record<string, number>;
  dependencies: Array<{ ecosystem: string; name: string; version: string }>;
  edges: Array<{ target: string; read: boolean; write: boolean }>;
  childs: Array<unknown>;
}

export interface StackAnalysisResponse {
  stack: { components: StackComponent[] } | null;
  cached: boolean;
}

// ─── Sensitive data analysis ───

export interface SensitiveDataTableColumn {
  name: string;
  type: string;
  category: string;
  sensitivity: string;
  reason: string;
  confidence: number;
}

export interface SensitiveDataTable {
  name: string;
  riskScore: number;
  columns: SensitiveDataTableColumn[];
}

export interface SensitiveDataAnalysis {
  tables: SensitiveDataTable[];
  summary: {
    totalTables: number;
    highRiskTables: number;
    criticalFindings: string[];
  };
}
