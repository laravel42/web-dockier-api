import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import {
  backgroundProcessSchema,
  createProcessBodySchema,
  updateProcessBodySchema,
  scheduledJobSchema,
  createJobBodySchema,
  updateJobBodySchema,
  processStatusSchema,
  jobStatusSchema,
} from "./schemas.js";
import {
  createProcess,
  listProcesses,
  updateProcess,
  updateProcessStatus,
  deleteProcess,
  createJob,
  listJobs,
  updateJob,
  updateJobStatus,
  deleteJob,
} from "./domain/processes.js";

export async function registerProcessesRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Background Processes ───

  typed.post(
    "/projects/:projectId/processes",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
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
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
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
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
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
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Change process status (start/stop/restart)",
        params: z.object({ projectId: z.uuid(), processId: z.uuid() }),
        body: z.object({ status: processStatusSchema }),
        response: { 200: backgroundProcessSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateProcessStatus({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        processId: request.params.processId,
        status: request.body.status,
      });
    },
  );

  typed.delete(
    "/projects/:projectId/processes/:processId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
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

  // ─── Scheduled Jobs ───

  typed.post(
    "/projects/:projectId/scheduled-jobs",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Create a scheduled job",
        params: z.object({ projectId: z.uuid() }),
        body: createJobBodySchema,
        response: { 200: scheduledJobSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createJob({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        ...request.body,
      });
    },
  );

  typed.get(
    "/projects/:projectId/scheduled-jobs",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["processes"],
        summary: "List scheduled jobs for a project",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.object({ jobs: z.array(scheduledJobSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const jobs = await listJobs({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      return { jobs };
    },
  );

  typed.patch(
    "/projects/:projectId/scheduled-jobs/:jobId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Update a scheduled job",
        params: z.object({ projectId: z.uuid(), jobId: z.uuid() }),
        body: updateJobBodySchema,
        response: { 200: scheduledJobSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateJob({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        jobId: request.params.jobId,
        updates: request.body,
      });
    },
  );

  typed.post(
    "/projects/:projectId/scheduled-jobs/:jobId/status",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Change job status (pause/resume)",
        params: z.object({ projectId: z.uuid(), jobId: z.uuid() }),
        body: z.object({ status: jobStatusSchema }),
        response: { 200: scheduledJobSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateJobStatus({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        jobId: request.params.jobId,
        status: request.body.status,
      });
    },
  );

  typed.delete(
    "/projects/:projectId/scheduled-jobs/:jobId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["processes"],
        summary: "Delete a scheduled job",
        params: z.object({ projectId: z.uuid(), jobId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteJob({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        jobId: request.params.jobId,
      });
      return { success: true as const };
    },
  );
}
