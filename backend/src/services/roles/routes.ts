import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rolesStore } from "./data.js";
import { roleSchema } from "./schemas.js";
import { membershipRoleSchemaValues } from "../../shared/auth.js";

export async function registerRolesRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/roles",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["roles"],
        summary: "List roles",
        response: { 200: z.object({ roles: z.array(roleSchema) }) },
      },
    },
    async () => ({ roles: rolesStore }),
  );

  typed.get(
    "/roles/:roleId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["roles"],
        summary: "Get role",
        params: z.object({ roleId: z.string().min(1) }),
        response: { 200: roleSchema },
      },
    },
    async (request) => {
      const role = rolesStore.find((item) => item.id === request.params.roleId);
      if (!role) throw app.httpErrors.notFound("Role not found");
      return role;
    },
  );

  typed.post(
    "/roles",
    {
      preHandler: app.requireTenantAdmin,
      schema: {
        tags: ["roles"],
        summary: "Create role",
        body: z.object({
          name: z.string().min(2).max(80),
          description: z.string().max(300).optional(),
          permissions: z.array(z.string()).default([]),
        }),
        response: { 200: roleSchema },
      },
    },
    async (request) => {
      const id = randomUUID();
      const role = {
        id,
        name: request.body.name.trim(),
        description: request.body.description?.trim() ?? "",
        permissions: [...new Set(request.body.permissions)],
      };
      rolesStore.push(role);
      return role;
    },
  );

  typed.put(
    "/roles/:roleId",
    {
      preHandler: app.requireTenantAdmin,
      schema: {
        tags: ["roles"],
        summary: "Update role",
        params: z.object({ roleId: z.string().min(1) }),
        body: z.object({
          name: z.string().min(2).max(80).optional(),
          description: z.string().max(300).optional(),
          permissions: z.array(z.string()).optional(),
        }),
        response: { 200: roleSchema },
      },
    },
    async (request) => {
      const role = rolesStore.find((item) => item.id === request.params.roleId);
      if (!role) throw app.httpErrors.notFound("Role not found");

      if (request.body.name !== undefined) role.name = request.body.name.trim();
      if (request.body.description !== undefined) role.description = request.body.description.trim();
      if (request.body.permissions !== undefined) role.permissions = [...new Set(request.body.permissions)];

      return role;
    },
  );

  typed.delete(
    "/roles/:roleId",
    {
      preHandler: app.requireTenantAdmin,
      schema: {
        tags: ["roles"],
        summary: "Delete role",
        params: z.object({ roleId: z.string().min(1) }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      if ((membershipRoleSchemaValues as readonly string[]).includes(request.params.roleId)) {
        throw app.httpErrors.badRequest("Built-in roles cannot be deleted");
      }
      const index = rolesStore.findIndex((item) => item.id === request.params.roleId);
      if (index === -1) throw app.httpErrors.notFound("Role not found");
      rolesStore.splice(index, 1);
      return { success: true as const };
    },
  );
}
