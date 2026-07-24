/**
 * Base Domain Error
 *
 * All service-level domain errors extend this class.
 * Provides a consistent interface for error code classification,
 * optional cause preservation for debugging, and structured metadata
 * for observability.
 */

export type BaseDomainErrorCode =
  | "not_found"
  | "forbidden"
  | "bad_request"
  | "conflict"
  | "internal"
  | "unauthorized"
  | "precondition_failed"
  | "too_many_requests"
  | "service_unavailable";

/**
 * Structured metadata attached to domain errors for observability.
 * Logged by the error handler alongside the error message and cause.
 *
 * @example
 * ```ts
 * throw new ProjectsError("Not found", "not_found", pgError, {
 *   table: "projects",
 *   operation: "select",
 *   projectId: id,
 * });
 * ```
 */
export type ErrorMetadata = Record<string, unknown>;

export class DomainError extends Error {
  public readonly metadata?: ErrorMetadata;

  constructor(
    message: string,
    public readonly code: BaseDomainErrorCode,
    public readonly cause?: unknown,
    metadata?: ErrorMetadata,
  ) {
    super(message);
    this.name = "DomainError";
    if (metadata) this.metadata = metadata;
  }
}

// ─── Service Error Factory ─────────────────────────────────────────

/**
 * Factory that generates a typed DomainError subclass for a service domain.
 *
 * Eliminates the repetitive boilerplate of defining XError + XErrorCode
 * in every domain module. The returned class narrows `code` to the union
 * of codes the service actually uses, providing type safety at throw sites.
 *
 * @example
 * ```ts
 * export const ProjectsError = createDomainErrorClass("ProjectsError");
 * export type ProjectsError = InstanceType<typeof ProjectsError>;
 *
 * throw new ProjectsError("Not found", "not_found");
 * throw new ProjectsError("Query failed", "internal", pgError, { table: "projects" });
 * ```
 */
export function createDomainErrorClass<
  TCode extends BaseDomainErrorCode = BaseDomainErrorCode,
>(className: string) {
  class ServiceError extends DomainError {
    declare readonly code: TCode;

    constructor(message: string, code: TCode, cause?: unknown, metadata?: ErrorMetadata) {
      super(message, code, cause, metadata);
      this.name = className;
    }
  }

  // Preserve the class name for stack traces and error handler logging
  Object.defineProperty(ServiceError, "name", { value: className });

  return ServiceError as unknown as {
    new (message: string, code: string, cause?: unknown, metadata?: ErrorMetadata): DomainError & { readonly code: TCode };
    prototype: DomainError;
  };
}
