import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth, getResolvedAuth } from "../../shared/auth.js";
import { PERMISSIONS, PERMISSION_DEFINITIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import { roleResponseSchema } from "./schemas.js";
import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
} from "./domain/roles.js";

export async function registerRolesRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/roles",
    {
      preHandler: app.requirePermission(PERMISSIONS.ROLE_VIEW),
      schema: {
        tags: ["roles"],
        summary: "List roles",
        response: { 200: z.object({ roles: z.array(roleResponseSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await listRoles(auth.tenantId);
    },
  );

  typed.get(
    "/roles/:roleId",
    {
      preHandler: app.requirePermission(PERMISSIONS.ROLE_VIEW),
      schema: {
        tags: ["roles"],
        summary: "Get role",
        params: z.object({ roleId: z.string().min(1) }),
        response: { 200: roleResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getRole(request.params.roleId, auth.tenantId);
    },
  );

  typed.post(
    "/roles",
    {
      preHandler: app.requirePermission(PERMISSIONS.ROLE_MANAGE),
      schema: {
        tags: ["roles"],
        summary: "Create custom role",
        body: z.object({
          name: z.string().min(2).max(80),
          description: z.string().max(300).optional(),
          permissions: z.array(z.string()).default([]),
        }),
        response: { 200: roleResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createRole({
        tenantId: auth.tenantId,
        name: request.body.name,
        description: request.body.description,
        permissions: request.body.permissions,
        resolvedAuth: getResolvedAuth(request),
      });
    },
  );

  typed.put(
    "/roles/:roleId",
    {
      preHandler: app.requirePermission(PERMISSIONS.ROLE_MANAGE),
      schema: {
        tags: ["roles"],
        summary: "Update role",
        params: z.object({ roleId: z.string().min(1) }),
        body: z.object({
          name: z.string().min(2).max(80).optional(),
          description: z.string().max(300).optional(),
          permissions: z.array(z.string()).optional(),
        }),
        response: { 200: roleResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateRole({
        roleId: request.params.roleId,
        tenantId: auth.tenantId,
        name: request.body.name,
        description: request.body.description,
        permissions: request.body.permissions,
        resolvedAuth: getResolvedAuth(request),
      });
    },
  );

  typed.delete(
    "/roles/:roleId",
    {
      preHandler: app.requirePermission(PERMISSIONS.ROLE_MANAGE),
      schema: {
        tags: ["roles"],
        summary: "Delete role (soft delete)",
        params: z.object({ roleId: z.string().min(1) }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteRole(request.params.roleId, auth.tenantId, getResolvedAuth(request));
      return { success: true as const };
    },
  );

  typed.get(
    "/permissions",
    {
      preHandler: app.requirePermission(PERMISSIONS.ROLE_VIEW),
      schema: {
        tags: ["roles"],
        summary: "List all available permissions",
        response: {
          200: z.object({
            permissions: z.array(z.object({
              key: z.string(),
              resource: z.string(),
              action: z.string(),
              description: z.string(),
            })),
          }),
        },
      },
    },
    async () => ({
      permissions: PERMISSION_DEFINITIONS.map((def) => ({
        key: def.key,
        resource: def.resource,
        action: def.action,
        description: def.description,
      })),
    }),
  );
}
