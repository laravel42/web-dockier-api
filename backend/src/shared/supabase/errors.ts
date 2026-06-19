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
  | "precondition_failed"
  | "service_unavailable";

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
 * ```
 */
export function createDomainErrorClass<
  TCode extends BaseDomainErrorCode = BaseDomainErrorCode,
>(className: string) {
  class ServiceError extends DomainError {
    declare readonly code: TCode;

    constructor(message: string, code: TCode, cause?: unknown) {
      super(message, code, cause);
      this.name = className;
    }
  }

  // Preserve the class name for stack traces and error handler logging
  Object.defineProperty(ServiceError, "name", { value: className });

  return ServiceError as unknown as {
    new (message: string, code: string, cause?: unknown): DomainError & { readonly code: TCode };
    prototype: DomainError;
  };
}
