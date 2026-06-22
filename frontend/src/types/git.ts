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
  url: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
  draft: boolean;
}

// ─── Repo analysis (GET /git/connections/:id/repo-analyze) ───

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
  postDeployCommands: string[];
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

export interface RepoAnalysisResponse {
  techStack: TechBadgeInfo[];
  deployOptions: DeployOption[];
  detectedServices: DetectedServiceInfo[];
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
  aiAnalysis?: RepoAiAnalysis;
  sensitiveData?: SensitiveDataField[];
  dependencies?: RepoDependency[];
}

// ─── Stack analysis (GET /git/connections/:id/stack-analysis) ───

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

// ─── Sensitive data analysis (POST /git/analyze-sensitive-data) ───

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
