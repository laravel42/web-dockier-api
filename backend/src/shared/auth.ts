import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "./config.js";

export const membershipRoleSchemaValues = ["admin", "member"] as const;
export type MembershipRole = (typeof membershipRoleSchemaValues)[number];

export type AuthContext = {
  userId: string;
  email: string;
  tenantId: string;
  appId: string; // Backward-compatible alias for tenantId.
  role: MembershipRole;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }

  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTenantAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async (app) => {
  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.unauthorized("Missing bearer token");
    }

    const token = header.slice("Bearer ".length);
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as Partial<AuthContext>;
      if (!decoded.userId || !decoded.email || !decoded.tenantId || !decoded.role) {
        return reply.unauthorized("Invalid token payload");
      }
      request.auth = {
        userId: decoded.userId,
        email: decoded.email,
        tenantId: decoded.tenantId,
        appId: decoded.appId ?? decoded.tenantId,
        role: decoded.role,
      };
    } catch {
      return reply.unauthorized("Invalid or expired token");
    }
  });

  app.decorate("requireTenantAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
    await app.requireAuth(request, reply);
    if (reply.sent) return;
    if (request.auth?.role !== "admin") {
      return reply.forbidden("Admin role required");
    }
  });
});
