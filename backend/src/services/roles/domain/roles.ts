import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { ALL_PERMISSIONS } from "../../../shared/permissions/constants.js";
import { canManageRole, type ResolvedAuth } from "../../../shared/permissions/authorization.js";

export type RolesErrorCode = "not_found" | "forbidden" | "bad_request" | "conflict" | "internal";

export class RolesError extends Error {
  constructor(
    message: string,
    public readonly code: RolesErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RolesError";
  }
}

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
  if (!tenantId) throw new RolesError("Tenant ID is required", "bad_request");

  const { data: roles, error } = await supabaseAdmin
    .from("roles")
    .select("id,name,description,system_key,is_system,is_editable,is_deletable")
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new RolesError("Failed to list roles", "internal", error);

  const roleIds = (roles ?? []).map((r) => r.id);
  if (roleIds.length === 0) return { roles: [] };

  const { data: allPerms, error: permsError } = await supabaseAdmin
    .from("role_permissions")
    .select("role_id,permission_id")
    .in("role_id", roleIds);
  if (permsError) throw new RolesError("Failed to fetch role permissions", "internal", permsError);

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
}

export async function getRole(roleId: string, tenantId: string): Promise<RoleResponse> {
  const { data: role, error } = await supabaseAdmin
    .from("roles")
    .select("id,name,description,system_key,is_system,is_editable,is_deletable")
    .eq("id", roleId)
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new RolesError("Failed to fetch role", "internal", error);
  if (!role) throw new RolesError("Role not found", "not_found");

  const { data: perms, error: permsError } = await supabaseAdmin
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", role.id);
  if (permsError) throw new RolesError("Failed to fetch role permissions", "internal", permsError);

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
  if (!tenantId) throw new RolesError("Tenant ID is required", "bad_request");

  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 80) {
    throw new RolesError("Role name must be between 2 and 80 characters", "bad_request");
  }
  if (description && description.trim().length > 300) {
    throw new RolesError("Role description must be at most 300 characters", "bad_request");
  }

  // Validate permission keys
  const invalidPerms = permissions.filter((p) => !ALL_PERMISSIONS.includes(p as any));
  if (invalidPerms.length > 0) {
    throw new RolesError(`Invalid permissions: ${invalidPerms.join(", ")}`, "bad_request");
  }

  // Escalation check: cannot assign permissions you don't have
  const hasAllPerms = resolvedAuth.isOwner || permissions.every((p) => resolvedAuth.permissions.includes(p as any));
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
  if (error) {
    if (error.code === "23505") throw new RolesError("A role with this name already exists", "bad_request");
    throw new RolesError("Failed to create role", "internal", error);
  }

  // Insert permissions
  if (permissions.length > 0) {
    const permRows = permissions.map((permKey) => ({ role_id: id, permission_id: permKey }));
    const { error: permError } = await supabaseAdmin.from("role_permissions").insert(permRows);
    if (permError) {
      // Clean up the orphaned role
      const { error: cleanupError } = await supabaseAdmin.from("roles").delete().eq("id", id);
      if (cleanupError) {
        console.error(`Failed to clean up orphaned role ${id}:`, cleanupError);
      }
      throw new RolesError("Failed to assign permissions", "internal", permError);
    }
  }

  return {
    id,
    name: trimmedName,
    description: description?.trim() ?? "",
    systemKey: null,
    isSystem: false,
    isEditable: true,
    isDeletable: true,
    permissions,
  };
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
  if (fetchError) throw new RolesError("Failed to fetch role", "internal", fetchError);
  if (!existing) throw new RolesError("Role not found", "not_found");
  if (!existing.is_editable) throw new RolesError("This role cannot be edited", "forbidden");

  // Escalation check: cannot edit roles at or above your level
  if (!canManageRole(resolvedAuth, existing.system_key)) {
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
    if (error) {
      if (error.code === "23505") throw new RolesError("A role with this name already exists", "bad_request");
      throw new RolesError("Failed to update role", "internal", error);
    }
  }

  // Update permissions if provided
  let finalPermissions: string[];
  if (params.permissions !== undefined) {
    const invalidPerms = params.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as any));
    if (invalidPerms.length > 0) {
      throw new RolesError(`Invalid permissions: ${invalidPerms.join(", ")}`, "bad_request");
    }
    // Escalation check: cannot assign permissions you don't have
    const hasAllPerms = resolvedAuth.isOwner || params.permissions.every((p) => resolvedAuth.permissions.includes(p as any));
    if (!hasAllPerms) {
      throw new RolesError("Cannot assign permissions you do not possess", "forbidden");
    }

    const { error: rpcError } = await (supabaseAdmin.rpc as any)("replace_role_permissions", {
      _role_id: roleId,
      _permission_ids: params.permissions,
    });
    if (rpcError) throw new RolesError("Failed to update permissions", "internal", rpcError);
    finalPermissions = params.permissions;
  } else {
    const { data: perms, error: permsError } = await supabaseAdmin
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", roleId);
    if (permsError) throw new RolesError("Failed to fetch permissions", "internal", permsError);
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
}

export async function deleteRole(roleId: string, tenantId: string, resolvedAuth: ResolvedAuth) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("roles")
    .select("id,organization_id,system_key,is_deletable")
    .eq("id", roleId)
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) throw new RolesError("Failed to fetch role", "internal", fetchError);
  if (!existing) throw new RolesError("Role not found", "not_found");
  if (!existing.is_deletable) throw new RolesError("This role cannot be deleted", "forbidden");

  // Escalation check
  if (!canManageRole(resolvedAuth, existing.system_key)) {
    throw new RolesError("Cannot delete a role at or above your own level", "forbidden");
  }

  // Check if any memberships still use this role
  const { count, error: countError } = await supabaseAdmin
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId)
    .in("status", ["active", "pending"]);
  if (countError) throw new RolesError("Failed to check role usage", "internal", countError);
  if (count && count > 0) {
    throw new RolesError(`Cannot delete role — it is still assigned to ${count} member(s). Reassign them first.`, "conflict");
  }

  // Soft delete
  const { error } = await supabaseAdmin
    .from("roles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", roleId)
    .eq("organization_id", tenantId);
  if (error) throw new RolesError("Failed to delete role", "internal", error);
}
