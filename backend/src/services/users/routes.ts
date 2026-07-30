import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth, getResolvedAuth } from "../../shared/auth/auth.js";
import { listUsersResponseSchema, userSchema } from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema, paginationQuerySchema } from "../../shared/schemas/responses.js";
import {
  createUser,
  getUser,
  listUsers,
  updateUser,
  removeUser,
} from "./domain/users.js";

export async function registerUsersRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/users",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["users"],
        summary: "Create user",
        body: z.object({
          email: z.email(),
          name: z.string().min(1),
          password: z.string().min(8).optional(),
          country: z.string().optional(),
          language: z.string().optional(),
          timezone: z.string().optional(),
          roleId: z.uuid().optional(),
        }),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createUser({
        tenantId: auth.tenantId,
        email: request.body.email,
        name: request.body.name,
        password: request.body.password,
        country: request.body.country,
        language: request.body.language,
        timezone: request.body.timezone,
        roleId: request.body.roleId,
        resolvedAuth: getResolvedAuth(request),
      });
    },
  );

  typed.get(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_VIEW),
      schema: {
        tags: ["users"],
        summary: "Get user by ID",
        params: z.object({ userId: z.uuid() }),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getUser(request.params.userId, auth.tenantId);
    },
  );

  typed.get(
    "/users",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_VIEW),
      schema: {
        tags: ["users"],
        summary: "List users",
        querystring: paginationQuerySchema.extend({ search: z.string().optional() }),
        response: { 200: listUsersResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { limit, offset, search } = request.query;
      const result = await listUsers({
        tenantId: auth.tenantId,
        limit,
        offset,
        search,
      });
      return {
        users: result.users,
        pagination: { total: result.total, limit, offset },
      };
    },
  );

  typed.put(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["users"],
        summary: "Update user fields",
        params: z.object({ userId: z.uuid() }),
        body: z
          .object({
            name: z.string().optional(),
            avatarUrl: z.string().nullable().optional(),
            country: z.string().optional(),
            language: z.string().optional(),
            timezone: z.string().optional(),
            roleId: z.uuid().optional(),
          })
          .refine((value) => Object.keys(value).length > 0, "Provide at least one field"),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateUser({
        userId: request.params.userId,
        tenantId: auth.tenantId,
        name: request.body.name,
        avatarUrl: request.body.avatarUrl,
        country: request.body.country,
        language: request.body.language,
        timezone: request.body.timezone,
        roleId: request.body.roleId,
        resolvedAuth: getResolvedAuth(request),
      });
    },
  );

  typed.delete(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["users"],
        summary: "Remove user from organization",
        params: z.object({ userId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await removeUser({
        userId: request.params.userId,
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        resolvedAuth: getResolvedAuth(request),
      });
      return { success: true as const };
    },
  );
}
