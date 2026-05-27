import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { invalidatePermissionCache } from "../../../shared/permissions/authorization.js";
import { getHierarchyLevel } from "../../../shared/permissions/role-templates.js";
import { seedDefaultRoles } from "../../roles/seed.js";

export interface Membership {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roleName: string;
  isOwner: boolean;
}

export interface ResolvedPermissions {
  permissions: string[];
  roleId: string;
  roleName: string;
  systemKey: string | null;
  isOwner: boolean;
}

/**
 * List all active memberships for a user across organizations.
 */
export async function listMembershipsForUser(userId: string): Promise<Membership[]> {
  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("id,role_id,is_owner,organization_id,organizations!inner(id,name,slug),roles!left(name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    role_id: string | null;
    is_owner: boolean;
    organization_id: string;
    organizations: { id: string; name: string; slug: string };
    roles: { name: string } | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.organization_id,
    tenantName: row.organizations.name,
    tenantSlug: row.organizations.slug,
    roleName: row.roles?.name ?? "Member",
    isOwner: row.is_owner,
  }));
}

/**
 * Resolve permissions for a user in a tenant (role → role_permissions).
 * Throws on database errors to avoid silently masking failures as "no permissions".
 */
export async function resolveUserPermissions(userId: string, tenantId: string): Promise<ResolvedPermissions> {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_memberships")
    .select("role_id, is_owner")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw membershipError;

  if (!membership?.role_id) {
    return { permissions: [], roleId: "", roleName: "", systemKey: null, isOwner: false };
  }

  const { data: role, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id, name, system_key")
    .eq("id", membership.role_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (roleError) throw roleError;

  if (!role) {
    return { permissions: [], roleId: "", roleName: "", systemKey: null, isOwner: membership.is_owner ?? false };
  }

  const { data: rolePerms, error: permsError } = await supabaseAdmin
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", role.id);

  if (permsError) throw permsError;

  return {
    permissions: (rolePerms ?? []).map((rp) => rp.permission_id),
    roleId: role.id,
    roleName: role.name,
    systemKey: role.system_key ?? null,
    isOwner: membership.is_owner ?? false,
  };
}

/**
 * Resolve permissions with lazy migration: if no role assigned, seed defaults and assign member role.
 */
export async function resolvePermissionsWithMigration(userId: string, tenantId: string): Promise<ResolvedPermissions> {
  let resolved = await resolveUserPermissions(userId, tenantId);

  if (!resolved.roleId) {
    const seeded = await seedDefaultRoles(tenantId);
    const { error } = await supabaseAdmin
      .from("organization_memberships")
      .update({ role_id: seeded.memberRoleId })
      .eq("organization_id", tenantId)
      .eq("user_id", userId);
    if (error) throw error;
    invalidatePermissionCache(userId, tenantId);
    resolved = await resolveUserPermissions(userId, tenantId);
  }

  return resolved;
}

export interface AddMemberParams {
  tenantId: string;
  email: string;
  roleId: string;
  actorHierarchyLevel: number;
}

/**
 * Add an existing user to a tenant with the given role.
 * Validates role existence and prevents privilege escalation.
 */
export async function addMemberToTenant(params: AddMemberParams): Promise<void> {
  const { tenantId, email, roleId, actorHierarchyLevel } = params;

  // Validate the role exists in this org
  const { data: targetRole, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id, system_key")
    .eq("id", roleId)
    .eq("organization_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (roleError) throw new MembershipError(roleError.message, "internal");
  if (!targetRole) throw new MembershipError("Role not found in this organization", "not_found");

  // Escalation check: cannot assign a role more powerful than your own
  const targetLevel = getHierarchyLevel(targetRole.system_key);
  if (targetLevel < actorHierarchyLevel) {
    throw new MembershipError("Cannot assign a role more powerful than your own", "forbidden");
  }

  const { data: targetUser, error: userError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (userError) throw new MembershipError(userError.message, "internal");
  if (!targetUser) throw new MembershipError("User must sign in first before being added", "not_found");

  const { error } = await supabaseAdmin.from("organization_memberships").upsert(
    {
      organization_id: tenantId,
      user_id: targetUser.id,
      role_id: targetRole.id,
      is_owner: false,
      status: "active",
    },
    { onConflict: "organization_id,user_id" },
  );
  if (error) throw new MembershipError(error.message, "bad_request");

  invalidatePermissionCache(targetUser.id, tenantId);
}

export interface RemoveMemberParams {
  tenantId: string;
  targetUserId: string;
  actorUserId: string;
}

/**
 * Remove a member from a tenant. Cannot remove self or the owner.
 */
export async function removeMemberFromTenant(params: RemoveMemberParams): Promise<void> {
  const { tenantId, targetUserId, actorUserId } = params;

  if (targetUserId === actorUserId) {
    throw new MembershipError("Cannot remove yourself from the organization", "forbidden");
  }

  const { data: targetMembership, error: membershipError } = await supabaseAdmin
    .from("organization_memberships")
    .select("is_owner")
    .eq("organization_id", tenantId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (membershipError) throw new MembershipError(membershipError.message, "internal");
  if (!targetMembership) throw new MembershipError("Membership not found", "not_found");
  if (targetMembership.is_owner) {
    throw new MembershipError("Cannot remove the organization owner", "forbidden");
  }

  const { error } = await supabaseAdmin
    .from("organization_memberships")
    .delete()
    .eq("organization_id", tenantId)
    .eq("user_id", targetUserId);
  if (error) throw new MembershipError(error.message, "bad_request");

  invalidatePermissionCache(targetUserId, tenantId);
}

export type MembershipErrorCode = "not_found" | "forbidden" | "bad_request" | "internal";

export class MembershipError extends Error {
  constructor(
    message: string,
    public readonly code: MembershipErrorCode,
  ) {
    super(message);
    this.name = "MembershipError";
  }
}

/**
 * List memberships for a specific tenant (admin view with user details).
 */
export async function listTenantMemberships(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("id,role_id,is_owner,user_id,users!inner(email,name),roles!left(name)")
    .eq("organization_id", tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new MembershipError(error.message, "internal");

  const rows = (data ?? []) as Array<{
    id: string;
    role_id: string | null;
    is_owner: boolean;
    user_id: string;
    users: { email: string; name: string };
    roles: { name: string } | null;
  }>;

  return rows.map((item) => ({
    id: item.id,
    userId: item.user_id,
    email: item.users.email,
    name: item.users.name,
    roleName: item.roles?.name ?? "Member",
    isOwner: item.is_owner,
  }));
}
