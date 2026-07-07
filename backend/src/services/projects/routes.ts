import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { pipeUIMessageStreamToResponse } from "ai";
import { z } from "zod";
import { getAuth } from "../../shared/auth.js";
import { projectConfigSchema, projectSchema, projectSettingsSchema } from "./schemas.js";
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
import {
  listTags,
  listTagsWithCounts,
  createTag,
  updateTag,
  deleteTag,
  getProjectTags,
  setProjectTags,
} from "./domain/tags.js";

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
        response: { 200: z.object({ projects: z.array(projectSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
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

  // ─── Tags ───

  const tagResponseSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    color: z.string(),
    createdAt: z.string(),
  });

  typed.get(
    "/projects/tags",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "List all organization tags",
        response: { 200: z.object({ tags: z.array(tagResponseSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const tags = await listTags(auth.tenantId);
      return { tags };
    },
  );

  typed.get(
    "/projects/tags/manage",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "List all organization tags with project counts",
        response: {
          200: z.object({
            tags: z.array(tagResponseSchema.extend({ projectCount: z.number() })),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const tags = await listTagsWithCounts(auth.tenantId);
      return { tags };
    },
  );

  typed.post(
    "/projects/tags",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Create a tag",
        body: z.object({
          name: z.string().min(1).max(50),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        }),
        response: { 200: tagResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createTag({
        tenantId: auth.tenantId,
        name: request.body.name,
        color: request.body.color,
      });
    },
  );

  typed.put(
    "/projects/tags/:tagId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Update a tag",
        params: z.object({ tagId: z.string().uuid() }),
        body: z.object({
          name: z.string().min(1).max(50).optional(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        }),
        response: { 200: tagResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateTag({
        tenantId: auth.tenantId,
        tagId: request.params.tagId,
        name: request.body.name,
        color: request.body.color,
      });
    },
  );

  typed.delete(
    "/projects/tags/:tagId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Delete a tag",
        params: z.object({ tagId: z.string().uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteTag({ tenantId: auth.tenantId, tagId: request.params.tagId });
      return { success: true as const };
    },
  );

  typed.get(
    "/projects/:projectId/tags",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "Get tags assigned to a project",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.object({ tags: z.array(tagResponseSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const tags = await getProjectTags({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      return { tags };
    },
  );

  typed.put(
    "/projects/:projectId/tags",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Set tags for a project (replaces all)",
        params: z.object({ projectId: z.uuid() }),
        body: z.object({
          tagIds: z.array(z.string().uuid()).max(20),
        }),
        response: { 200: z.object({ tags: z.array(tagResponseSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const tags = await setProjectTags({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        tagIds: request.body.tagIds,
      });
      return { tags };
    },
  );
}
