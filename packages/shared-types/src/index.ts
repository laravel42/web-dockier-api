/**
 * @dockier/shared-types
 *
 * Single source of truth for domain types shared between backend and frontend.
 * Backend Zod schemas validate these shapes at runtime; the frontend imports
 * them for type-safe API consumption without duplicating definitions.
 */

export type { PaginationMeta } from "./pagination.js";

export type {
  Project,
  ProjectSourceType,
  ProjectTemplate,
  ProjectConfig,
  ProjectSettings,
} from "./project.js";

export type {
  Deployment,
  DeploymentStatus,
  DeployStrategy,
} from "./deployment.js";

export type { Provider } from "./provider.js";

export type {
  ScanStatus,
  FindingSeverity,
  ScanProgress,
  ScanSummary,
  Scan,
  Finding,
  ProviderSeverityCounts,
  SecurityFindingCounts,
} from "./scan.js";

export type {
  Connection,
  Repo,
  TechBadgeInfo,
  RepoStats,
  RepoMember,
  FixResult,
  CommitInfo,
  RepoIssue,
  RepoPullRequest,
  DeployOption,
  DetectedServiceInfo,
  RepoAiAnalysis,
  SensitiveDataField,
  RepoVulnerability,
  RepoDependency,
  RepoAnalysisResponse,
  StackComponent,
  StackAnalysisResponse,
  SensitiveDataTableColumn,
  SensitiveDataTable,
  SensitiveDataAnalysis,
} from "./git.js";

export type {
  PMIntegration,
  PMTeam,
  PMMember,
} from "./integrations.js";

export type { BillingDetails } from "./billing.js";
