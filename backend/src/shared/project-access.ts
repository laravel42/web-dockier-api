/**
 * Project Access Middleware
 *
 * Fastify preHandler that validates a project exists and belongs to the
 * authenticated tenant. Use this on any route with a `:projectId` param
 * to replace manual `assertProjectAccess()` calls in domain functions.
 *
 * Must be placed AFTER auth middleware (requirePermission / requireAuth)
 * in the preHandler array so that `request.auth` is available.
 *
 * @example
 * ```ts
 * typed.post("/projects/:projectId/commands", {
 *   preHandler: [app.requirePermission(PERMISSIONS.PROJECT_MANAGE), app.requireProjectAccess],
 *   ...
 * }, handler);
 * ```
 */

import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { supabaseAdmin } from "./supabase/client.js";
import { getAuth } from "./auth.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by requireProjectAccess — the validated project ID from params. */
    projectId?: string;
  }

  interface FastifyInstance {
    /**
     * PreHandler that asserts `params.projectId` exists and belongs to the
     * authenticated tenant. Sets `request.projectId` on success.
     *
     * Place AFTER requirePermission in the preHandler array.
     */
    requireProjectAccess: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const projectAccessPlugin = fp(async (app: FastifyInstance) => {
  app.decorate("requireProjectAccess", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string> | undefined;
    const projectId = params?.projectId;

    if (!projectId) {
      return reply.badRequest("Missing projectId parameter");
    }

    const auth = getAuth(request);

    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("organization_id", auth.tenantId)
      .maybeSingle();

    if (error) {
      request.log.error({ err: error }, "Project access check failed");
      return reply.internalServerError("Failed to verify project access");
    }

    if (!data) {
      return reply.notFound("Project not found");
    }

    request.projectId = projectId;
  });
});
