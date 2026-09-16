/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapList, unwrapQuery } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import { ALL_PERMISSIONS, type PermissionKey } from "../../../shared/permissions/constants.js";
import { canManageRole, type ResolvedAuth } from "../../../shared/permissions/authorization.js";
import { SYSTEM_ROLE_KEYS } from "../../../shared/permissions/role-templates.js";
import { rowToRole } from "./mappers.js";

/** Type guard: is a raw string a known permission key? */
function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export const RolesError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "conflict" | "internal">("RolesError");
export type RolesError = InstanceType<typeof RolesError>;

export interface RoleResponse {
  id: string;
  name: string;
  description: string;
  systemKey: string | null;
  isSystem: boolean;
  isEditable: boolean;
  isDeletable: boolean;
  permissions: string[];
}

export async function listRoles(tenantId: string): Promise<{ roles: RoleResponse[] }> {

  const { data: roles, error } = await supabaseAdmin
    .from("roles")
    .select("id,name,description,system_key,is_system,is_editable,is_deletable")
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const roleRows = unwrapList(roles, error, RolesError, { internalMsg: "Failed to list roles" });

  const roleIds = roleRows.map((r) => r.id);
  if (roleIds.length === 0) return { roles: [] };

  const { data: allPerms, error: permsError } = await supabaseAdmin
    .from("role_permissions")
    .select("role_id,permission_id")
    .in("role_id", roleIds);
  const permRows = unwrapList(allPerms, permsError, RolesError, { internalMsg: "Failed to fetch role permissions" });

  const permsByRole = new Map<string, string[]>();
  for (const rp of permRows) {
    const existing = permsByRole.get(rp.role_id) ?? [];
    existing.push(rp.permission_id);
    permsByRole.set(rp.role_id, existing);
  }

  return {
    roles: roleRows.map((r) => rowToRole(r, permsByRole.get(r.id) ?? [])),
  };
}

export async function getRole(roleId: string, tenantId: string): Promise<RoleResponse> {
  const { data: role, error } = await supabaseAdmin
    .from("roles")
    .select("id,name,description,system_key,is_system,is_editable,is_deletable")
    .eq("id", roleId)
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  const found = unwrapQuery(role, error, RolesError, {
    notFoundMsg: "Role not found",
    internalMsg: "Failed to fetch role",
  });

  const { data: perms, error: permsError } = await supabaseAdmin
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", found.id);
  const permRows = unwrapList(perms, permsError, RolesError, { internalMsg: "Failed to fetch role permissions" });

  return rowToRole(found, permRows.map((p) => p.permission_id));
}

export interface CreateRoleParams {
  tenantId: string;
  name: string;
  description?: string;
  permissions: string[];
  resolvedAuth: ResolvedAuth;
}

export async function createRole(params: CreateRoleParams): Promise<RoleResponse> {
  const { tenantId, name, description, permissions, resolvedAuth } = params;

  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 80) {
    throw new RolesError("Role name must be between 2 and 80 characters", "bad_request");
  }
  if (description && description.trim().length > 300) {
    throw new RolesError("Role description must be at most 300 characters", "bad_request");
  }

  // Validate permission keys
  const invalidPerms = permissions.filter((p) => !isPermissionKey(p));
  if (invalidPerms.length > 0) {
    throw new RolesError(`Invalid permissions: ${invalidPerms.join(", ")}`, "bad_request");
  }

  // Escalation check: cannot assign permissions you don't have
  const hasAllPerms = resolvedAuth.isOwner || permissions.every((p) => resolvedAuth.permissions.includes(p as PermissionKey));
  if (!hasAllPerms) {
    throw new RolesError("Cannot assign permissions you do not possess", "forbidden");
  }

  const id = randomUUID();
  const { error } = await supabaseAdmin.from("roles").insert({
    id,
    organization_id: tenantId,
    name: trimmedName,
    description: description?.trim() ?? "",
    system_key: null,
    is_system: false,
    is_editable: true,
    is_deletable: true,
  });
  throwOnError(error, RolesError, {
    internalMsg: "Failed to create role",
    duplicateMsg: "A role with this name already exists",
  });

  // Insert permissions
  if (permissions.length > 0) {
    const permRows = permissions.map((permKey) => ({ role_id: id, permission_id: permKey }));
    const { error: permError } = await supabaseAdmin.from("role_permissions").insert(permRows);
    if (permError) {
      // Clean up the orphaned role
      const { error: cleanupError } = await supabaseAdmin.from("roles").delete().eq("id", id);
      if (cleanupError) {
        logger.error({ err: cleanupError }, `Failed to clean up orphaned role ${id}`);
      }
      throw new RolesError("Failed to assign permissions", "internal", permError);
    }
  }

  return rowToRole(
    {
      id,
      name: trimmedName,
      description: description?.trim() ?? "",
      system_key: null,
      is_system: false,
      is_editable: true,
      is_deletable: true,
    },
    permissions,
  );
}

export interface UpdateRoleParams {
  roleId: string;
  tenantId: string;
  name?: string;
  description?: string;
  permissions?: string[];
  resolvedAuth: ResolvedAuth;
}

export async function updateRole(params: UpdateRoleParams): Promise<RoleResponse> {
  const { roleId, tenantId, resolvedAuth } = params;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("roles")
    .select("id,organization_id,name,description,system_key,is_system,is_editable,is_deletable")
    .eq("id", roleId)
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  const role = unwrapQuery(existing, fetchError, RolesError, {
    notFoundMsg: "Role not found",
    internalMsg: "Failed to fetch role",
  });
  if (!role.is_editable) throw new RolesError("This role cannot be edited", "forbidden");

  // Escalation check: cannot edit roles at or above your level
  if (!canManageRole(resolvedAuth, role.system_key)) {
    throw new RolesError("Cannot edit a role at or above your own level", "forbidden");
  }

  // Update role metadata
  const updates: Partial<{ name: string; description: string }> = {};
  if (params.name !== undefined) {
    const trimmedName = params.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      throw new RolesError("Role name must be between 2 and 80 characters", "bad_request");
    }
    updates.name = trimmedName;
  }
  if (params.description !== undefined) {
    const trimmedDesc = params.description.trim();
    if (trimmedDesc.length > 300) {
      throw new RolesError("Role description must be at most 300 characters", "bad_request");
    }
    updates.description = trimmedDesc;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin
      .from("roles")
      .update(updates)
      .eq("id", roleId)
      .eq("organization_id", tenantId);
    throwOnError(error, RolesError, {
      internalMsg: "Failed to update role",
      duplicateMsg: "A role with this name already exists",
    });
  }

  // Update permissions if provided
  let finalPermissions: string[];
  if (params.permissions !== undefined) {
    const invalidPerms = params.permissions.filter((p) => !isPermissionKey(p));
    if (invalidPerms.length > 0) {
      throw new RolesError(`Invalid permissions: ${invalidPerms.join(", ")}`, "bad_request");
    }
    // Escalation check: cannot assign permissions you don't have
    const hasAllPerms = resolvedAuth.isOwner || params.permissions.every((p) => resolvedAuth.permissions.includes(p as PermissionKey));
    if (!hasAllPerms) {
      throw new RolesError("Cannot assign permissions you do not possess", "forbidden");
    }

    const { error: rpcError } = await (supabaseAdmin.rpc as any)("replace_role_permissions", {
      _role_id: roleId,
      _permission_ids: params.permissions,
    });
    throwOnError(rpcError, RolesError, { internalMsg: "Failed to update permissions" });
    finalPermissions = params.permissions;
  } else {
    const { data: perms, error: permsError } = await supabaseAdmin
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", roleId);
    const permRows = unwrapList(perms, permsError, RolesError, { internalMsg: "Failed to fetch permissions" });
    finalPermissions = permRows.map((p) => p.permission_id);
  }

  return rowToRole(
    {
      id: role.id,
      name: updates.name ?? role.name,
      description: updates.description ?? role.description,
      system_key: role.system_key,
      is_system: role.is_system,
      is_editable: role.is_editable,
      is_deletable: role.is_deletable,
    },
    finalPermissions,
  );
}

export async function deleteRole(roleId: string, tenantId: string, resolvedAuth: ResolvedAuth) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("roles")
    .select("id,organization_id,system_key,is_deletable")
    .eq("id", roleId)
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  const role = unwrapQuery(existing, fetchError, RolesError, {
    notFoundMsg: "Role not found",
    internalMsg: "Failed to fetch role",
  });
  if (role.system_key === SYSTEM_ROLE_KEYS.ADMIN) {
    throw new RolesError("The Admin role cannot be deleted", "forbidden");
  }
  if (!role.is_deletable) throw new RolesError("This role cannot be deleted", "forbidden");

  // Escalation check
  if (!canManageRole(resolvedAuth, role.system_key)) {
    throw new RolesError("Cannot delete a role at or above your own level", "forbidden");
  }

  // Check if any memberships still use this role
  const { count, error: countError } = await supabaseAdmin
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId)
    .in("status", ["active", "pending"]);
  throwOnError(countError, RolesError, { internalMsg: "Failed to check role usage" });
  if (count && count > 0) {
    throw new RolesError(`Cannot delete role — it is still assigned to ${count} member(s). Reassign them first.`, "conflict");
  }

  // Soft delete
  const { error } = await supabaseAdmin
    .from("roles")
    .update({ deleted_at: nowIso() })
    .eq("id", roleId)
    .eq("organization_id", tenantId);
  throwOnError(error, RolesError, { internalMsg: "Failed to delete role" });
}
