import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapList } from "../../../shared/supabase/query.js";
import { invalidatePermissionCache } from "../../../shared/permissions/authorization.js";
import { seedDefaultRoles } from "../../roles/seed.js";
import { countRecoveryCodes } from "./two-factor.js";

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

  const rows = unwrapList(data, error, MembershipError, {
    internalMsg: "Failed to list memberships",
  }) as unknown as Array<{
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

  throwOnError(membershipError, MembershipError, { internalMsg: "Failed to resolve membership" });

  if (!membership?.role_id) {
    return { permissions: [], roleId: "", roleName: "", systemKey: null, isOwner: false };
  }

  const { data: role, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id, name, system_key")
    .eq("id", membership.role_id)
    .maybeSingle();

  throwOnError(roleError, MembershipError, { internalMsg: "Failed to resolve role" });

  if (!role) {
    return { permissions: [], roleId: "", roleName: "", systemKey: null, isOwner: membership.is_owner ?? false };
  }

  const { data: rolePerms, error: permsError } = await supabaseAdmin
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", role.id);

  const permRows = unwrapList(rolePerms, permsError, MembershipError, { internalMsg: "Failed to resolve permissions" });

  return {
    permissions: permRows.map((rp) => rp.permission_id),
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
    throwOnError(error, MembershipError, { internalMsg: "Failed to assign default role" });
    invalidatePermissionCache(userId, tenantId);
    resolved = await resolveUserPermissions(userId, tenantId);
  }

  return resolved;
}

export const MembershipError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("MembershipError");
export type MembershipError = InstanceType<typeof MembershipError>;

/**
 * Get the authenticated user's profile, permissions, and memberships.
 * Used by the /auth/me endpoint.
 */
export async function getAuthenticatedUser(userId: string, tenantId: string) {
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id,email,name,two_factor_enabled,two_factor_recovery_codes")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw new MembershipError("Failed to fetch user", "internal", userError);
  if (!user) throw new MembershipError("User not found", "not_found");

  const [resolved, memberships] = await Promise.all([
    resolvePermissionsWithMigration(userId, tenantId),
    listMembershipsForUser(userId),
  ]);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    tenantId,
    roleId: resolved.roleId,
    roleName: resolved.roleName,
    systemKey: resolved.systemKey,
    isOwner: resolved.isOwner,
    permissions: resolved.permissions,
    memberships,
    twoFactorEnabled: user.two_factor_enabled ?? false,
    twoFactorRecoveryCodesRemaining: countRecoveryCodes(user.two_factor_recovery_codes),
  };
}
