import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import {
  backgroundProcessSchema,
  createProcessBodySchema,
  updateProcessBodySchema,
  processStatusInputSchema,
} from "../schemas.js";
import {
  createProcess,
  listProcesses,
  updateProcess,
  updateProcessStatus,
  deleteProcess,
} from "../domain/processes.js";
import { startProcess, stopProcess, restartProcess, getProcessLogs } from "../domain/executor.js";

export async function registerBackgroundProcessRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/projects/:projectId/processes",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Create a background process",
        params: z.object({ projectId: z.uuid() }),
        body: createProcessBodySchema,
        response: { 200: backgroundProcessSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createProcess({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        ...request.body,
      });
    },
  );

  typed.get(
    "/projects/:projectId/processes",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["processes"],
        summary: "List background processes for a project",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.object({ processes: z.array(backgroundProcessSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const processes = await listProcesses({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      return { processes };
    },
  );

  typed.patch(
    "/projects/:projectId/processes/:processId",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Update a background process",
        params: z.object({ projectId: z.uuid(), processId: z.uuid() }),
        body: updateProcessBodySchema,
        response: { 200: backgroundProcessSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateProcess({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        processId: request.params.processId,
        updates: request.body,
      });
    },
  );

  typed.post(
    "/projects/:projectId/processes/:processId/status",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Change process status (start/stop/restart)",
        params: z.object({ projectId: z.uuid(), processId: z.uuid() }),
        body: z.object({ status: processStatusInputSchema }),
        response: { 200: backgroundProcessSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { projectId, processId } = request.params;
      const { status } = request.body;

      // Execute the actual process action on infrastructure
      if (status === "running") {
        const result = await startProcess({
          tenantId: auth.tenantId,
          projectId,
          processId,
        });
        if (!result.success) {
          // Mark as errored if start failed
          return await updateProcessStatus({
            tenantId: auth.tenantId,
            projectId,
            processId,
            status: "errored",
          });
        }
      } else if (status === "stopped") {
        await stopProcess({
          tenantId: auth.tenantId,
          projectId,
          processId,
        });
      } else if (status === "restart") {
        const result = await restartProcess({
          tenantId: auth.tenantId,
          projectId,
          processId,
        });
        if (!result.success) {
          return await updateProcessStatus({
            tenantId: auth.tenantId,
            projectId,
            processId,
            status: "errored",
          });
        }
        return await updateProcessStatus({
          tenantId: auth.tenantId,
          projectId,
          processId,
          status: "running",
        });
      }

      return await updateProcessStatus({
        tenantId: auth.tenantId,
        projectId,
        processId,
        status,
      });
    },
  );

  typed.delete(
    "/projects/:projectId/processes/:processId",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Delete a background process",
        params: z.object({ projectId: z.uuid(), processId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteProcess({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        processId: request.params.processId,
      });
      return { success: true as const };
    },
  );

  typed.get(
    "/projects/:projectId/processes/:processId/logs",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["processes"],
        summary: "Get background process logs",
        params: z.object({ projectId: z.uuid(), processId: z.uuid() }),
        querystring: z.object({ lines: z.coerce.number().int().min(1).max(1000).default(100) }),
        response: { 200: z.object({ logs: z.string() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getProcessLogs({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        processId: request.params.processId,
        lines: request.query.lines,
      });
    },
  );
}
