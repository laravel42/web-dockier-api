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

export type { Command, CommandStatus } from "./command.js";

export type {
  Domain,
  SslCertificate,
  SslCertificateType,
  SslCertificateStatus,
} from "./domain.js";

export type {
  Build,
  BuildListItem,
  BuildImage,
  BuildLogs,
  BuildDeployStatus,
  BuildDeployTarget,
  BuildDeployParams,
  StartBuildInput,
} from "./image-builder.js";

export type {
  SecurityRule,
  SecurityRuleCredential,
  RedirectRule,
  RedirectType,
} from "./network.js";

export type {
  Heartbeat,
  HeartbeatFrequency,
  HeartbeatGracePeriod,
  HeartbeatStatus,
  LogType,
  LogEntry,
  ActivityEventType,
  ActivityEntry,
} from "./observe.js";

export type {
  BackgroundProcess,
  ScheduledJob,
  ProcessType,
  ProcessStatus,
  JobFrequency,
  JobStatus,
} from "./process.js";

export type { TenantMembership } from "./auth.js";

export type { Tag, TagWithCount } from "./tag.js";

export type {
  Notification,
  NotificationMetadata,
  NotificationDeployMetadata,
  NotificationScanMetadata,
} from "./notification.js";
