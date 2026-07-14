import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema, paginationQuerySchema } from "../../shared/schemas/responses.js";
import {
  heartbeatSchema,
  heartbeatFrequencySchema,
  heartbeatGracePeriodSchema,
  activitySchema,
  logTypeSchema,
  logEntrySchema,
} from "./schemas.js";
import {
  createHeartbeat,
  listHeartbeats,
  deleteHeartbeat,
  pingHeartbeat,
} from "./domain/heartbeats.js";
import { listActivity } from "./domain/activity.js";
import { getLog, clearLog } from "./domain/logs.js";

export async function registerObserveRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Heartbeats ───

  typed.get(
    "/projects/:projectId/heartbeats",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["observe"],
        summary: "List heartbeats for a project",
        params: z.object({ projectId: z.uuid() }),
        response: {
          200: z.object({ heartbeats: z.array(heartbeatSchema) }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await listHeartbeats({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );

  typed.post(
    "/projects/:projectId/heartbeats",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["observe"],
        summary: "Create a heartbeat monitor",
        params: z.object({ projectId: z.uuid() }),
        body: z.object({
          name: z.string().min(1).max(100),
          frequency: heartbeatFrequencySchema,
          gracePeriod: heartbeatGracePeriodSchema,
        }),
        response: { 200: heartbeatSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createHeartbeat({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        name: request.body.name,
        frequency: request.body.frequency,
        gracePeriod: request.body.gracePeriod,
      });
    },
  );

  typed.delete(
    "/projects/:projectId/heartbeats/:heartbeatId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["observe"],
        summary: "Delete a heartbeat monitor",
        params: z.object({
          projectId: z.uuid(),
          heartbeatId: z.uuid(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteHeartbeat({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        heartbeatId: request.params.heartbeatId,
      });
      return { success: true as const };
    },
  );

  // Public ping endpoint (no auth required)
  typed.get(
    "/heartbeats/:heartbeatId/ping",
    {
      schema: {
        tags: ["observe"],
        summary: "Ping a heartbeat (public, no auth)",
        params: z.object({ heartbeatId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      await pingHeartbeat(request.params.heartbeatId);
      return { success: true as const };
    },
  );

  // ─── Logs ───

  typed.get(
    "/projects/:projectId/logs/:logType",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["observe"],
        summary: "Get log content",
        params: z.object({
          projectId: z.uuid(),
          logType: logTypeSchema,
        }),
        response: { 200: logEntrySchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getLog({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        logType: request.params.logType,
      });
    },
  );

  typed.delete(
    "/projects/:projectId/logs/:logType",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["observe"],
        summary: "Clear log contents",
        params: z.object({
          projectId: z.uuid(),
          logType: logTypeSchema,
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await clearLog({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        logType: request.params.logType,
      });
      return { success: true as const };
    },
  );

  // ─── Activity ───

  typed.get(
    "/projects/:projectId/activity",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["observe"],
        summary: "List project activity",
        params: z.object({ projectId: z.uuid() }),
        querystring: paginationQuerySchema.extend({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          search: z.string().optional(),
        }),
        response: {
          200: z.object({
            activity: z.array(activitySchema),
            total: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await listActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        limit: request.query.limit,
        offset: request.query.offset,
        search: request.query.search,
      });
    },
  );
}
