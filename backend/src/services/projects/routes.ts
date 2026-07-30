/**
 * Projects Routes — Composer
 *
 * Registers all project sub-route modules.
 * Each module handles a focused domain:
 *   - projects (this file): CRUD and AI overview chat
 *   - tags: organization tags and per-project tag assignments
 *   - env: encrypted environment file management
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { pipeUIMessageStreamToResponse } from "ai";
import { z } from "zod";
import { getAuth } from "../../shared/auth/auth.js";
import { projectConfigSchema, projectSchema, projectSettingsSchema } from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { tenantRateLimit } from "../../shared/http/rate-limit.js";
import { successResponseSchema, paginationQuerySchema, paginationMetaSchema } from "../../shared/schemas/responses.js";
import { env } from "../../shared/config.js";
import {
  createProject,
  getProject,
  listProjects,
  updateProject,
  deleteProject,
} from "./domain/projects.js";
import { createOverviewAiStream } from "./domain/overview-ai.js";
import { registerTagRoutes } from "./routes/tags.js";
import { registerEnvRoutes } from "./routes/env.js";
import { registerWpConfigRoutes } from "./routes/wp-config.js";

export async function registerProjectsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Project CRUD ───

  typed.post(
    "/projects",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_CREATE),
      schema: {
        tags: ["projects"],
        summary: "Create project",
        body: z.object({
          name: z.string().min(1),
          repository: z.string().min(1),
          branch: z.string().min(1),
          connectionId: z.string().optional(),
          platform: z.string().optional(),
          sourceType: z.string().optional(),
          template: z.string().optional(),
          config: projectConfigSchema.optional(),
        }),
        response: { 200: projectSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createProject({
        tenantId: auth.tenantId,
        name: request.body.name,
        repository: request.body.repository,
        branch: request.body.branch,
        connectionId: request.body.connectionId,
        platform: request.body.platform,
        sourceType: request.body.sourceType,
        template: request.body.template,
        config: request.body.config,
      });
    },
  );

  typed.get(
    "/projects/:projectId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "Get project",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: projectSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getProject(request.params.projectId, auth.tenantId);
    },
  );

  typed.get(
    "/projects",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "List projects",
        querystring: paginationQuerySchema.extend({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          search: z.string().optional(),
        }),
        response: {
          200: z.object({
            projects: z.array(projectSchema),
            pagination: paginationMetaSchema,
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { limit, offset, search } = request.query;
      const result = await listProjects(auth.tenantId, { limit, offset, search });
      return {
        projects: result.projects,
        pagination: { total: result.total, limit, offset },
      };
    },
  );

  typed.put(
    "/projects/:projectId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Update project",
        params: z.object({ projectId: z.uuid() }),
        body: z.object({
          name: z.string().optional(),
          repository: z.string().optional(),
          branch: z.string().optional(),
          connectionId: z.string().optional(),
          platform: z.string().optional(),
          sourceType: z.string().optional(),
          template: z.string().optional(),
          config: projectConfigSchema.optional(),
          settings: projectSettingsSchema.optional(),
        }),
        response: { 200: projectSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateProject({
        projectId: request.params.projectId,
        tenantId: auth.tenantId,
        name: request.body.name,
        repository: request.body.repository,
        branch: request.body.branch,
        connectionId: request.body.connectionId,
        platform: request.body.platform,
        sourceType: request.body.sourceType,
        template: request.body.template,
        config: request.body.config,
        settings: request.body.settings,
      });
    },
  );

  typed.delete(
    "/projects/:projectId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_DELETE),
      schema: {
        tags: ["projects"],
        summary: "Delete project",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteProject(request.params.projectId, auth.tenantId);
      return { success: true as const };
    },
  );

  // ─── AI Overview Chat ───

  typed.post(
    "/projects/overview-ai/chat",
    {
      preHandler: [app.requirePermission(PERMISSIONS.PROJECT_MANAGE), tenantRateLimit({ max: 20, windowMs: 60_000, prefix: "ai-chat" })],
      handlerTimeout: 90_000,
      schema: {
        tags: ["projects"],
        summary: "BlockNote AI chat for project overview editor",
        body: z.object({
          messages: z.array(z.record(z.string(), z.unknown())),
          toolDefinitions: z.record(z.string(), z.unknown()).optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!env.OPENAI_API_KEY) {
        return reply.status(503).send({ message: "AI is not configured on this server." });
      }

      try {
        const result = await createOverviewAiStream({
          messages: request.body.messages as unknown as Parameters<typeof createOverviewAiStream>[0]["messages"],
          toolDefinitions: request.body.toolDefinitions as Parameters<
            typeof createOverviewAiStream
          >[0]["toolDefinitions"],
        });

        reply.hijack();
        pipeUIMessageStreamToResponse({
          response: reply.raw,
          stream: result.toUIMessageStream(),
        });
      } catch (err) {
        request.log.error({ err }, "AI chat stream failed");
        return reply.status(500).send({ message: "Failed to process AI request." });
      }
    },
  );

  // ─── Sub-route modules ───

  await registerTagRoutes(app);
  await registerEnvRoutes(app);
  await registerWpConfigRoutes(app);
}
