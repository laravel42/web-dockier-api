/**
 * Role Assignment Helpers
 *
 * Internal helpers for validating and managing role assignments
 * within the users service. Extracted from users.ts for clarity
 * and independent testability.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { canManageRole, type ResolvedAuth } from "../../../shared/permissions/authorization.js";
import { UsersError } from "./users.js";

/**
 * Validate that a role exists in the tenant, is not soft-deleted, and that the
 * actor has sufficient hierarchy level to assign it. Returns the role row on success.
 */
export async function validateRoleAssignment(roleId: string, tenantId: string, actor: ResolvedAuth) {
  const { data: role, error } = await supabaseAdmin
    .from("roles")
    .select("id,system_key")
    .eq("id", roleId)
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new UsersError("Failed to look up role", "internal");
  if (!role) throw new UsersError("Role not found", "bad_request");
  if (!canManageRole(actor, role.system_key)) {
    throw new UsersError("Cannot assign a role at or above your own level", "forbidden");
  }
  return role;
}

export async function assignRoleToUser(
  userId: string,
  tenantId: string,
  roleId: string,
  resolvedAuth: ResolvedAuth,
) {
  await validateRoleAssignment(roleId, tenantId, resolvedAuth);

  const { error: membershipError } = await supabaseAdmin.from("organization_memberships").insert({
    organization_id: tenantId,
    user_id: userId,
    role_id: roleId,
    is_owner: false,
    status: "active",
  });
  if (membershipError) {
    if (membershipError.code === "23505") throw new UsersError("User is already a member of this organization", "bad_request");
    throw new UsersError("Failed to create membership", "internal");
  }
}

export async function updateUserRole(
  userId: string,
  tenantId: string,
  roleId: string,
  resolvedAuth: ResolvedAuth,
) {
  // Check for existing membership
  const { data: targetMembership, error: membershipLookupError } = await supabaseAdmin
    .from("organization_memberships")
    .select("is_owner,role_id,roles!left(system_key)")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle() as { data: { is_owner: boolean; role_id: string | null; roles: { system_key: string | null } | null } | null; error: unknown };
  if (membershipLookupError) throw new UsersError("Failed to look up membership", "internal");

  // If no active membership exists, create one (user was created without a role)
  if (!targetMembership) {
    await assignRoleToUser(userId, tenantId, roleId, resolvedAuth);
    return;
  }

  if (targetMembership.is_owner) {
    throw new UsersError("Cannot change the role of the organization owner", "forbidden");
  }

  // Prevent changing role of users at or above actor's level
  const targetCurrentSystemKey = targetMembership?.roles?.system_key ?? null;
  if (!canManageRole(resolvedAuth, targetCurrentSystemKey)) {
    throw new UsersError("Cannot change the role of a user at or above your own level", "forbidden");
  }

  // Validate target role
  await validateRoleAssignment(roleId, tenantId, resolvedAuth);

  const { error: updateError } = await supabaseAdmin
    .from("organization_memberships")
    .update({ role_id: roleId })
    .eq("organization_id", tenantId)
    .eq("user_id", userId);
  if (updateError) throw new UsersError("Failed to update role assignment", "internal");
}
