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
  DokployCreateProjectResponse,
  CreateServerParams,
  DokployServer,
  ServerValidation,
  CreateApplicationParams,
  DokployApplication,
  DokployDeployment,
  SaveBuildTypeParams,
  SaveEnvironmentParams,
  CreateDomainParams,
  DokployDomain,
  CreateSqlDatabaseParams,
  CreateRedisParams,
  DokployDatabase,
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
import { getErrMsg } from "../../../../shared/utils/error-message.js";

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

/**
 * Normalize the `project.create` response into a flat DokployProject.
 *
 * Handles both the wrapped `{ project, environment }` shape (current Dokploy)
 * and a hypothetical flat shape (older/other versions), folding the default
 * environment into `environments[]` so downstream code has a single contract.
 */
function isWrappedCreateResponse(
  raw: DokployProject | DokployCreateProjectResponse,
): raw is DokployCreateProjectResponse {
  return (
    typeof (raw as DokployCreateProjectResponse).project === "object" &&
    (raw as DokployCreateProjectResponse).project !== null &&
    typeof (raw as DokployProject).projectId !== "string"
  );
}

/**
 * Serialize a query input object into a URL query string with each top-level
 * field as its own param (?serverId=abc&foo=bar). Dokploy query endpoints read
 * params directly, not from a tRPC `?input=<json>` envelope.
 *
 * - undefined/null fields are omitted.
 * - object/array values are JSON-stringified (rare for these endpoints).
 * - an empty/absent input produces an empty string (no query string).
 */
function buildQueryString(input: unknown): string {
  if (input === undefined || input === null || typeof input !== "object") return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return params.toString();
}

/**
 * Normalize a database create response into the common DokployDatabase shape.
 * The id field name differs per engine (mysqlId/postgresId/redisId), so the
 * caller passes the expected key.
 */
function normalizeDatabase(raw: Record<string, unknown>, idKey: string): DokployDatabase {
  return {
    id: String(raw[idKey] ?? ""),
    appName: String(raw.appName ?? ""),
    name: String(raw.name ?? ""),
    databaseName: typeof raw.databaseName === "string" ? raw.databaseName : undefined,
    databaseUser: typeof raw.databaseUser === "string" ? raw.databaseUser : undefined,
    databasePassword: String(raw.databasePassword ?? ""),
  };
}

function normalizeCreatedProject(
  raw: DokployProject | DokployCreateProjectResponse,
): DokployProject {
  if (isWrappedCreateResponse(raw)) {
    const { project, environment } = raw;
    return {
      ...project,
      environments: environment
        ? [environment, ...(project.environments ?? [])]
        : project.environments ?? [],
    };
  }
  return raw;
}

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
    // Dokploy's project.create returns a WRAPPED shape on current versions:
    //   { project: { projectId, ... }, environment: { environmentId, name, isDefault, ... } }
    // rather than a flat DokployProject. Normalize both shapes here so callers
    // always receive a flat project with its default environment folded into
    // `environments[]`. Reading the wrapper directly (project.projectId) yields
    // undefined and blows up the DB mapping with a NOT NULL violation.
    const raw = await this.mutation<DokployProject | DokployCreateProjectResponse>("project.create", params);
    return normalizeCreatedProject(raw);
  }

  async getProject(projectId: string): Promise<DokployProject> {
    return this.query<DokployProject>("project.one", { projectId });
  }

  async listProjects(): Promise<DokployProject[]> {
    return this.query<DokployProject[]>("project.all", {});
  }

  // ─── Servers ───────────────────────────────────────────────────

  async createServer(params: CreateServerParams): Promise<DokployServer> {
    // Idempotency: if a server with the same name + ipAddress already exists,
    // reuse it instead of registering a duplicate. Without this, every retry
    // of a failed provision run created another Dokploy server (and left the
    // matching EC2 instance behind).
    const existing = (await this.listServers()).find(
      (s) => s.name === params.name && s.ipAddress === params.ipAddress,
    );
    if (existing?.serverId) return existing;

    // Dokploy's server.create returns an EMPTY 2xx body — it does not echo the
    // created server (unlike a typical REST create). Relying on the response
    // yields an undefined serverId, which then fails server.setup/validate with
    // a 400. So after creating, resolve the real server from server.all by its
    // unique name + ipAddress and return that.
    const created = await this.mutation<DokployServer | undefined>("server.create", params);
    if (created?.serverId) return created;

    const match = (await this.listServers()).find(
      (s) => s.name === params.name && s.ipAddress === params.ipAddress,
    );
    if (!match?.serverId) {
      throw new DokployError(
        `server.create succeeded but the created server could not be resolved from server.all ` +
        `(name="${params.name}", ip="${params.ipAddress}").`,
        0,
        "server.create",
      );
    }
    return match;
  }

  async listServers(): Promise<DokployServer[]> {
    return this.query<DokployServer[]>("server.all", {});
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

  /**
   * List an application's deployment records (most recent first), used to
   * surface a build-failure reason. Best-effort — returns [] on any error so
   * failure reporting never throws over the underlying deploy error.
   */
  async listDeployments(applicationId: string): Promise<DokployDeployment[]> {
    try {
      const rows = await this.query<DokployDeployment[]>("deployment.all", { applicationId });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
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

  // ─── Domains ───────────────────────────────────────────────────

  /**
   * Generate a free sslip.io/traefik.me host string for an app (does NOT
   * persist it — use createDomain to register it). The host embeds the server
   * IP so it resolves without any DNS setup.
   */
  async generateDomain(appName: string, serverId: string): Promise<string> {
    return this.mutation<string>("domain.generateDomain", { appName, serverId });
  }

  /** Register a domain for an application so Traefik routes traffic to it. */
  async createDomain(params: CreateDomainParams): Promise<DokployDomain> {
    return this.mutation<DokployDomain>("domain.create", params);
  }

  /** List domains registered for an application. */
  async listDomains(applicationId: string): Promise<DokployDomain[]> {
    try {
      const rows = await this.query<DokployDomain[]>("domain.byApplicationId", { applicationId });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  // ─── Databases (self-hosted services) ──────────────────────────
  //
  // create registers the DB service; deploy actually starts its container.
  // The create response's `appName` is the internal Docker hostname the app
  // uses to reach the DB (DB_HOST / REDIS_HOST).

  async createMysql(params: CreateSqlDatabaseParams): Promise<DokployDatabase> {
    const raw = await this.mutation<Record<string, unknown>>("mysql.create", params);
    return normalizeDatabase(raw, "mysqlId");
  }

  async deployMysql(mysqlId: string): Promise<void> {
    await this.mutation<unknown>("mysql.deploy", { mysqlId });
  }

  async createPostgres(params: CreateSqlDatabaseParams): Promise<DokployDatabase> {
    const raw = await this.mutation<Record<string, unknown>>("postgres.create", params);
    return normalizeDatabase(raw, "postgresId");
  }

  async deployPostgres(postgresId: string): Promise<void> {
    await this.mutation<unknown>("postgres.deploy", { postgresId });
  }

  async createRedis(params: CreateRedisParams): Promise<DokployDatabase> {
    const raw = await this.mutation<Record<string, unknown>>("redis.create", params);
    return normalizeDatabase(raw, "redisId");
  }

  async deployRedis(redisId: string): Promise<void> {
    await this.mutation<unknown>("redis.deploy", { redisId });
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
    // Dokploy's query endpoints read their parameters as DIRECT query-string
    // params (e.g. ?serverId=abc), NOT wrapped in a tRPC `?input=<json>`
    // envelope. Sending `?input={"serverId":...}` makes the handler see
    // serverId as undefined and reject with a 400. Serialize each top-level
    // field of `input` as its own query param instead.
    const qs = buildQueryString(input);
    const url = qs ? `${this.baseUrl}/${endpoint}?${qs}` : `${this.baseUrl}/${endpoint}`;
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
            // Dokploy authenticates via the `x-api-key` header, not
            // `Authorization: Bearer`. See https://docs.dokploy.com/docs/api
            // and https://github.com/Dokploy/dokploy/issues/4024.
            "x-api-key": this.apiToken,
            "Content-Type": "application/json",
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // Read as text first: several Dokploy mutations (server.setup,
          // saveBuildType, saveEnvironment, deploy, ...) return a 2xx with an
          // EMPTY body. Calling response.json() on an empty body throws
          // "Unexpected end of JSON input" — which, inside this retry loop,
          // turned a server-side SUCCESS into a 4-attempt failure. Treat an
          // empty/whitespace body as a successful void result.
          const text = await response.text();
          if (text.trim() === "") {
            return undefined as T;
          }

          let json: { result?: { data?: T } } | T;
          try {
            json = JSON.parse(text) as { result?: { data?: T } } | T;
          } catch {
            // A malformed body on a 2xx won't fix itself on retry. Use a 4xx
            // status code so the catch below classifies it as non-retryable
            // and throws immediately instead of looping.
            throw new DokployError(
              `Dokploy API returned a non-JSON body (HTTP ${response.status}): ${text.slice(0, 200)}`,
              422,
              endpoint || url,
            );
          }

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
    const message = getErrMsg(lastError);
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
