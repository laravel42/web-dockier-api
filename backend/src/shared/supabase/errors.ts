/**
 * Base Domain Error
 *
 * All service-level domain errors extend this class.
 * Provides a consistent interface for error code classification
 * and optional cause preservation for debugging.
 */

export type BaseDomainErrorCode =
  | "not_found"
  | "forbidden"
  | "bad_request"
  | "conflict"
  | "internal"
  | "unauthorized"
  | "precondition_failed";

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: BaseDomainErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
