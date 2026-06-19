/**
 * Cache invalidation routes.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth.js";
import { successResponseSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { invalidateCache } from "../domain/cache.js";

export async function registerCacheRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const log = app.log;

  typed.delete(
    "/git/stats-cache",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Invalidate stats cache",
        querystring: z.object({ repo: z.string(), branch: z.string().optional() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      await invalidateCache("stats_cache", getAuth(request).tenantId, request.query, log);
      return { success: true as const };
    },
  );

  typed.delete(
    "/git/stack-cache",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Invalidate stack cache",
        querystring: z.object({ repo: z.string(), branch: z.string().optional() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      await invalidateCache("stack_cache", getAuth(request).tenantId, request.query, log);
      return { success: true as const };
    },
  );

  typed.delete(
    "/git/analysis-cache",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Invalidate analysis cache",
        querystring: z.object({ repo: z.string().optional(), branch: z.string().optional() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      await invalidateCache("analysis_cache", getAuth(request).tenantId, request.query, log);
      return { success: true as const };
    },
  );
}
