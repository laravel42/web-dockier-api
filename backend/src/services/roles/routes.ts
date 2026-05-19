import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { roleSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";

function rowToRole(row: { id: string; name: string; description: string; permissions: string[] }) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: row.permissions ?? [],
  };
}

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
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await supabaseAdmin
        .from("roles")
        .select("id,name,description,permissions")
        .eq("app_id", auth.appId)
        .order("created_at", { ascending: true });
      if (error) throw app.httpErrors.internalServerError(error.message);
      return { roles: (data ?? []).map(rowToRole) };
    },
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
      const auth = request.auth!;
      const { data, error } = await supabaseAdmin
        .from("roles")
        .select("id,name,description,permissions")
        .eq("id", request.params.roleId)
        .eq("app_id", auth.appId)
        .maybeSingle();
      if (error) throw app.httpErrors.internalServerError(error.message);
      if (!data) throw app.httpErrors.notFound("Role not found");
      return rowToRole(data);
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
      const auth = request.auth!;
      const id = randomUUID();
      const payload = {
        id,
        app_id: auth.appId,
        name: request.body.name.trim(),
        description: request.body.description?.trim() ?? "",
        permissions: [...new Set(request.body.permissions)],
      };
      const { error } = await supabaseAdmin.from("roles").insert(payload);
      if (error) throw app.httpErrors.badRequest(error.message);
      return rowToRole(payload);
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
      const auth = request.auth!;
      const { data: existing } = await supabaseAdmin
        .from("roles")
        .select("id,app_id,name,description,permissions")
        .eq("id", request.params.roleId)
        .eq("app_id", auth.appId)
        .maybeSingle();
      if (!existing) throw app.httpErrors.notFound("Role not found");

      const updates: Partial<{ name: string; description: string; permissions: string[] }> = {};
      if (request.body.name !== undefined) updates.name = request.body.name.trim();
      if (request.body.description !== undefined) updates.description = request.body.description.trim();
      if (request.body.permissions !== undefined) updates.permissions = [...new Set(request.body.permissions)];

      if (Object.keys(updates).length > 0) {
        const { error } = await supabaseAdmin
          .from("roles")
          .update(updates)
          .eq("id", request.params.roleId)
          .eq("app_id", auth.appId);
        if (error) throw app.httpErrors.badRequest(error.message);
      }

      return rowToRole({
        id: existing.id,
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        permissions: updates.permissions ?? existing.permissions,
      });
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
      const auth = request.auth!;
      const { data: existing } = await supabaseAdmin
        .from("roles")
        .select("id,app_id")
        .eq("id", request.params.roleId)
        .eq("app_id", auth.appId)
        .maybeSingle();
      if (!existing) throw app.httpErrors.notFound("Role not found");

      // Prevent deleting a role that's still assigned to users
      const { count } = await supabaseAdmin
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role_id", request.params.roleId);
      if (count && count > 0) {
        throw app.httpErrors.conflict(`Cannot delete role — it is still assigned to ${count} user(s)`);
      }

      const { error } = await supabaseAdmin
        .from("roles")
        .delete()
        .eq("id", request.params.roleId)
        .eq("app_id", auth.appId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );
}
