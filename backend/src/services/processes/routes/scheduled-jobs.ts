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
import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";

/**
 * Put an "installed" job into the crontab, in the background. Not deployed yet:
 * leave it installed for the post-deploy restore. Install failed on a live
 * server: mark it paused, as the status route does, so the UI does not claim it
 * runs.
 *
 * Not awaited by the route on purpose. The job is already saved, and installing
 * reaches the server (up to the 120 s exec limit, longer if cron itself must be
 * installed), past the browser's 30 s timeout: the user would see an error for
 * a job that exists and retry into a duplicate. Never throws for the same reason.
 */
function syncInstalledJob(tenantId: string, projectId: string, jobId: string): void {
  void (async () => {
    const result = await installJob({ tenantId, projectId, jobId });
    if (result.success || result.noTarget) return;
    await updateJobStatus({ tenantId, projectId, jobId, status: "paused" });
  })().catch((err) => logger.warn({ err: getErrMsg(err), jobId }, "[scheduler] Background install failed"));
}

export async function registerScheduledJobRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/projects/:projectId/scheduled-jobs",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
      const { projectId } = request.params;
      const job = await createJob({ tenantId: auth.tenantId, projectId, ...request.body });
      // A job used to be stored "installed" without ever reaching the crontab, so
      // it only started running after the next deploy.
      syncInstalledJob(auth.tenantId, projectId, job.id);
      return job;
    },
  );

  typed.get(
    "/projects/:projectId/scheduled-jobs",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
      const { projectId, jobId } = request.params;
      const job = await updateJob({ tenantId: auth.tenantId, projectId, jobId, updates: request.body });
      // Reinstall an installed job, or cron keeps running the old command/schedule.
      if (job.status === "installed") syncInstalledJob(auth.tenantId, projectId, jobId);
      return job;
    },
  );

  typed.post(
    "/projects/:projectId/scheduled-jobs/:jobId/status",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
