/**
 * Shared Domain Error → HTTP Error Mapper
 *
 * Provides a single, consistent function to map domain error codes
 * to Fastify HTTP errors across all service route files.
 *
 * Replaces the duplicated `throwDomainError` functions that existed
 * in every route module.
 */

import type { FastifyInstance } from "fastify";
import type { DomainError } from "./supabase/errors.js";

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
    app.log.error(error.cause || error, `Domain error: ${msg}`);
  } else {
    app.log.warn(error, `Domain warning: ${msg}`);
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
