/**
 * Shared Domain Error → HTTP Error Mapper
 *
 * Provides a single, consistent function to map domain error codes
 * to Fastify HTTP errors across all service route files.
 *
 * Also exports `withDomainErrors` — a route handler wrapper that
 * automatically catches DomainError instances and maps them to HTTP errors,
 * eliminating repetitive try/catch blocks in every route handler.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DomainError } from "./supabase/errors.js";

/**
 * Map a DomainError to the appropriate Fastify HTTP error and throw it.
 *
 * - Internal errors are logged at `error` level with cause details.
 * - All other codes are logged at `warn` level.
 * - Internal errors return a generic message to avoid leaking implementation details.
 */
export function throwDomainError(app: FastifyInstance, error: DomainError): never {
  const msg = error.message;

  if (error.code === "internal") {
    app.log.error({ err: error, cause: error.cause }, `Domain error: ${msg}`);
  } else {
    app.log.warn({ err: error, cause: error.cause }, `Domain warning: ${msg}`);
  }

  switch (error.code) {
    case "not_found":
      throw app.httpErrors.notFound(msg);
    case "forbidden":
      throw app.httpErrors.forbidden(msg);
    case "bad_request":
      throw app.httpErrors.badRequest(msg);
    case "conflict":
      throw app.httpErrors.conflict(msg);
    case "unauthorized":
      throw app.httpErrors.unauthorized(msg);
    case "precondition_failed":
      throw app.httpErrors.preconditionFailed(msg);
    case "internal":
      throw app.httpErrors.internalServerError("An internal server error occurred");
    default:
      throw app.httpErrors.internalServerError("An unexpected error occurred");
  }
}

/**
 * Wrap a route handler to automatically catch DomainError instances
 * and map them to the appropriate HTTP error response.
 *
 * Eliminates the repetitive try/catch pattern:
 * ```ts
 * // Before:
 * async (request) => {
 *   try { return await doSomething(); }
 *   catch (err) { if (err instanceof XxxError) throwDomainError(app, err); throw err; }
 * }
 *
 * // After:
 * withDomainErrors(app, async (request) => {
 *   return await doSomething();
 * })
 * ```
 */
export function withDomainErrors<Req extends FastifyRequest, Reply extends FastifyReply, T>(
  app: FastifyInstance,
  handler: (request: Req, reply: Reply) => Promise<T>,
): (request: Req, reply: Reply) => Promise<T> {
  return async (request: Req, reply: Reply): Promise<T> => {
    try {
      return await handler(request, reply);
    } catch (err) {
      if (err instanceof DomainError) {
        throwDomainError(app, err);
      }
      throw err;
    }
  };
}

/**
 * Register a global Fastify error handler that catches DomainError instances
 * and maps them to the appropriate HTTP error responses.
 *
 * With this registered, route handlers no longer need try/catch blocks
 * for domain errors — they can simply let errors propagate naturally.
 *
 * Non-DomainError instances are passed through to Fastify's default error handling.
 */
export function registerDomainErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error, request, reply) => {
    // Only intercept DomainError instances — map them to HTTP responses.
    // All other errors (Fastify HTTP errors, validation errors, unknown errors)
    // fall through to standard handling below.
    if (error instanceof DomainError) {
      const msg = error.message;

      if (error.code === "internal") {
        request.log.error({ err: error, cause: error.cause }, `Domain error: ${msg}`);
      } else {
        request.log.warn({ err: error, cause: error.cause }, `Domain warning: ${msg}`);
      }

      switch (error.code) {
        case "not_found":
          return reply.notFound(msg);
        case "forbidden":
          return reply.forbidden(msg);
        case "bad_request":
          return reply.badRequest(msg);
        case "conflict":
          return reply.conflict(msg);
        case "unauthorized":
          return reply.unauthorized(msg);
        case "precondition_failed":
          return reply.preconditionFailed(msg);
        case "internal":
          return reply.internalServerError("An internal server error occurred");
        default:
          return reply.internalServerError("An unexpected error occurred");
      }
    }

    // For Fastify HTTP errors (from @fastify/sensible) and validation errors,
    // preserve their status code and send the standard error response shape.
    // Log at warn level for client errors (4xx), error level for server errors (5xx).
    const statusCode = (error as any).statusCode as number | undefined;
    if (statusCode) {
      if (statusCode >= 500) {
        request.log.error({ err: error }, error.message);
      } else {
        request.log.warn({ err: error }, error.message);
      }

      // Preserve validation details for schema validation errors
      const validation = (error as any).validation;
      const validationContext = (error as any).validationContext;
      if (validation) {
        return reply.status(statusCode).send({
          statusCode,
          error: "Bad Request",
          message: error.message,
          validation,
          validationContext,
        });
      }

      return reply.status(statusCode).send({
        statusCode,
        error: error.name,
        message: error.message,
      });
    }

    // Truly unexpected errors without a statusCode — log and return 500
    request.log.error({ err: error }, "Unhandled error");
    return reply.internalServerError("An unexpected error occurred");
  });
}
