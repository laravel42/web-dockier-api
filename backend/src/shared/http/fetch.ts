/**
 * Shared fetch helpers with a built-in timeout.
 *
 * Outbound calls to third-party provider APIs (project-management providers,
 * git hosts, Dokploy) previously used a bare `fetch` with no timeout, so a
 * hung or slow upstream could pin a request/worker indefinitely. These helpers
 * attach an `AbortSignal.timeout(...)` to every call and merge it with any
 * caller-supplied signal, so either the timeout or the caller can abort.
 *
 * Streaming/SSE and intentionally long-running CDN status polls do NOT belong
 * here — they are meant to run long and should keep their own signals.
 */

/** Default per-request timeout for outbound provider/API calls. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/** `RequestInit` plus a non-standard `timeoutMs` override (stripped before `fetch`). */
export type FetchWithTimeoutInit = RequestInit & { timeoutMs?: number };

/**
 * `fetch` with an abort-on-timeout signal.
 *
 * Builds a timeout signal from `timeoutMs` (default {@link DEFAULT_FETCH_TIMEOUT_MS}).
 * If the caller also passes `init.signal`, both are merged with
 * `AbortSignal.any([...])` so either can abort the request. The non-standard
 * `timeoutMs` field is removed before the native `fetch` call.
 *
 * A timeout/abort surfaces as a thrown error (the native `fetch` rejection).
 */
export async function fetchWithTimeout(
  url: string | URL,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal: callerSignal, ...rest } = init;

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;

  return fetch(url, { ...rest, signal });
}

/**
 * `fetchWithTimeout` that parses a JSON body.
 *
 * Contract:
 * - Returns `null` for a non-OK HTTP status (`!res.ok`). Callers that treat a
 *   failed upstream call as "no data" (the provider list-call shape) can use
 *   `?? empty` / `if (!data)` without inspecting the status.
 * - A network failure, timeout, or abort propagates as a thrown error.
 * - A 2xx response with an unparseable body throws (JSON parse error).
 */
export async function fetchJson<T>(
  url: string | URL,
  init: FetchWithTimeoutInit = {},
): Promise<T | null> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) return null;
  return (await res.json()) as T;
}
