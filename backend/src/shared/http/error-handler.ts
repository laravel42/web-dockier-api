/**
 * Shared Domain Error → HTTP Error Mapper
 *
 * Registers a single global Fastify error handler that maps domain error
 * codes to consistent HTTP error responses across all service route files.
 */

import type { FastifyError, FastifyInstance } from "fastify";
import { DomainError } from "../supabase/errors.js";

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
        request.log.error({ err: error, cause: error.cause, metadata: error.metadata }, `Domain error: ${msg}`);
      } else {
        request.log.warn({ err: error, cause: error.cause, metadata: error.metadata }, `Domain warning: ${msg}`);
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
        case "too_many_requests":
          return reply.tooManyRequests(msg);
        case "service_unavailable":
          return reply.serviceUnavailable(msg);
        case "internal":
          return reply.internalServerError("An internal server error occurred");
        default: {
          const _exhaustive: never = error.code;
          return reply.internalServerError("An unexpected error occurred");
        }
      }
    }

    // For Fastify HTTP errors (from @fastify/sensible) and validation errors,
    // preserve their status code and send the standard error response shape.
    // Log at warn level for client errors (4xx), error level for server errors (5xx).
    const fastifyError = error as FastifyError;
    const statusCode = fastifyError.statusCode;
    if (statusCode) {
      if (statusCode >= 500) {
        request.log.error({ err: error }, error.message);
      } else {
        request.log.warn({ err: error }, error.message);
      }

      // Preserve validation details for schema validation errors
      const validation = fastifyError.validation;
      const validationContext = fastifyError.validationContext;
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
