/**
 * WordPress Configuration Routes
 *
 * Encrypted wp-config.php management (get masked, reveal, save).
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { getMaskedWpConfig, revealWpConfig, saveWpConfig } from "../domain/wp-config.js";
import { safeRecordActivity } from "../../../shared/service-clients/activity.js";

export async function registerWpConfigRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/projects/:projectId/wp-config",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "Get masked WordPress configuration",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.object({ content: z.string(), exists: z.boolean() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getMaskedWpConfig({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );

  typed.get(
    "/projects/:projectId/wp-config/reveal",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Reveal full WordPress configuration (decrypted)",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.object({ content: z.string(), exists: z.boolean() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await revealWpConfig({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );

  typed.put(
    "/projects/:projectId/wp-config",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Save WordPress configuration",
        params: z.object({ projectId: z.uuid() }),
        body: z.object({ content: z.string().max(128000) }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await saveWpConfig({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        content: request.body.content,
      });

      safeRecordActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        eventType: "wp_config_updated",
        description: "Updated WordPress configuration",
      });

      return { success: true as const };
    },
  );
}
