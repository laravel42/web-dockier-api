/**
 * Project Environment File Routes
 *
 * Encrypted environment variable management (get masked, reveal, save).
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { getMaskedEnv, revealEnv, saveEnv } from "../domain/env.js";
import { safeRecordActivity } from "../../../shared/service-clients/activity.js";

export async function registerEnvRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/projects/:projectId/env",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "Get masked environment file",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.object({ content: z.string(), exists: z.boolean() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getMaskedEnv({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );

  typed.get(
    "/projects/:projectId/env/reveal",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Reveal full environment file (decrypted)",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.object({ content: z.string(), exists: z.boolean() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await revealEnv({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );

  typed.put(
    "/projects/:projectId/env",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Save environment file",
        params: z.object({ projectId: z.uuid() }),
        body: z.object({ content: z.string().max(64000) }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await saveEnv({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        content: request.body.content,
      });

      safeRecordActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        eventType: "env_updated",
        description: "Updated environment file",
      });

      return { success: true as const };
    },
  );
}
