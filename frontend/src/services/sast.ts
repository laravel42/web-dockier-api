import { request } from "./request";
import { buildQuery } from "./query";
import type {
  CodeQLSettings, EngineName, EngineSettings, SastFindingsPage, SastHealth,
  SastRunResponse, SastScanOptions, SastScanState, SastSeverity, SonarQubeSettings,
} from "../types/sast";

/**
 * Client for the SAST workers service.
 *
 * This service runs separately from the Fastify gateway (see
 * `code-analysis/workers/docker-compose.yml`), so requests go to its own base
 * URL. They still flow through the shared `request()` helper, which attaches the
 * tenant JWT and handles timeouts, retries and 401 session expiry — the workers
 * verify that same token and scope every query to the tenant in it.
 *
 * `VITE_SAST_API_BASE` must be set for these calls to reach anything. When it is
 * empty they fall back to the gateway base, which is the right behaviour if the
 * service is exposed behind a path prefix on the same origin.
 */
const SAST_BASE = import.meta.env.VITE_SAST_API_BASE || "";

/** Scans can take minutes; only the polling reads use the default timeout. */
const RUN_TIMEOUT_MS = 60_000;

export const sastApi = {
  /** Enqueue a scan. Returns once the job is durably queued, not when it finishes. */
  runScan: (scanId: string, options?: SastScanOptions) =>
    request<SastRunResponse>(`/sast/scans/${encodeURIComponent(scanId)}/run`, {
      method: "POST",
      body: JSON.stringify({ options: options ?? {} }),
      baseUrl: SAST_BASE,
      timeout: RUN_TIMEOUT_MS,
    }),

  /** Current status, summary, per-engine outcome and live progress. */
  getScan: (scanId: string, signal?: AbortSignal) =>
    request<SastScanState>(`/sast/scans/${encodeURIComponent(scanId)}`, {
      baseUrl: SAST_BASE,
      signal,
    }),

  /**
   * Findings for a scan.
   *
   * Suppressed findings are excluded unless `includeSuppressed` is set — that
   * flag is how a reviewer audits what the LLM filter removed.
   */
  listFindings: (
    scanId: string,
    options?: {
      severity?: SastSeverity;
      includeSuppressed?: boolean;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ) =>
    request<SastFindingsPage>(
      `/sast/scans/${encodeURIComponent(scanId)}/findings${buildQuery({
        severity: options?.severity,
        // buildQuery documents this form for flags that should only appear when true.
        includeSuppressed: options?.includeSuppressed ? "true" : undefined,
        limit: options?.limit,
        offset: options?.offset,
      })}`,
      { baseUrl: SAST_BASE, signal },
    ),

  /** Liveness and queue depth. Unauthenticated. */
  health: () =>
    request<SastHealth>("/sast/health", { baseUrl: SAST_BASE }),

  /**
   * Per-engine configuration for the current tenant.
   *
   * A tenant with nothing stored gets fully-populated defaults, so callers
   * never have to reason about partially-configured engines.
   */
  getSettings: (signal?: AbortSignal) =>
    request<EngineSettings>("/sast/settings", { baseUrl: SAST_BASE, signal }),

  /**
   * Replace one engine's configuration.
   *
   * The body must not contain a token, secret, password or apiKey — the service
   * returns 422 SECRET_NOT_ALLOWED rather than storing a credential.
   */
  saveSettings: <E extends EngineName>(
    engine: E,
    config: E extends "sonarqube" ? SonarQubeSettings : CodeQLSettings,
  ) =>
    request<{ engine: E; config: EngineSettings[E] }>(
      `/sast/settings/${engine}`,
      { method: "PUT", body: JSON.stringify(config), baseUrl: SAST_BASE },
    ),
};
