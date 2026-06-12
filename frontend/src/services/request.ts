import { clearSession, getToken, notifySessionExpired } from "./session";
import { ApiError } from "./api-error";

const API_BASE = import.meta.env.VITE_API_BASE || "";

/** Default request timeout in milliseconds (30 seconds). */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Max retries for transient server errors on idempotent requests. */
const MAX_RETRIES = 2;

/** Status codes eligible for retry. */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/** HTTP methods safe to retry (idempotent). */
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Wait for a duration with exponential backoff.
 * Attempt 0 → 1000ms, attempt 1 → 2000ms.
 */
function backoffDelay(attempt: number): Promise<void> {
  const ms = 1000 * 2 ** attempt;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RequestOptions extends RequestInit {
  /** Request timeout in ms. Defaults to 30s. Set to 0 to disable. */
  timeout?: number;
  /** Disable automatic retry for this request. */
  noRetry?: boolean;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT_MS, noRetry = false, ...fetchOptions } = options;
  const method = (fetchOptions.method || "GET").toUpperCase();
  const canRetry = !noRetry && RETRYABLE_METHODS.has(method);

  const token = getToken();
  const headers: Record<string, string> = {
    ...(fetchOptions.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Allow callers to strip Authorization by setting it to empty
  if (!headers.Authorization) delete headers.Authorization;

  let lastError: ApiError | undefined;

  const maxAttempts = canRetry ? 1 + MAX_RETRIES : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait before retry (not on first attempt)
    if (attempt > 0) {
      await backoffDelay(attempt - 1);
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(`${API_BASE}${path}`, { ...fetchOptions, headers }, timeout);
    } catch (err) {
      // Network or timeout error
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      lastError = new ApiError(
        isTimeout
          ? "Request timed out. Please check your connection and try again."
          : "Network error — unable to reach the server.",
        0,
        isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        true,
      );

      // Retry network errors on idempotent requests
      if (canRetry && attempt < maxAttempts - 1) continue;
      throw lastError;
    }

    // 401 — session expired, no retry
    if (res.status === 401) {
      const hadToken = !!token;
      clearSession();
      if (hadToken) notifySessionExpired();
      throw new ApiError(
        "Your session is invalid or expired. Please sign in again.",
        401,
        "UNAUTHORIZED",
      );
    }

    // Retryable server error
    if (RETRYABLE_STATUSES.has(res.status) && canRetry && attempt < maxAttempts - 1) {
      lastError = new ApiError(
        `Server error (${res.status}). Retrying...`,
        res.status,
      );
      continue;
    }

    // Other errors
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(
        body.message || `Request failed (${res.status})`,
        res.status,
        body.code,
      );
    }

    // Success
    return res.json() as Promise<T>;
  }

  // Should not reach here, but satisfy TypeScript
  throw lastError ?? new ApiError("Request failed", 0);
}

/**
 * Fetch with an AbortController-based timeout.
 * Timeout of 0 means no timeout (raw fetch behavior).
 * If the caller provides a signal, both the caller's abort and the timeout abort are respected.
 */
function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (timeoutMs <= 0) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // If the caller provided a signal, forward its abort to our controller
  const callerSignal = init.signal;
  let onCallerAbort: (() => void) | undefined;

  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      onCallerAbort = () => controller.abort();
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    // Clean up listener to prevent memory leak if caller's signal outlives this request
    if (onCallerAbort && callerSignal) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  });
}
