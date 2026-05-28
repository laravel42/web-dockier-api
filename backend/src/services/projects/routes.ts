import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { projectConfigSchema, projectSchema } from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { throwDomainError } from "../../shared/error-handler.js";
import {
  ProjectsError,
  createProject,
  getProject,
  listProjects,
  updateProject,
  deleteProject,
} from "./domain/projects.js";

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
      try {
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
      } catch (err) {
        if (err instanceof ProjectsError) throwDomainError(app, err);
        throw err;
      }
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
      try {
        return await getProject(request.params.projectId, auth.tenantId);
      } catch (err) {
        if (err instanceof ProjectsError) throwDomainError(app, err);
        throw err;
      }
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
      try {
        const projects = await listProjects(auth.tenantId);
        return { projects };
      } catch (err) {
        if (err instanceof ProjectsError) throwDomainError(app, err);
        throw err;
      }
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
      try {
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
      } catch (err) {
        if (err instanceof ProjectsError) throwDomainError(app, err);
        throw err;
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
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        await deleteProject(request.params.projectId, auth.tenantId);
        return { success: true as const };
      } catch (err) {
        if (err instanceof ProjectsError) throwDomainError(app, err);
        throw err;
      }
    },
  );
}
