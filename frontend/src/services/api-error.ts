/**
 * Structured API error with HTTP status, optional backend error code,
 * and convenience getters for programmatic error handling.
 *
 * Extends Error so existing `catch (err) { (err as Error).message }` patterns
 * continue to work without changes.
 */
export class ApiError extends Error {
  override readonly name = "ApiError";

  /** HTTP status code. 0 for network/timeout errors. */
  readonly status: number;
  /** Backend error code if provided (e.g., "FST_ERR_VALIDATION"). */
  readonly code: string | undefined;
  /** True when the error is a network-level failure (offline, DNS, CORS). */
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    status: number,
    code?: string,
    isNetworkError = false,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.isNetworkError = isNetworkError;
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isTimeout(): boolean {
    return this.code === "TIMEOUT";
  }
}
