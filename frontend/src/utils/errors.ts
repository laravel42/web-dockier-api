import { ApiError } from "../services/api-error";

/**
 * Extract a user-facing message from an unknown thrown value.
 *
 * ApiError-aware: provides better defaults for network errors, rate limits,
 * and timeouts without requiring callers to import ApiError directly.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiError) {
    // Synthetic network/timeout errors carry no useful server message.
    if (err.isNetworkError) {
      if (err.isTimeout) return "Request timed out. Please try again.";
      return "Network error — check your connection and try again.";
    }
    // Prefer a specific server-provided message over generic fallbacks.
    // The request layer uses "Request failed (NNN)" as a placeholder when the
    // backend returns no message, so treat that as "no real message".
    if (err.message && !err.message.startsWith("Request failed (")) {
      return err.message;
    }
    if (err.isRateLimit) return "Too many requests. Please wait a moment and try again.";
    return err.message || fallback;
  }

  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/**
 * Type guard to check if an error is an ApiError.
 * Useful for callers that want structured access without importing ApiError.
 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
