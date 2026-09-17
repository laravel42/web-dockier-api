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

export interface ServerValidation {
  docker: { installed: boolean; version: string };
  nixpacks: { installed: boolean; version: string };
  railpack: { installed: boolean; version: string };
  buildpacks: { installed: boolean; version: string };
  isDokployNetworkReady: boolean;
  isSwarmEnabled: boolean;
  isMainDirectoryReady: boolean;
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
  dockerfile?: string;
  dockerContextPath?: string;
  dockerBuildStage?: string;
  publishDirectory?: string;
  isStaticSpa?: boolean;
  railpackVersion?: string;
}

export interface SaveEnvironmentParams {
  applicationId: string;
  env: string;
  buildArgs?: string;
  buildSecrets?: string;
  createEnvFile?: boolean;
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

export interface DokployDeployment {
  deploymentId: string;
  status: string;
  createdAt: string;
  logPath?: string;
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
