/**
 * Project Access Middleware
 *
 * Fastify preHandler that validates a project exists and belongs to the
 * authenticated tenant. Use this on any route with a `:projectId` param
 * to replace manual `assertProjectAccess()` calls in domain functions.
 *
 * Fetches the core project columns so downstream handlers can read
 * `request.project` without issuing a second DB query.
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
 *
 * // In the handler:
 * const project = request.project!; // guaranteed non-null after middleware
 * console.log(project.repository, project.branch);
 * ```
 */

import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../supabase/client.js";
import { getAuth } from "../auth/auth.js";
import type { Json } from "../supabase/types.js";

/**
 * Cached project row set by requireProjectAccess.
 *
 * Contains the most commonly needed columns across services (commands,
 * network, domains, processes, deploy). Handlers that need additional
 * columns (e.g. config blocks) can extend or re-query as needed.
 */
export interface CachedProjectRow {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
  platform: string;
  sourceType: string;
  settings: Json;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by requireProjectAccess — the validated project ID from params. */
    projectId?: string;
    /**
     * Set by requireProjectAccess — the validated project row.
     * Avoids a second DB query in handlers that need project metadata.
     */
    project?: CachedProjectRow;
  }

  interface FastifyInstance {
    /**
     * PreHandler that asserts `params.projectId` exists and belongs to the
     * authenticated tenant. Sets `request.projectId` and `request.project`
     * on success.
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
      .select("id, name, repository, branch, connection_id, platform, source_type, settings")
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
    request.project = {
      id: data.id,
      name: data.name,
      repository: data.repository,
      branch: data.branch,
      connectionId: data.connection_id,
      platform: data.platform,
      sourceType: data.source_type,
      settings: data.settings,
    };
  });
});
