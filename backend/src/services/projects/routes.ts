import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { pipeUIMessageStreamToResponse } from "ai";
import { z } from "zod";
import { projectConfigSchema, projectSchema } from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import { env } from "../../shared/config.js";
import {
  createProject,
  getProject,
  listProjects,
  updateProject,
  deleteProject,
} from "./domain/projects.js";
import { createOverviewAiStream } from "./domain/overview-ai.js";

export async function registerProjectsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

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
      const auth = request.auth!;
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
        params: z.object({ projectId: z.string().uuid() }),
        response: { 200: projectSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
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
        response: { 200: z.object({ projects: z.array(projectSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const projects = await listProjects(auth.tenantId);
      return { projects };
    },
  );

  typed.put(
    "/projects/:projectId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Update project",
        params: z.object({ projectId: z.string().uuid() }),
        body: z.object({
          name: z.string().optional(),
          repository: z.string().optional(),
          branch: z.string().optional(),
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
      const auth = request.auth!;
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
      });
    },
  );

  typed.post(
    "/projects/overview-ai/chat",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
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
      } catch {
        return reply.status(500).send({ message: "Failed to process AI request." });
      }
    },
  );

  typed.delete(
    "/projects/:projectId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_DELETE),
      schema: {
        tags: ["projects"],
        summary: "Delete project",
        params: z.object({ projectId: z.string().uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      await deleteProject(request.params.projectId, auth.tenantId);
      return { success: true as const };
    },
  );
}
