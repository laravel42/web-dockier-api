import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import {
  scheduledJobSchema,
  createJobBodySchema,
  updateJobBodySchema,
  jobStatusSchema,
} from "../schemas.js";
import {
  createJob,
  listJobs,
  updateJob,
  updateJobStatus,
  deleteJob,
} from "../domain/processes.js";
import { installJob, pauseJob, removeJobCron } from "../domain/scheduler-executor.js";

export async function registerScheduledJobRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/projects/:projectId/scheduled-jobs",
    {
      preHandler: [app.requirePermission(PERMISSIONS.PROJECT_MANAGE), app.requireProjectAccess],
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
      preHandler: [app.requirePermission(PERMISSIONS.PROJECT_VIEW), app.requireProjectAccess],
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
      preHandler: [app.requirePermission(PERMISSIONS.PROJECT_MANAGE), app.requireProjectAccess],
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
      preHandler: [app.requirePermission(PERMISSIONS.PROJECT_MANAGE), app.requireProjectAccess],
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
      const { projectId, jobId } = request.params;
      const { status } = request.body;

      // Execute the actual cron action on infrastructure
      if (status === "installed") {
        const result = await installJob({
          tenantId: auth.tenantId,
          projectId,
          jobId,
        });
        if (!result.success) {
          // Still update status to reflect intent, but log the failure
          return await updateJobStatus({
            tenantId: auth.tenantId,
            projectId,
            jobId,
            status: "paused",
          });
        }
      } else if (status === "paused") {
        await pauseJob({
          tenantId: auth.tenantId,
          projectId,
          jobId,
        });
      }

      return await updateJobStatus({
        tenantId: auth.tenantId,
        projectId,
        jobId,
        status,
      });
    },
  );

  typed.delete(
    "/projects/:projectId/scheduled-jobs/:jobId",
    {
      preHandler: [app.requirePermission(PERMISSIONS.PROJECT_MANAGE), app.requireProjectAccess],
      schema: {
        tags: ["processes"],
        summary: "Delete a scheduled job",
        params: z.object({ projectId: z.uuid(), jobId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { projectId, jobId } = request.params;

      // Remove cron entry from infrastructure (best-effort)
      await removeJobCron({
        tenantId: auth.tenantId,
        projectId,
        jobId,
      });

      await deleteJob({
        tenantId: auth.tenantId,
        projectId,
        jobId,
      });
      return { success: true as const };
    },
  );
}
