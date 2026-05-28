import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PERMISSIONS, PERMISSION_DEFINITIONS } from "../../shared/permissions/constants.js";
import { throwDomainError } from "../../shared/error-handler.js";
import {
  RolesError,
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
} from "./domain/roles.js";

const roleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  systemKey: z.string().nullable(),
  isSystem: z.boolean(),
  isEditable: z.boolean(),
  isDeletable: z.boolean(),
  permissions: z.array(z.string()),
});

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
      const auth = request.auth!;
      try {
        return await listRoles(auth.tenantId);
      } catch (err) {
        if (err instanceof RolesError) throwDomainError(app, err);
        throw err;
      }
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
      const auth = request.auth!;
      try {
        return await getRole(request.params.roleId, auth.tenantId);
      } catch (err) {
        if (err instanceof RolesError) throwDomainError(app, err);
        throw err;
      }
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
      const auth = request.auth!;
      try {
        return await createRole({
          tenantId: auth.tenantId,
          name: request.body.name,
          description: request.body.description,
          permissions: request.body.permissions,
          resolvedAuth: request.resolvedAuth!,
        });
      } catch (err) {
        if (err instanceof RolesError) throwDomainError(app, err);
        throw err;
      }
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
      const auth = request.auth!;
      try {
        return await updateRole({
          roleId: request.params.roleId,
          tenantId: auth.tenantId,
          name: request.body.name,
          description: request.body.description,
          permissions: request.body.permissions,
          resolvedAuth: request.resolvedAuth!,
        });
      } catch (err) {
        if (err instanceof RolesError) throwDomainError(app, err);
        throw err;
      }
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
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        await deleteRole(request.params.roleId, auth.tenantId, request.resolvedAuth!);
        return { success: true as const };
      } catch (err) {
        if (err instanceof RolesError) throwDomainError(app, err);
        throw err;
      }
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
