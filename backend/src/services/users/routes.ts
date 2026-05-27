import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { listUsersResponseSchema, userSchema } from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import {
  UsersError,
  createUser,
  getUser,
  listUsers,
  updateUser,
  removeUser,
} from "./domain/users.js";

/**
 * Map domain error codes to Fastify HTTP errors.
 */
function throwDomainError(app: FastifyInstance, error: UsersError): never {
  const msg = error.message;
  if (error.code === "internal") {
    app.log.error(error);
  } else {
    app.log.warn(error, "Users domain warning: " + msg);
  }
  switch (error.code) {
    case "not_found":
      throw app.httpErrors.notFound(msg);
    case "forbidden":
      throw app.httpErrors.forbidden(msg);
    case "bad_request":
      throw app.httpErrors.badRequest(msg);
    case "internal":
      throw app.httpErrors.internalServerError("An internal server error occurred");
    default:
      throw app.httpErrors.internalServerError("An unexpected error occurred");
  }
}

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
          roleId: z.string().uuid().optional(),
        }),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        return await createUser({
          tenantId: auth.tenantId,
          email: request.body.email,
          name: request.body.name,
          password: request.body.password,
          country: request.body.country,
          language: request.body.language,
          timezone: request.body.timezone,
          roleId: request.body.roleId,
          resolvedAuth: request.resolvedAuth!,
        });
      } catch (err) {
        if (err instanceof UsersError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.get(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_VIEW),
      schema: {
        tags: ["users"],
        summary: "Get user by ID",
        params: z.object({ userId: z.string().uuid() }),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        return await getUser(request.params.userId, auth.tenantId);
      } catch (err) {
        if (err instanceof UsersError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.get(
    "/users",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_VIEW),
      schema: {
        tags: ["users"],
        summary: "List users",
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          search: z.string().optional(),
        }),
        response: { 200: listUsersResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        return await listUsers({
          tenantId: auth.tenantId,
          page: request.query.page,
          limit: request.query.limit,
          search: request.query.search,
        });
      } catch (err) {
        if (err instanceof UsersError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.put(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["users"],
        summary: "Update user fields",
        params: z.object({ userId: z.string().uuid() }),
        body: z
          .object({
            name: z.string().optional(),
            avatarUrl: z.string().nullable().optional(),
            country: z.string().optional(),
            language: z.string().optional(),
            timezone: z.string().optional(),
            roleId: z.string().uuid().optional(),
          })
          .refine((value) => Object.keys(value).length > 0, "Provide at least one field"),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        return await updateUser({
          userId: request.params.userId,
          tenantId: auth.tenantId,
          name: request.body.name,
          avatarUrl: request.body.avatarUrl,
          country: request.body.country,
          language: request.body.language,
          timezone: request.body.timezone,
          roleId: request.body.roleId,
          resolvedAuth: request.resolvedAuth!,
        });
      } catch (err) {
        if (err instanceof UsersError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.delete(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["users"],
        summary: "Remove user from organization",
        params: z.object({ userId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        await removeUser({
          userId: request.params.userId,
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
        });
        return { success: true as const };
      } catch (err) {
        if (err instanceof UsersError) throwDomainError(app, err);
        throw err;
      }
    },
  );
}
