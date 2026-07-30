import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config.js";
import type { ResolvedAuth } from "../permissions/authorization.js";

export type AuthContext = {
  userId: string;
  email: string;
  tenantId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }

  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Create an error with a statusCode property that Fastify's error handler
 * will interpret as an HTTP response code.
 */
function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

/**
 * Extract the authenticated context from a request, throwing if missing.
 *
 * Prefers `request.resolvedAuth` (set by `requirePermission` / `requireOwner`)
 * over the basic `request.auth` (set by `requireAuth`). This means route handlers
 * behind permission middleware automatically get the richer context without an
 * extra lookup.
 *
 * Throws a proper 401 HTTP error instead of a raw Error when auth is missing,
 * so the global error handler maps it correctly.
 */
export function getAuth(request: FastifyRequest): AuthContext {
  if (request.resolvedAuth) return request.resolvedAuth;
  if (request.auth) return request.auth;
  throw httpError(401, "Auth context missing — ensure requireAuth or requirePermission middleware runs before this handler");
}

/**
 * Extract the fully-resolved auth context (with permissions, role, hierarchy).
 *
 * Use this in route handlers that need access to permissions or hierarchy level
 * and sit behind `requirePermission` or `requireOwner` middleware.
 *
 * Throws 401 if auth context is entirely missing, or 500 if the route is
 * misconfigured (using requireAuth instead of requirePermission).
 */
export function getResolvedAuth(request: FastifyRequest): ResolvedAuth {
  if (request.resolvedAuth) return request.resolvedAuth;
  if (!request.auth) throw httpError(401, "Auth context missing — ensure requireAuth or requirePermission middleware runs before this handler");
  throw httpError(500, "ResolvedAuth not available — use requirePermission or requireOwner middleware for this route");
}

export function verifyAuthToken(token: string): AuthContext | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as Partial<AuthContext>;
    if (!decoded.userId || !decoded.email || !decoded.tenantId) return null;
    return {
      userId: decoded.userId,
      email: decoded.email,
      tenantId: decoded.tenantId,
    };
  } catch {
    return null;
  }
}

export const authPlugin = fp(async (app) => {
  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.unauthorized("Missing bearer token");
    }

    const token = header.slice("Bearer ".length);
    const auth = verifyAuthToken(token);
    if (!auth) {
      return reply.unauthorized("Invalid or expired token");
    }
    request.auth = auth;
  });
});
