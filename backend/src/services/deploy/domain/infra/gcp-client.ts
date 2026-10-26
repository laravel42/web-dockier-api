/**
 * Structured GCP API client.
 *
 * Wraps raw fetch() calls with consistent error handling, retry logic,
 * and GCP-specific error code interpretation. All GCP API interactions
 * in the deploy service should go through this client.
 */

import { createSign } from "node:crypto";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { withRetry } from "../../../../shared/utils/retry.js";

// ─── Error Types ────────────────────────────────────────────────────

export class GcpApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly gcpErrorCode?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "GcpApiError";
  }

  /** Whether this error indicates the resource already exists (safe to ignore). */
  get isAlreadyExists(): boolean {
    return this.statusCode === 409;
  }

  /** Whether this error indicates the resource was not found (safe to ignore for deletes). */
  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  /** Whether this error is transient and may succeed on retry. */
  get isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

/**
 * Internal sentinel used by `GcpClient.request` to drive `withRetry`. A
 * retryable 429/5xx response is thrown wrapped in this so withRetry retries it,
 * yet after exhaustion the caller can recover and RETURN the underlying
 * response — preserving the original loop's "return the last 5xx response"
 * contract (as opposed to a genuine fetch error, which propagates).
 */
class RetryableResponse extends Error {
  constructor(public readonly response: Response) {
    super(`GCP API returned ${response.status}`);
    this.name = "RetryableResponse";
  }
}

// ─── Types ──────────────────────────────────────────────────────────

export interface GcpClientConfig {
  /** Maximum number of retry attempts for transient failures. Default: 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 2000 */
  baseDelayMs?: number;
  /** Request timeout in ms. Default: 30000 (30 seconds) */
  requestTimeoutMs?: number;
}

interface GcpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | object;
  /** Skip retry logic for this request. */
  noRetry?: boolean;
  /** Override the default request timeout (ms) for this specific request. */
  timeoutMs?: number;
}

// ─── Client ─────────────────────────────────────────────────────────

export class GcpClient {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly requestTimeoutMs: number;
  private readonly accessToken: string;
  private readonly projectId: string;

  constructor(
    accessToken: string,
    projectId: string,
    config: GcpClientConfig = {},
  ) {
    this.accessToken = accessToken;
    this.projectId = projectId;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 2000;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
  }

  /** The GCP project ID this client is configured for. */
  getProjectId(): string {
    return this.projectId;
  }

  /** The access token this client uses for authentication. */
  getAccessToken(): string {
    return this.accessToken;
  }

  // ─── Core HTTP ──────────────────────────────────────────────────

  /**
   * Make an authenticated request to a GCP API endpoint.
   * Handles retries with exponential backoff for transient errors.
   */
  async request(url: string, opts: GcpRequestOptions = {}): Promise<Response> {
    const { method = "GET", headers = {}, body, noRetry, timeoutMs } = opts;
    const maxAttempts = noRetry ? 1 : this.maxRetries;
    const timeout = timeoutMs ?? this.requestTimeoutMs;

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...headers,
      },
    };

    if (body) {
      if (typeof body === "object") {
        init.body = JSON.stringify(body);
        (init.headers as Record<string, string>)["Content-Type"] = "application/json";
      } else {
        init.body = body;
      }
    }

    // withRetry models the exponential backoff + attempt bookkeeping. The
    // status-based control flow is preserved by having the inner function
    // RETURN the response for terminal cases (success, or a 4xx the caller
    // handles) and THROW for retryable ones:
    //   - a retryable 429/5xx throws a RetryableResponse sentinel carrying the
    //     Response, so after exhaustion we can RETURN that last response
    //     (unchanged contract: an exhausted 429/5xx is returned, not thrown);
    //   - a genuine fetch/network error throws normally and, on exhaustion,
    //     propagates (unchanged contract: thrown).
    // The per-request AbortSignal.timeout stays on the inner fetch; backoffMs
    // and attempt count match the previous loop (this.baseDelayMs, maxAttempts).
    try {
      return await withRetry<Response>(
        async () => {
          // Signal built per attempt: a single one hoisted out of this closure
          // is already aborted once the first attempt times out, so every
          // retry then failed instantly with AbortError instead of retrying.
          const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });

          // Don't retry client errors (except 429) — let the caller handle 4xx.
          if (!res.ok && res.status !== 429 && res.status < 500) {
            return res;
          }

          // Retry on 429 or 5xx: throw a sentinel carrying the response so an
          // exhausted retry can still return it.
          if (!res.ok) {
            throw new RetryableResponse(res);
          }

          return res;
        },
        {
          attempts: maxAttempts,
          backoffMs: this.baseDelayMs,
          label: "gcp-request",
        },
      );
    } catch (err: unknown) {
      // An exhausted 429/5xx is returned (not thrown), matching the old loop.
      if (err instanceof RetryableResponse) return err.response;
      throw err instanceof Error ? err : new Error(getErrMsg(err));
    }
  }

  /**
   * Make a request and parse the JSON response.
   * Throws GcpApiError on non-2xx responses.
   */
  async requestJson<T = unknown>(url: string, opts: GcpRequestOptions = {}): Promise<T> {
    const res = await this.request(url, opts);
    const text = await res.text();

    if (!res.ok) {
      let gcpErrorCode: string | undefined;
      let details: unknown;
      try {
        const parsed = JSON.parse(text);
        gcpErrorCode = parsed?.error?.status || parsed?.error?.code?.toString();
        details = parsed?.error;
      } catch { /* not JSON */ }

      throw new GcpApiError(
        `GCP API ${opts.method || "GET"} ${url} failed: ${res.status} ${text.slice(0, 200)}`,
        res.status,
        gcpErrorCode,
        details,
      );
    }

    return text ? JSON.parse(text) : ({} as T);
  }

  // ─── Service Usage ────────────────────────────────────────────────

  /** Enable one or more GCP APIs (idempotent). Runs in parallel for performance. */
  async enableApis(apis: string[]): Promise<void> {
    await Promise.all(apis.map(async (apiName) => {
      try {
        await this.request(
          `https://serviceusage.googleapis.com/v1/projects/${this.projectId}/services/${apiName}:enable`,
          { method: "POST", body: {} },
        );
      } catch {
        // Best effort — API may already be enabled or permission denied
      }
    }));
  }

  // ─── Artifact Registry ────────────────────────────────────────────

  /**
   * Create an Artifact Registry Docker repository (idempotent).
   * Returns whether the repo was newly created.
   */
  async ensureArtifactRegistryRepo(
    region: string,
    repoName: string,
  ): Promise<{ created: boolean; error?: string }> {
    try {
      const res = await this.request(
        `https://artifactregistry.googleapis.com/v1/projects/${this.projectId}/locations/${region}/repositories?repositoryId=${repoName}`,
        { method: "POST", body: { format: "DOCKER" } },
      );

      if (res.ok) {
        // Poll until accessible (check immediately, then every 5s)
        for (let i = 0; i < 12; i++) {
          const checkRes = await this.request(
            `https://artifactregistry.googleapis.com/v1/projects/${this.projectId}/locations/${region}/repositories/${repoName}`,
            { noRetry: true },
          );
          if (checkRes.ok) break;
          if (i < 11) await new Promise(r => setTimeout(r, 5_000));
        }
        return { created: true };
      } else if (res.status === 409) {
        return { created: false }; // already exists
      } else {
        const body = await res.text();
        return { created: false, error: `${res.status} ${body.slice(0, 200)}` };
      }
    } catch (e: unknown) {
      return { created: false, error: getErrMsg(e) };
    }
  }

  // ─── Compute Engine ───────────────────────────────────────────────

  /**
   * Create a Compute Engine VM instance.
   *
   * Returns the name of the zonal operation that must be polled to completion
   * (see `waitForZoneOperation`). Treats a 409 (already exists) as success.
   */
  async createInstance(zone: string, params: {
    name: string;
    machineType: string;
    sourceImage: string;
    /** SSH key material as GCP metadata value, e.g. "root:ssh-ed25519 AAAA...". */
    sshKeys: string;
    /** Root disk size in GB. Default 30. */
    diskSizeGb?: number;
    /** Network tags (used to target firewall rules). */
    tags?: string[];
    /** Extra labels applied to the instance. */
    labels?: Record<string, string>;
  }): Promise<{ operationName: string; alreadyExists: boolean }> {
    const diskSizeGb = params.diskSizeGb ?? 30;
    const body = {
      name: params.name,
      machineType: `zones/${zone}/machineTypes/${params.machineType}`,
      disks: [{
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: params.sourceImage,
          diskSizeGb: String(diskSizeGb),
          diskType: `zones/${zone}/diskTypes/pd-balanced`,
        },
      }],
      networkInterfaces: [{
        network: "global/networks/default",
        // An empty accessConfig block requests an ephemeral external IP (NAT).
        accessConfigs: [{ type: "ONE_TO_ONE_NAT", name: "External NAT" }],
      }],
      metadata: {
        items: [{ key: "ssh-keys", value: params.sshKeys }],
      },
      tags: params.tags ? { items: params.tags } : undefined,
      labels: { "managed-by": "dockier", ...(params.labels ?? {}) },
    };

    try {
      const op = await this.requestJson<{ name: string }>(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/zones/${zone}/instances`,
        { method: "POST", body },
      );
      return { operationName: op.name, alreadyExists: false };
    } catch (err) {
      if (err instanceof GcpApiError && err.isAlreadyExists) {
        return { operationName: "", alreadyExists: true };
      }
      throw err;
    }
  }

  /**
   * Ensure a firewall rule exists opening the given TCP ports (idempotent).
   * Applies to instances carrying `targetTag` (or all instances if omitted).
   */
  async ensureFirewallRule(params: {
    name: string;
    ports: string[];
    targetTag?: string;
  }): Promise<void> {
    const body = {
      name: params.name,
      network: "global/networks/default",
      direction: "INGRESS",
      sourceRanges: ["0.0.0.0/0"],
      allowed: [{ IPProtocol: "tcp", ports: params.ports }],
      targetTags: params.targetTag ? [params.targetTag] : undefined,
    };

    try {
      await this.requestJson(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/global/firewalls`,
        { method: "POST", body },
      );
    } catch (err) {
      // A rule with this name already exists — good enough (idempotent).
      if (err instanceof GcpApiError && err.isAlreadyExists) return;
      throw err;
    }
  }

  /**
   * Poll a zonal operation until it reaches DONE (or a timeout elapses).
   * Throws if the operation completes with an error.
   */
  async waitForZoneOperation(
    zone: string,
    operationName: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<void> {
    const timeoutMs = opts.timeoutMs ?? 180_000;
    const intervalMs = opts.intervalMs ?? 3_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const op = await this.requestJson<{
        status?: string;
        error?: { errors?: Array<{ message?: string }> };
      }>(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/zones/${zone}/operations/${operationName}`,
        { noRetry: true },
      );

      if (op.status === "DONE") {
        const opError = op.error?.errors?.[0]?.message;
        if (opError) throw new GcpApiError(`GCP operation failed: ${opError}`, 500);
        return;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new GcpApiError(`GCP operation ${operationName} did not complete within ${Math.round(timeoutMs / 1000)}s`, 504);
  }

  /**
   * List UP (available) zone names within a region, ordered by preference.
   *
   * Compute Engine zone names look like "us-central1-a". We prefer the -b/-c/-f
   * suffixes (historically better capacity than -a) but return whatever is UP.
   * Returns [] if the lookup fails so callers can fall back to a default.
   */
  async listAvailableZones(region: string): Promise<string[]> {
    try {
      const data = await this.requestJson<{
        items?: Array<{ name: string; status: string; region: string }>;
      }>(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/zones`,
        { noRetry: true },
      );

      const zones = (data.items ?? [])
        .filter((z) => z.status === "UP" && z.name.startsWith(`${region}-`))
        .map((z) => z.name);

      const rank = (name: string): number => {
        const suffix = name.slice(name.lastIndexOf("-") + 1);
        const order = ["b", "c", "f", "d", "a"];
        const idx = order.indexOf(suffix);
        return idx === -1 ? order.length : idx;
      };
      return zones.sort((a, b) => rank(a) - rank(b));
    } catch {
      return [];
    }
  }

  /**
   * Read a Compute Engine instance's external (NAT) IP address.
   * Returns null if the instance has no external IP yet.
   */
  async getInstanceExternalIp(zone: string, instanceName: string): Promise<string | null> {
    const data = await this.requestJson<{
      networkInterfaces?: Array<{ accessConfigs?: Array<{ natIP?: string }> }>;
    }>(
      `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/zones/${zone}/instances/${instanceName}`,
      { noRetry: true },
    );
    return data.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? null;
  }

  /** Delete a Compute Engine instance by name (idempotent — ignores 404). */
  async deleteInstance(zone: string, instanceName: string): Promise<boolean> {
    try {
      const res = await this.request(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/zones/${zone}/instances/${instanceName}`,
        { method: "DELETE" },
      );
      return res.ok || res.status === 404;
    } catch {
      return false;
    }
  }

  /** Delete a Compute Engine firewall rule by name (idempotent — ignores 404). */
  async deleteFirewall(firewallName: string): Promise<boolean> {
    try {
      const res = await this.request(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/global/firewalls/${firewallName}`,
        { method: "DELETE" },
      );
      return res.ok || res.status === 404;
    } catch {
      return false;
    }
  }

  /** Delete a Compute Engine static IP address by name (idempotent — ignores 404). */
  async deleteAddress(region: string, addressName: string): Promise<boolean> {
    try {
      const res = await this.request(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/regions/${region}/addresses/${addressName}`,
        { method: "DELETE" },
      );
      return res.ok || res.status === 404;
    } catch {
      return false;
    }
  }

  /** Find a Compute Engine instance by name across all zones. */
  async findInstance(instanceName: string): Promise<{ zone: string; name: string } | null> {
    try {
      const data = await this.requestJson<{
        items?: Record<string, { instances?: Array<{ zone: string; name: string }> }>;
      }>(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/aggregated/instances?filter=name="${instanceName}"`,
      );

      for (const [scopeKey, scope] of Object.entries(data.items || {})) {
        for (const inst of scope.instances || []) {
          if (inst.name === instanceName) {
            return { zone: scopeKey.replace("zones/", ""), name: inst.name };
          }
        }
      }
    } catch {
      // Instance may not exist
    }
    return null;
  }

  /** Check if a Compute Engine instance exists in a specific zone. */
  async instanceExists(zone: string, instanceName: string): Promise<boolean> {
    try {
      const res = await this.request(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/zones/${zone}/instances/${instanceName}`,
        { noRetry: true },
      );
      return res.status !== 404;
    } catch {
      return false;
    }
  }

  /** Check if a firewall rule exists. */
  async firewallExists(firewallName: string): Promise<boolean> {
    try {
      const res = await this.request(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/global/firewalls/${firewallName}`,
        { noRetry: true },
      );
      return res.status !== 404;
    } catch {
      return false;
    }
  }

  /** Check if a static IP address exists. */
  async addressExists(region: string, addressName: string): Promise<boolean> {
    try {
      const res = await this.request(
        `https://compute.googleapis.com/compute/v1/projects/${this.projectId}/regions/${region}/addresses/${addressName}`,
        { noRetry: true },
      );
      return res.status !== 404;
    } catch {
      return false;
    }
  }
}

// ─── Factory Functions ──────────────────────────────────────────────

/**
 * Get a GCP access token from a service account JSON key.
 * Centralizes the JWT → OAuth2 token exchange.
 */
export async function getGcpAccessToken(
  serviceAccountKey: string,
  scope = "https://www.googleapis.com/auth/cloud-platform",
): Promise<string> {
  const saKey = JSON.parse(serviceAccountKey || "{}");
  if (!saKey.client_email || !saKey.private_key) return "";

  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const jwtClaim = Buffer.from(JSON.stringify({
    iss: saKey.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");
  const signInput = `${jwtHeader}.${jwtClaim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = signer.sign(saKey.private_key, "base64url");

  // Use raw fetch for the token exchange (no Bearer token needed). The per-
  // request AbortSignal.timeout(30s) stays on the inner fetch — withRetry only
  // replaces the attempt bookkeeping and backoff, not the per-attempt timeout.
  return withRetry<string>(
    async () => {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signInput}.${signature}`,
        signal: AbortSignal.timeout(30_000),
      });

      // Throw on transient errors so withRetry catches and retries them.
      if (tokenRes.status === 429 || tokenRes.status >= 500) {
        throw new Error(`GCP token exchange failed (transient): ${tokenRes.status}`);
      }

      // Non-retryable errors (400, 401, 403) — credentials are invalid.
      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        throw new Error(`GCP token exchange failed: ${tokenRes.status} ${body.slice(0, 200)}`);
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string };
      return tokenData.access_token || "";
    },
    {
      attempts: 3,
      backoffMs: 2_000,
      label: "gcp-token-exchange",
      // Same transient predicate as before: retry transient/timeout/network
      // errors, but not the explicit non-retryable "GCP token exchange failed"
      // auth error.
      shouldRetry: (err) => {
        const msg = getErrMsg(err);
        const isTimeout = err instanceof Error && err.name === "TimeoutError";
        return msg?.includes("(transient)") || isTimeout || !msg?.includes("GCP token exchange failed");
      },
    },
  );
}

/** Extract the GCP project ID from a service account JSON key. */
export function getGcpProjectId(serviceAccountKey: string): string {
  try {
    return JSON.parse(serviceAccountKey || "{}").project_id || "";
  } catch {
    return "";
  }
}

/**
 * Create a GcpClient from a service account JSON key.
 * Handles token exchange and project ID extraction in one call.
 */
export async function createGcpClient(
  serviceAccountKey: string,
  config?: GcpClientConfig,
): Promise<GcpClient> {
  const projectId = getGcpProjectId(serviceAccountKey);
  if (!projectId) {
    throw new Error("Could not determine GCP project ID from service account key");
  }

  const accessToken = await getGcpAccessToken(serviceAccountKey);
  if (!accessToken) {
    throw new Error("Failed to get GCP access token from service account key");
  }

  return new GcpClient(accessToken, projectId, config);
}
