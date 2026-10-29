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
  UpdateDomainParams,
  DokployDomain,
  CreateSqlDatabaseParams,
  CreateRedisParams,
  DokployDatabase,
  SaveGithubProviderParams,
  SaveGitlabProviderParams,
  SaveCustomGitProviderParams,
  CreateSecurityParams,
  DokploySecurity,
  CreateRedirectParams,
  DokployRedirect,
  DeployParams,
  AIFixResult,
  CreateSSHKeyParams,
  DokploySSHKey,
  CreateComposeParams,
  UpdateComposeParams,
  DokployCompose,
  SaveComposeEnvironmentParams,
  DeployComposeParams,
} from "./types.js";
import { DokployError } from "./types.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { withRetry } from "../../../../shared/utils/retry.js";
import { env } from "../../../../shared/config.js";

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
    // Dokploy's application router names its delete `delete`, NOT `remove` —
    // servers and databases use `remove`, but the application router does not
    // have one. Calling `application.remove` hits a non-existent procedure and
    // returns a tRPC 404 ("procedure not found"), which looks exactly like an
    // "already gone" entity 404 and gets silently swallowed, so the app is
    // never actually deleted. Same class of per-router naming quirk as the
    // `redirects.create` vs `security.create` note on createRedirect.
    await this.mutation<unknown>("application.delete", { applicationId });
  }

  /**
   * Whether an application still exists. Mirrors {@link databaseExists}: the
   * `.one` query throws (typically 404) once the app is gone, so a throw is
   * read as "no longer there". Used by teardown to VERIFY a delete actually
   * took effect before removing the server it is attached to — a delete call
   * returning without error does not, on its own, prove the app is gone.
   */
  async applicationExists(applicationId: string): Promise<boolean> {
    if (!applicationId) return false;
    try {
      const app = await this.getApplication(applicationId);
      return Boolean(app?.applicationId);
    } catch {
      return false;
    }
  }

  async saveBuildType(params: SaveBuildTypeParams): Promise<void> {
    await this.mutation<unknown>("application.saveBuildType", params);
  }

  async saveEnvironment(params: SaveEnvironmentParams): Promise<void> {
    await this.mutation<unknown>("application.saveEnvironment", params);
  }

  // ─── Compose ───────────────────────────────────────────────────
  //
  // Verified end to end against a live instance: create → update (git source +
  // compose path) → loadServices → delete. Note the split, which differs from
  // applications: there is no `compose.saveGitProvider` family and no build
  // type. `compose.update` writes the git fields, and `composePath` can ONLY be
  // set there — `compose.create` ignores it and keeps the column default.

  async createCompose(params: CreateComposeParams): Promise<DokployCompose> {
    return this.mutation<DokployCompose>("compose.create", params);
  }

  async getCompose(composeId: string): Promise<DokployCompose> {
    return this.query<DokployCompose>("compose.one", { composeId });
  }

  async updateCompose(params: UpdateComposeParams): Promise<void> {
    await this.mutation<unknown>("compose.update", params);
  }

  async saveComposeEnvironment(params: SaveComposeEnvironmentParams): Promise<void> {
    await this.mutation<unknown>("compose.saveEnvironment", params);
  }

  /**
   * The service names Dokploy itself parsed out of the compose file.
   *
   * This is the authoritative list — it comes from the file after Dokploy has
   * cloned the repo and applied its own interpolation, so it is what the deploy
   * will actually run. Dockier's own parse drives the wizard (it has to work
   * before any compose resource exists); a disagreement between the two is
   * worth logging.
   *
   * `type: "fetch"` makes it CLONE the repo first, so this is a query with a
   * real side effect and a much longer runtime than any other read — measured
   * at ~5s for a 35MB repo, but a large repo on a slow link can exceed the
   * client's default 30s timeout. Callers should pass a wider one.
   *
   * Throws (404 NOT_FOUND "Services not found") when the file declares no
   * services.
   */
  async loadComposeServices(composeId: string, type: "fetch" | "cache" = "fetch"): Promise<string[]> {
    const rows = await this.query<string[]>("compose.loadServices", { composeId, type });
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * The compose file AFTER Dokploy merges in the Traefik labels for every
   * registered domain. The single best diagnostic for a compose deploy that
   * builds but serves nothing — it shows the router, the entrypoint and the
   * `loadbalancer.server.port` Traefik will actually use.
   */
  async getConvertedCompose(composeId: string): Promise<string> {
    return this.query<string>("compose.getConvertedCompose", { composeId });
  }

  async deployCompose(params: DeployComposeParams): Promise<void> {
    await this.mutation<unknown>("compose.deploy", params);
  }

  async redeployCompose(composeId: string, title?: string): Promise<void> {
    await this.mutation<unknown>("compose.redeploy", { composeId, title });
  }

  async cancelComposeDeployment(composeId: string): Promise<void> {
    await this.mutation<unknown>("compose.cancelDeployment", { composeId });
  }

  /**
   * Delete a compose stack. `deleteVolumes` defaults to false in Dokploy, which
   * would leave the stack's named volumes behind after a teardown — so teardown
   * must pass true explicitly.
   */
  async deleteCompose(composeId: string, deleteVolumes = false): Promise<void> {
    await this.mutation<unknown>("compose.delete", { composeId, deleteVolumes });
  }

  /**
   * A compose stack's deployment records. Mirrors {@link listDeployments} but
   * hits `deployment.allByCompose` — `deployment.all` takes an applicationId
   * and would reject a composeId. Best-effort: [] on any error.
   */
  async listComposeDeployments(composeId: string): Promise<DokployDeployment[]> {
    try {
      const rows = await this.query<DokployDeployment[]>("deployment.allByCompose", { composeId });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  /** Domains registered against a compose stack (any of its services). */
  async listComposeDomains(composeId: string): Promise<DokployDomain[]> {
    try {
      const rows = await this.query<DokployDomain[]>("domain.byComposeId", { composeId });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  /**
   * Whether a compose stack still exists. Mirrors {@link applicationExists}:
   * `compose.one` 404s ("Compose not found") once it is gone, so a throw reads
   * as "no longer there". Used to detect a stale mapping before reusing its id,
   * and by teardown to VERIFY a delete took effect.
   */
  async composeExists(composeId: string): Promise<boolean> {
    if (!composeId) return false;
    try {
      const compose = await this.getCompose(composeId);
      return Boolean(compose?.composeId);
    } catch {
      return false;
    }
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

  /**
   * Update an existing domain — used to fix a stale forwarding port on a reused
   * domain, which otherwise causes a Bad Gateway.
   */
  async updateDomain(params: UpdateDomainParams): Promise<void> {
    await this.mutation<unknown>("domain.update", params);
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

  /** Delete a registered domain by its domainId (route is singular: domain.delete). */
  async deleteDomain(domainId: string): Promise<void> {
    await this.mutation<unknown>("domain.delete", { domainId });
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

  // ─── Database existence checks ─────────────────────────────────
  //
  // Fetch a single service by its engine-specific id (mysql.one / postgres.one
  // / redis.one). These throw (typically 404) when the service was deleted
  // out-of-band in Dokploy — callers use that to detect a stale mapping and
  // recreate, mirroring getApplication for apps. The id parameter name differs
  // per engine, matching Dokploy's schema.

  async getMysql(mysqlId: string): Promise<DokployDatabase> {
    const raw = await this.query<Record<string, unknown>>("mysql.one", { mysqlId });
    return normalizeDatabase(raw, "mysqlId");
  }

  async getPostgres(postgresId: string): Promise<DokployDatabase> {
    const raw = await this.query<Record<string, unknown>>("postgres.one", { postgresId });
    return normalizeDatabase(raw, "postgresId");
  }

  async getRedis(redisId: string): Promise<DokployDatabase> {
    const raw = await this.query<Record<string, unknown>>("redis.one", { redisId });
    return normalizeDatabase(raw, "redisId");
  }

  // ─── Database removal ──────────────────────────────────────────
  //
  // Needed for teardown: Dokploy refuses `server.remove` while the server still
  // hosts services ("Server has active services, please delete them first"), so
  // provisioned databases must be deleted before the server.

  async deleteMysql(mysqlId: string): Promise<void> {
    await this.mutation<unknown>("mysql.remove", { mysqlId });
  }

  async deletePostgres(postgresId: string): Promise<void> {
    await this.mutation<unknown>("postgres.remove", { postgresId });
  }

  async deleteRedis(redisId: string): Promise<void> {
    await this.mutation<unknown>("redis.remove", { redisId });
  }

  /** Delete a self-hosted database service by engine + id. */
  async deleteDatabase(engine: string, databaseId: string): Promise<void> {
    if (engine === "redis") return this.deleteRedis(databaseId);
    if (engine === "postgres") return this.deletePostgres(databaseId);
    return this.deleteMysql(databaseId);
  }

  /**
   * Whether a self-hosted database service still exists in Dokploy, by engine +
   * id. Returns false on any lookup error (404 / deleted / unreachable) so a
   * dangling mapping is treated as "recreate" rather than fatal. Never throws.
   */
  async databaseExists(engine: string, databaseId: string): Promise<boolean> {
    if (!databaseId) return false;
    try {
      let svc: DokployDatabase;
      if (engine === "redis") svc = await this.getRedis(databaseId);
      else if (engine === "postgres") svc = await this.getPostgres(databaseId);
      else svc = await this.getMysql(databaseId);
      return Boolean(svc?.id);
    } catch {
      // .one throws (typically 404) when the service was deleted.
      return false;
    }
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

  // ─── Traefik middlewares: Security (Basic Auth) + Redirects ────────
  //
  // Dokploy stores these per-application and manages the Traefik middleware for
  // us: security.create makes a BasicAuth middleware (APR1-hashed) + attaches
  // it to the app's router; redirect.create makes a redirect-regex rule. We
  // read existing entries from application.one (which includes `security[]` and
  // `redirects[]`) to reconcile, and create/delete by id.

  /** Create a Basic Auth credential on an application (Traefik BasicAuth). */
  async createSecurity(params: CreateSecurityParams): Promise<DokploySecurity> {
    return this.mutation<DokploySecurity>("security.create", params);
  }

  /** Delete a Basic Auth credential by its securityId. */
  async deleteSecurity(securityId: string): Promise<void> {
    await this.mutation<unknown>("security.delete", { securityId });
  }

  /**
   * Create a redirect-regex rule on an application.
   *
   * NOTE: the tRPC route is `redirects.create` (PLURAL) — `redirect.create`
   * (singular) 404s. Verified against a live Dokploy instance. Security's route
   * is `security.create` (singular), so the two intentionally differ.
   */
  async createRedirect(params: CreateRedirectParams): Promise<DokployRedirect> {
    return this.mutation<DokployRedirect>("redirects.create", params);
  }

  /** Delete a redirect rule by its redirectId (plural route, see createRedirect). */
  async deleteRedirect(redirectId: string): Promise<void> {
    await this.mutation<unknown>("redirects.delete", { redirectId });
  }

  /**
   * Read the security + redirect entries currently attached to an application.
   * Best-effort: returns empty arrays if the app can't be read or doesn't carry
   * them, so reconciliation can still proceed (it will just create desired
   * state). Never throws.
   */
  async listAppMiddlewares(applicationId: string): Promise<{ security: DokploySecurity[]; redirects: DokployRedirect[] }> {
    try {
      const app = await this.getApplication(applicationId);
      return {
        security: Array.isArray(app?.security) ? app.security : [],
        redirects: Array.isArray(app?.redirects) ? app.redirects : [],
      };
    } catch {
      return { security: [], redirects: [] };
    }
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
    // withRetry owns the exponential backoff + attempt bookkeeping. The inner
    // function performs ONE fetch+parse and THROWS a DokployError (with the
    // right statusCode) on any failure, so the control flow is expressed via
    // the retry predicate: a 4xx (incl. the 422 non-JSON case) is
    // non-retryable, a 5xx or a thrown network error is retryable. The
    // per-attempt AbortController + this.timeout stays on the inner fetch —
    // that is the request timeout, not something withRetry replaces.
    try {
      return await withRetry<T>(
        () => this.requestOnce<T>(method, url, body, endpoint),
        {
          attempts: this.maxRetries + 1,
          backoffMs: RETRY_BASE_DELAY,
          label: endpoint || url,
          // Don't retry client errors (4xx, which includes the 429 and the
          // non-JSON-2xx→422 cases); retry 5xx and network errors.
          shouldRetry: (err) =>
            !(err instanceof DokployError && err.statusCode >= 400 && err.statusCode < 500),
        },
      );
    } catch (err) {
      // A non-retryable client error is surfaced as-is (its own message/status).
      if (err instanceof DokployError && err.statusCode >= 400 && err.statusCode < 500) {
        throw err;
      }
      // Everything else (exhausted 5xx, exhausted network error) is wrapped
      // with the attempt count — unchanged exhaustion contract.
      throw new DokployError(
        `Dokploy API request failed after ${this.maxRetries + 1} attempts: ${getErrMsg(err)}`,
        0,
        endpoint || url,
        err,
      );
    }
  }

  /** A single Dokploy request attempt. Throws a DokployError on any failure. */
  private async requestOnce<T>(method: string, url: string, body?: unknown, endpoint?: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // `finally` rather than a success-path clearTimeout: a rejected fetch
    // (network error, abort) used to leave the timer pending for the full
    // timeout on every attempt, keeping the event loop busy and holding a
    // reference to the controller after the attempt was already over.
    try {
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
          // status code so it is classified as non-retryable and throws
          // immediately instead of looping.
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
      throw new DokployError(
        `Dokploy API server error: ${response.status} ${response.statusText}`,
        response.status,
        endpoint || url,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────

/**
 * Create a DokployClient from environment configuration.
 * Throws if required env vars are not set.
 *
 * Reads the validated `env` object rather than `process.env` directly, so the
 * URL has already been through `z.string().url()` and the init-order Proxy
 * guard reports a clear error if this is called before `initConfig()`.
 */
export function createDokployClient(
  // Callers on a user-facing request path (the cancel route) need a tighter
  // bound than the default 4 attempts × 30s; everything else omits this.
  overrides?: Pick<DokployClientConfig, "timeout" | "maxRetries">,
): DokployClient {
  const baseUrl = env.DOKPLOY_API_URL;
  const apiToken = env.DOKPLOY_API_TOKEN;

  if (!baseUrl) throw new Error("DOKPLOY_API_URL is required when DEPLOY_PROVIDER=dokploy");
  if (!apiToken) throw new Error("DOKPLOY_API_TOKEN is required when DEPLOY_PROVIDER=dokploy");

  return new DokployClient({ baseUrl, apiToken, ...overrides });
}
