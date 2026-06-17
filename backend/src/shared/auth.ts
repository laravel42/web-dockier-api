import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "./config.js";

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
 * Extract the authenticated context from a request, throwing if missing.
 *
 * Use this in route handlers that run after `requirePermission` / `requireAuth`
 * middleware — it replaces the `request.auth!` non-null assertion with a
 * runtime check that produces a clear error if auth middleware was skipped.
 */
export function getAuth(request: FastifyRequest): AuthContext {
  const auth = request.auth;
  if (!auth) {
    throw new Error("Auth context missing — ensure requireAuth or requirePermission middleware runs before this handler");
  }
  return auth;
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
