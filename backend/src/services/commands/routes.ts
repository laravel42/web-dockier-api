import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth/auth.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { tenantRateLimit } from "../../shared/http/rate-limit.js";
import { successResponseSchema, paginationQuerySchema, paginationMetaSchema, paginatedResponse } from "../../shared/schemas/responses.js";
import { commandSchema } from "./schemas.js";
import {
  runCommand,
  listCommands,
  getCommand,
  deleteCommand,
} from "./domain/commands.js";

export async function registerCommandsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/projects/:projectId/commands",
    {
      preHandler: [...app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE), tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "cmd-run" })],
      schema: {
        tags: ["commands"],
        summary: "Run a command on a project",
        params: z.object({ projectId: z.uuid() }),
        body: z.object({
          command: z.string().min(1).max(2000),
        }),
        response: { 200: commandSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await runCommand({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        command: request.body.command,
        correlationId: request.id,
      });
    },
  );

  typed.get(
    "/projects/:projectId/commands",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["commands"],
        summary: "List commands for a project",
        params: z.object({ projectId: z.uuid() }),
        querystring: paginationQuerySchema,
        response: {
          200: z.object({
            commands: z.array(commandSchema),
            pagination: paginationMetaSchema,
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { limit, offset } = request.query;
      const result = await listCommands({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        limit,
        offset,
      });
      return paginatedResponse("commands", result.commands, result.total, limit, offset);
    },
  );

  typed.get(
    "/projects/:projectId/commands/:commandId",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["commands"],
        summary: "Get command details",
        params: z.object({
          projectId: z.uuid(),
          commandId: z.uuid(),
        }),
        response: { 200: commandSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getCommand({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        commandId: request.params.commandId,
      });
    },
  );

  typed.delete(
    "/projects/:projectId/commands/:commandId",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["commands"],
        summary: "Delete a command record",
        params: z.object({
          projectId: z.uuid(),
          commandId: z.uuid(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteCommand({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        commandId: request.params.commandId,
      });
      return { success: true as const };
    },
  );
}
