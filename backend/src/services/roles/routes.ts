import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { PERMISSIONS, ALL_PERMISSIONS } from "../../shared/permissions/constants.js";
import { canAssignPermissions, canManageRole, invalidatePermissionCache } from "../../shared/permissions/authorization.js";
import { getHierarchyLevel } from "../../shared/permissions/role-templates.js";

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
      const { data: roles, error } = await supabaseAdmin
        .from("roles")
        .select("id,name,description,system_key,is_system,is_editable,is_deletable")
        .eq("organization_id", auth.tenantId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw app.httpErrors.internalServerError(error.message);

      // Fetch permissions for all roles
      const roleIds = (roles ?? []).map((r) => r.id);
      const { data: allPerms } = await supabaseAdmin
        .from("role_permissions")
        .select("role_id,permission_id")
        .in("role_id", roleIds);

      const permsByRole = new Map<string, string[]>();
      for (const rp of allPerms ?? []) {
        const existing = permsByRole.get(rp.role_id) ?? [];
        existing.push(rp.permission_id);
        permsByRole.set(rp.role_id, existing);
      }

      return {
        roles: (roles ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          systemKey: r.system_key ?? null,
          isSystem: r.is_system,
          isEditable: r.is_editable,
          isDeletable: r.is_deletable,
          permissions: permsByRole.get(r.id) ?? [],
        })),
      };
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
      const { data: role, error } = await supabaseAdmin
        .from("roles")
        .select("id,name,description,system_key,is_system,is_editable,is_deletable")
        .eq("id", request.params.roleId)
        .eq("organization_id", auth.tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw app.httpErrors.internalServerError(error.message);
      if (!role) throw app.httpErrors.notFound("Role not found");

      const { data: perms } = await supabaseAdmin
        .from("role_permissions")
        .select("permission_id")
        .eq("role_id", role.id);

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        systemKey: role.system_key ?? null,
        isSystem: role.is_system,
        isEditable: role.is_editable,
        isDeletable: role.is_deletable,
        permissions: (perms ?? []).map((p) => p.permission_id),
      };
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
      const resolved = request.resolvedAuth!;

      // Validate permission keys
      const invalidPerms = request.body.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as any));
      if (invalidPerms.length > 0) {
        throw app.httpErrors.badRequest(`Invalid permissions: ${invalidPerms.join(", ")}`);
      }

      // Escalation check: cannot assign permissions you don't have (for critical ones)
      if (!canAssignPermissions(resolved, request.body.permissions as any)) {
        throw app.httpErrors.forbidden("Cannot assign critical permissions you do not possess");
      }

      const id = randomUUID();
      const { error } = await supabaseAdmin.from("roles").insert({
        id,
        organization_id: auth.tenantId,
        name: request.body.name.trim(),
        description: request.body.description?.trim() ?? "",
        system_key: null,
        is_system: false,
        is_editable: true,
        is_deletable: true,
      });
      if (error) throw app.httpErrors.badRequest(error.message);

      // Insert permissions
      const permRows = request.body.permissions.map((permKey) => ({
        role_id: id,
        permission_id: permKey,
      }));
      if (permRows.length > 0) {
        await supabaseAdmin.from("role_permissions").insert(permRows);
      }

      return {
        id,
        name: request.body.name.trim(),
        description: request.body.description?.trim() ?? "",
        systemKey: null,
        isSystem: false,
        isEditable: true,
        isDeletable: true,
        permissions: request.body.permissions,
      };
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
      const resolved = request.resolvedAuth!;

      const { data: existing } = await supabaseAdmin
        .from("roles")
        .select("id,organization_id,name,description,system_key,is_system,is_editable,is_deletable")
        .eq("id", request.params.roleId)
        .eq("organization_id", auth.tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!existing) throw app.httpErrors.notFound("Role not found");
      if (!existing.is_editable) throw app.httpErrors.forbidden("This role cannot be edited");

      // Escalation check: cannot edit roles at or above your level
      if (!canManageRole(resolved, existing.system_key)) {
        throw app.httpErrors.forbidden("Cannot edit a role at or above your own level");
      }

      // Update role metadata
      const updates: Partial<{ name: string; description: string }> = {};
      if (request.body.name !== undefined) updates.name = request.body.name.trim();
      if (request.body.description !== undefined) updates.description = request.body.description.trim();

      if (Object.keys(updates).length > 0) {
        const { error } = await supabaseAdmin
          .from("roles")
          .update(updates)
          .eq("id", request.params.roleId)
          .eq("organization_id", auth.tenantId);
        if (error) throw app.httpErrors.badRequest(error.message);
      }

      // Update permissions if provided
      let finalPermissions: string[];
      if (request.body.permissions !== undefined) {
        const invalidPerms = request.body.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as any));
        if (invalidPerms.length > 0) {
          throw app.httpErrors.badRequest(`Invalid permissions: ${invalidPerms.join(", ")}`);
        }

        if (!canAssignPermissions(resolved, request.body.permissions as any)) {
          throw app.httpErrors.forbidden("Cannot assign critical permissions you do not possess");
        }

        // Atomically replace all permissions for this role via RPC
        const { error: rpcError } = await (supabaseAdmin.rpc as any)("replace_role_permissions", {
          _role_id: request.params.roleId,
          _permission_ids: request.body.permissions,
        });
        if (rpcError) throw app.httpErrors.internalServerError(rpcError.message);
        finalPermissions = request.body.permissions;
      } else {
        const { data: perms } = await supabaseAdmin
          .from("role_permissions")
          .select("permission_id")
          .eq("role_id", request.params.roleId);
        finalPermissions = (perms ?? []).map((p) => p.permission_id);
      }

      return {
        id: existing.id,
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        systemKey: existing.system_key ?? null,
        isSystem: existing.is_system,
        isEditable: existing.is_editable,
        isDeletable: existing.is_deletable,
        permissions: finalPermissions,
      };
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
      const resolved = request.resolvedAuth!;

      const { data: existing } = await supabaseAdmin
        .from("roles")
        .select("id,organization_id,system_key,is_deletable")
        .eq("id", request.params.roleId)
        .eq("organization_id", auth.tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!existing) throw app.httpErrors.notFound("Role not found");
      if (!existing.is_deletable) throw app.httpErrors.forbidden("This role cannot be deleted");

      // Escalation check
      if (!canManageRole(resolved, existing.system_key)) {
        throw app.httpErrors.forbidden("Cannot delete a role at or above your own level");
      }

      // Check if any memberships still use this role
      const { count } = await supabaseAdmin
        .from("organization_memberships")
        .select("id", { count: "exact", head: true })
        .eq("role_id", request.params.roleId)
        .eq("status", "active");
      if (count && count > 0) {
        throw app.httpErrors.conflict(`Cannot delete role — it is still assigned to ${count} member(s). Reassign them first.`);
      }

      // Soft delete
      const { error } = await supabaseAdmin
        .from("roles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", request.params.roleId)
        .eq("organization_id", auth.tenantId);
      if (error) throw app.httpErrors.badRequest(error.message);

      return { success: true as const };
    },
  );

  // List all available permission keys (for frontend role editor)
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
    async () => {
      // Return from constants — no DB query needed
      const { PERMISSION_DEFINITIONS } = await import("../../shared/permissions/constants.js");
      return {
        permissions: PERMISSION_DEFINITIONS.map((def) => ({
          key: def.key,
          resource: def.resource,
          action: def.action,
          description: def.description,
        })),
      };
    },
  );
}
