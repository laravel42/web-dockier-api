/**
 * Dokploy API Client
 *
 * Typed HTTP client for Dokploy's tRPC-over-HTTP API.
 * Handles authentication, retries with exponential backoff, and error mapping.
 *
 * Dokploy tRPC convention:
 *   - Mutations: POST /api/<router>.<procedure>  (body = JSON input)
 *   - Queries:   GET  /api/<router>.<procedure>?input=<url-encoded JSON>
 */

import type {
  DokployClientConfig,
  CreateProjectParams,
  DokployProject,
  CreateServerParams,
  DokployServer,
  ServerValidation,
  CreateApplicationParams,
  DokployApplication,
  SaveBuildTypeParams,
  SaveEnvironmentParams,
  SaveGithubProviderParams,
  SaveGitlabProviderParams,
  SaveCustomGitProviderParams,
  DeployParams,
  AIFixResult,
  CreateSSHKeyParams,
  DokploySSHKey,
} from "./types.js";
import { DokployError } from "./types.js";
import { sleep } from "../../../../shared/utils/time.js";

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export class DokployClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(config: DokployClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiToken = config.apiToken;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  // ─── Projects ──────────────────────────────────────────────────

  async createProject(params: CreateProjectParams): Promise<DokployProject> {
    return this.mutation<DokployProject>("project.create", params);
  }

  async getProject(projectId: string): Promise<DokployProject> {
    return this.query<DokployProject>("project.one", { projectId });
  }

  async listProjects(): Promise<DokployProject[]> {
    return this.query<DokployProject[]>("project.all", {});
  }

  // ─── Servers ───────────────────────────────────────────────────

  async createServer(params: CreateServerParams): Promise<DokployServer> {
    return this.mutation<DokployServer>("server.create", params);
  }

  async setupServer(serverId: string): Promise<void> {
    await this.mutation<unknown>("server.setup", { serverId });
  }

  async validateServer(serverId: string): Promise<ServerValidation> {
    return this.query<ServerValidation>("server.validate", { serverId });
  }

  async getServer(serverId: string): Promise<DokployServer> {
    return this.query<DokployServer>("server.one", { serverId });
  }

  async deleteServer(serverId: string): Promise<void> {
    await this.mutation<unknown>("server.remove", { serverId });
  }

  // ─── Applications ──────────────────────────────────────────────

  async createApplication(params: CreateApplicationParams): Promise<DokployApplication> {
    return this.mutation<DokployApplication>("application.create", params);
  }

  async getApplication(applicationId: string): Promise<DokployApplication> {
    return this.query<DokployApplication>("application.one", { applicationId });
  }

  async updateApplication(params: { applicationId: string } & Record<string, unknown>): Promise<void> {
    await this.mutation<unknown>("application.update", params);
  }

  async deleteApplication(applicationId: string): Promise<void> {
    await this.mutation<unknown>("application.remove", { applicationId });
  }

  async saveBuildType(params: SaveBuildTypeParams): Promise<void> {
    await this.mutation<unknown>("application.saveBuildType", params);
  }

  async saveEnvironment(params: SaveEnvironmentParams): Promise<void> {
    await this.mutation<unknown>("application.saveEnvironment", params);
  }

  // ─── Git Providers ─────────────────────────────────────────────

  async saveGithubProvider(params: SaveGithubProviderParams): Promise<void> {
    await this.mutation<unknown>("application.saveGithubProvider", params);
  }

  async saveGitlabProvider(params: SaveGitlabProviderParams): Promise<void> {
    await this.mutation<unknown>("application.saveGitlabProvider", params);
  }

  async saveGitProvider(params: SaveCustomGitProviderParams): Promise<void> {
    await this.mutation<unknown>("application.saveGitProvider", params);
  }

  // ─── Deployments ───────────────────────────────────────────────

  async deploy(params: DeployParams): Promise<void> {
    await this.mutation<unknown>("application.deploy", params);
  }

  async redeploy(applicationId: string, title?: string): Promise<void> {
    await this.mutation<unknown>("application.redeploy", { applicationId, title });
  }

  async cancelDeployment(applicationId: string): Promise<void> {
    await this.mutation<unknown>("application.cancelDeployment", { applicationId });
  }

  // ─── AI Fix (Dokploy built-in) ────────────────────────────────

  async triggerAIFix(applicationId: string): Promise<AIFixResult> {
    return this.mutation<AIFixResult>("application.aiFixDeployment", { applicationId });
  }

  // ─── SSH Keys ──────────────────────────────────────────────────

  async createSSHKey(params: CreateSSHKeyParams): Promise<DokploySSHKey> {
    return this.mutation<DokploySSHKey>("sshKey.create", params);
  }

  async listSSHKeys(): Promise<DokploySSHKey[]> {
    return this.query<DokploySSHKey[]>("sshKey.all", {});
  }

  // ─── HTTP Primitives ───────────────────────────────────────────

  private async mutation<T>(endpoint: string, input: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, input);
  }

  private async query<T>(endpoint: string, input: unknown): Promise<T> {
    const encodedInput = encodeURIComponent(JSON.stringify(input));
    const url = `${this.baseUrl}/${endpoint}?input=${encodedInput}`;
    return this.requestRaw<T>("GET", url, undefined, endpoint);
  }

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    return this.requestRaw<T>(method, url, body, endpoint);
  }

  private async requestRaw<T>(method: string, url: string, body?: unknown, endpoint?: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers: {
            "Authorization": `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const json = await response.json() as { result?: { data?: T } } | T;
          // tRPC wraps results in { result: { data: ... } }
          if (json && typeof json === "object" && "result" in json && json.result && typeof json.result === "object" && "data" in json.result) {
            return json.result.data as T;
          }
          return json as T;
        }

        // Non-retryable client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          const errorBody = await response.text().catch(() => "");
          throw new DokployError(
            `Dokploy API error: ${response.status} ${response.statusText} — ${errorBody}`,
            response.status,
            endpoint || url,
          );
        }

        // Retryable server errors (5xx)
        lastError = new DokployError(
          `Dokploy API server error: ${response.status} ${response.statusText}`,
          response.status,
          endpoint || url,
        );
      } catch (err) {
        if (err instanceof DokployError && err.statusCode >= 400 && err.statusCode < 500) {
          throw err; // Don't retry client errors
        }
        lastError = err;
      }
    }

    // All retries exhausted
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new DokployError(
      `Dokploy API request failed after ${this.maxRetries + 1} attempts: ${message}`,
      0,
      endpoint || url,
      lastError,
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────

/**
 * Create a DokployClient from environment configuration.
 * Throws if required env vars are not set.
 */
export function createDokployClient(): DokployClient {
  const baseUrl = process.env.DOKPLOY_API_URL;
  const apiToken = process.env.DOKPLOY_API_TOKEN;

  if (!baseUrl) throw new Error("DOKPLOY_API_URL is required when DEPLOY_PROVIDER=dokploy");
  if (!apiToken) throw new Error("DOKPLOY_API_TOKEN is required when DEPLOY_PROVIDER=dokploy");

  return new DokployClient({ baseUrl, apiToken });
}
