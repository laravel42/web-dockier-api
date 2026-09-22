/**
 * Dokploy API types.
 *
 * Typed request/response shapes for all Dokploy tRPC endpoints used by Dockier.
 * Dokploy exposes its tRPC procedures over HTTP as POST (mutations) and GET (queries).
 */

// ─── Projects ──────────────────────────────────────────────────────

export interface CreateProjectParams {
  name: string;
  description?: string;
  env?: string;
}

export interface DokployProject {
  projectId: string;
  name: string;
  description: string | null;
  createdAt: string;
  /**
   * Nested environments. `project.one` / `project.all` return these populated.
   * `project.create` may NOT embed them on some Dokploy versions — it can
   * instead return the default environment as a sibling field (see
   * `environment` / `environmentId` below), so treat this as possibly empty.
   */
  environments?: DokployEnvironment[];
  /**
   * Some Dokploy versions return the default ("production") environment
   * alongside the created project rather than nested under `environments`.
   * Either of these may carry it — resolveDefaultEnvironmentId() checks both.
   */
  environment?: DokployEnvironment | null;
  environmentId?: string | null;
}

export interface DokployEnvironment {
  environmentId: string;
  name: string;
}

/**
 * Wrapped response shape returned by `project.create` on current Dokploy
 * versions: the project and its default ("production") environment come back
 * as sibling objects rather than a flat project with nested `environments[]`.
 * The client normalizes this into a flat `DokployProject`.
 */
export interface DokployCreateProjectResponse {
  project: DokployProject;
  environment: DokployEnvironment;
}

// ─── Servers ───────────────────────────────────────────────────────

export interface CreateServerParams {
  name: string;
  description?: string;
  ipAddress: string;
  port: number;
  username: string;
  sshKeyId: string;
  serverType: "deploy" | "build";
}

export interface DokployServer {
  serverId: string;
  name: string;
  ipAddress: string;
  port: number;
  username: string;
  serverType: string;
  createdAt: string;
}

/**
 * Shape of Dokploy's `server.validate` response.
 *
 * Field names match the live API exactly (verified against a real Dokploy
 * instance): each tool reports `enabled` (not `installed`), and the readiness
 * flags are `is*Installed` (not `is*Ready`/`is*Enabled`). Getting these wrong
 * makes every field read as `undefined`, which previously caused a spurious
 * "Docker not installed" failure even on a fully-provisioned server.
 */
export interface ServerValidation {
  docker: { enabled: boolean; version: string };
  rclone?: { enabled: boolean; version: string };
  nixpacks: { enabled: boolean; version: string };
  railpack: { enabled: boolean; version: string };
  buildpacks: { enabled: boolean; version: string };
  isDokployNetworkInstalled: boolean;
  isSwarmInstalled: boolean;
  isMainDirectoryInstalled: boolean;
  privilegeMode?: string;
  dockerGroupMember?: boolean;
}

// ─── Applications ──────────────────────────────────────────────────

export interface CreateApplicationParams {
  name: string;
  environmentId: string;
  appName?: string;
  description?: string;
  serverId?: string;
}

export interface DokployApplication {
  applicationId: string;
  name: string;
  appName: string;
  description: string | null;
  environmentId: string;
  serverId: string | null;
  applicationStatus: "idle" | "running" | "done" | "error";
  sourceType: string;
  buildType: string;
  repository: string | null;
  owner: string | null;
  branch: string | null;
  env: string | null;
  createdAt: string;
}

/**
 * A single Dokploy deployment record (from `deployment.all`). The full build
 * log lives in a host file at `logPath` and is streamed over websocket, so it
 * is not fetchable over REST — but the record's status, timestamps, commit
 * title, and (when set) `errorMessage` are enough to surface a meaningful
 * failure reason to the user.
 */
export interface DokployDeployment {
  deploymentId: string;
  title: string | null;
  description: string | null;
  status: "running" | "done" | "error" | string;
  logPath: string | null;
  errorMessage: string | null;
  applicationId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type DokployBuildType =
  | "dockerfile"
  | "nixpacks"
  | "heroku_buildpacks"
  | "paketo_buildpacks"
  | "railpack"
  | "static";

export interface SaveBuildTypeParams {
  applicationId: string;
  buildType: DokployBuildType;
  // Dokploy's saveBuildType schema requires ALL of these fields regardless of
  // the selected buildType (they're non-optional server-side). Unused ones
  // must be sent as empty strings, not omitted — omitting triggers a 400.
  dockerfile?: string;
  dockerContextPath?: string;
  dockerBuildStage?: string;
  herokuVersion?: string;
  railpackVersion?: string;
  publishDirectory?: string;
  isStaticSpa?: boolean;
}

export interface SaveEnvironmentParams {
  applicationId: string;
  env: string;
  buildArgs?: string;
  buildSecrets?: string;
  createEnvFile?: boolean;
}

export interface CreateDomainParams {
  host: string;
  applicationId: string;
  port: number;
  https: boolean;
  domainType: "application" | "compose";
  certificateType: "none" | "letsencrypt";
  path?: string;
}

export interface DokployDomain {
  domainId: string;
  host: string;
  port: number | null;
  https: boolean;
  path: string | null;
  applicationId: string | null;
}

/**
 * A backing service (database/cache/etc.) detected for a deployment.
 *
 * - `type`: category — "database", "cache", "queue", "storage", etc.
 * - `name`: human label (e.g. "MySQL").
 * - `mode`: "vps" = self-hosted (provision it on the server), "managed" = the
 *   app uses an externally hosted service via its own env credentials (no-op
 *   for provisioning).
 */
export interface DeployService {
  type: string;
  name: string;
  mode: string;
}

// ─── Databases (self-hosted services) ──────────────────────────────

/** Common create params for SQL databases (mysql/postgres/mariadb). */
export interface CreateSqlDatabaseParams {
  name: string;
  appName: string;
  environmentId: string;
  databaseName: string;
  databaseUser: string;
  databasePassword: string;
  dockerImage: string;
  serverId?: string;
}

/** Create params for a Redis service (no user/db name). */
export interface CreateRedisParams {
  name: string;
  appName: string;
  environmentId: string;
  databasePassword: string;
  dockerImage: string;
  serverId?: string;
}

/**
 * A created Dokploy database service. `appName` is the internal Docker service
 * hostname other containers (the app) use to reach it over the Dokploy
 * network — i.e. the value for DB_HOST / REDIS_HOST.
 */
export interface DokployDatabase {
  /** One of mysqlId / postgresId / redisId depending on engine. */
  id: string;
  appName: string;
  name: string;
  databaseName?: string;
  databaseUser?: string;
  databasePassword: string;
}

// ─── Git Providers ─────────────────────────────────────────────────

export interface SaveGithubProviderParams {
  applicationId: string;
  owner: string;
  repository: string;
  branch: string;
  githubId: string;
  buildPath?: string;
  enableSubmodules?: boolean;
  watchPaths?: string[];
  triggerType?: "push" | "tag";
}

export interface SaveGitlabProviderParams {
  applicationId: string;
  gitlabOwner: string;
  gitlabRepository: string;
  gitlabBranch: string;
  gitlabBuildPath: string;
  gitlabId: string;
  gitlabProjectId: number;
  gitlabPathNamespace: string;
  enableSubmodules?: boolean;
  watchPaths?: string[];
}

export interface SaveCustomGitProviderParams {
  applicationId: string;
  customGitUrl: string;
  customGitBranch: string;
  customGitBuildPath?: string;
  customGitSSHKeyId?: string;
  enableSubmodules?: boolean;
  watchPaths?: string[];
}

// ─── Deployments ───────────────────────────────────────────────────

export interface DeployParams {
  applicationId: string;
  title?: string;
  description?: string;
}

// ─── AI Fix ────────────────────────────────────────────────────────

export interface AIFixResult {
  applied: boolean;
  summary: string | null;
}

// ─── SSH Keys ──────────────────────────────────────────────────────

export interface CreateSSHKeyParams {
  name: string;
  description?: string;
  publicKey?: string;
  privateKey?: string;
}

export interface DokploySSHKey {
  sshKeyId: string;
  name: string;
  publicKey: string;
  createdAt: string;
}

// ─── Client Config ─────────────────────────────────────────────────

export interface DokployClientConfig {
  baseUrl: string;
  apiToken: string;
  timeout?: number;
  maxRetries?: number;
}

// ─── Error ─────────────────────────────────────────────────────────

export class DokployError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DokployError";
  }
}
