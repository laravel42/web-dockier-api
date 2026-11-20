import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, normalizePagination, type PostgrestError } from "../../../shared/supabase/query.js";
import type { Database } from "../../../shared/supabase/types.js";
import { canManageRole, invalidatePermissionCache, loadRolePermissions, type ResolvedAuth } from "../../../shared/permissions/authorization.js";
import { logger } from "../../../shared/logger.js";
import { nowIso } from "../../../shared/utils/time.js";
import { rowToUser } from "./mappers.js";
import { validateRoleAssignment, assignRoleToUser, updateUserRole } from "./role-assignments.js";

export const UsersError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("UsersError");
export type UsersError = InstanceType<typeof UsersError>;

export interface CreateUserParams {
  tenantId: string;
  email: string;
  name: string;
  password?: string;
  country?: string;
  language?: string;
  timezone?: string;
  roleId?: string;
  resolvedAuth: ResolvedAuth;
}

export async function createUser(params: CreateUserParams) {
  const { tenantId, email, name, password, country, language, timezone, roleId, resolvedAuth } = params;
  if (!tenantId) throw new UsersError("Tenant ID is required", "bad_request");

  // Validate role upfront if provided to prevent orphaned auth/user records on failure
  if (roleId) {
    await validateRoleAssignment(roleId, tenantId, resolvedAuth);
  }

  // Create user in Supabase Auth
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: password || undefined,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (authError) {
    // Surface the actual Supabase Auth error message (e.g. "User already registered",
    // "Password should be at least 6 characters") instead of a generic message.
    const message = authError.message || "Failed to create auth user";
    throw new UsersError(message, "bad_request", authError);
  }

  const id = authUser.user.id;
  const now = nowIso();

  // Create public.users record
  const { error } = await supabaseAdmin.from("users").insert({
    id,
    email,
    name,
    organization_id: tenantId,
    password_hash: null,
    country: country ?? "",
    language: language ?? "en",
    timezone: timezone ?? "UTC",
    two_factor_enabled: false,
    created_at: now,
  });
  if (error) {
    // Clean up the created auth user to prevent orphaned auth accounts
    await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
    if (error.code === "23505") throw new UsersError("A user with this email already exists", "bad_request");
    throw new UsersError("Failed to create user record", "internal");
  }

  // Create organization membership with role
  if (roleId) {
    try {
      await assignRoleToUser(id, tenantId, roleId, resolvedAuth);
    } catch (assignError) {
      // Clean up both the auth user and the public.users record on membership failure
      await supabaseAdmin.from("users").delete().eq("id", id);
      await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
      throw assignError;
    }
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
    .eq("id", id)
    .single();
  const created = unwrapQuery(data, fetchError, UsersError, {
    notFoundMsg: "Failed to fetch created user",
    internalMsg: "Failed to fetch created user",
  });
  return rowToUser(created);
}

/**
 * Whether a person belongs to a tenant: an active membership, or the roleless account
 * this tenant created (users.organization_id). users.organization_id alone is ONE value
 * per person (the organization they last signed in to), so it cannot be the test for
 * someone who belongs to two.
 */
async function isTenantMember(userId: string, tenantId: string): Promise<boolean> {
  const [membership, user] = await Promise.all([
    supabaseAdmin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", tenantId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabaseAdmin.from("users").select("id").eq("id", userId).eq("organization_id", tenantId).maybeSingle(),
  ]);
  throwOnError(membership.error, UsersError, { internalMsg: "Failed to check membership" });
  throwOnError(user.error, UsersError, { internalMsg: "Failed to look up user" });
  return membership.data !== null || user.data !== null;
}

export async function getUser(userId: string, tenantId: string) {
  if (!(await isTenantMember(userId, tenantId))) throw new UsersError("User not found", "not_found");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
    .eq("id", userId)
    .single();
  const user = unwrapQuery(data, error, UsersError, {
    notFoundMsg: "User not found",
    internalMsg: "Failed to fetch user",
  });
  return { ...rowToUser(user), tenantId };
}

export interface ListUsersParams {
  tenantId: string;
  limit: number;
  offset: number;
  search?: string;
}

interface TenantUserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  country: string;
  language: string;
  timezone: string;
  organization_id: string | null;
  created_at: string;
  total_count: number;
}

export async function listUsers(params: ListUsersParams) {
  const { tenantId, search } = params;
  const { limit, offset } = normalizePagination(params);
  // By membership (migration 0094), not users.organization_id: see isTenantMember.
  const listTenantUsers = supabaseAdmin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: TenantUserRow[] | null; error: PostgrestError | null }>;
  const { data: rpcRows, error: listError } = await listTenantUsers.call(supabaseAdmin, "list_tenant_users", {
    p_tenant: tenantId,
    p_search: search ?? "",
    p_limit: limit,
    p_offset: offset,
  });
  throwOnError(listError, UsersError, { internalMsg: "Failed to list users" });
  const data = rpcRows ?? [];
  const count = data[0] ? Number(data[0].total_count) : 0;

  // Fetch membership + role info
  const userIds = data.map((u) => u.id);
  if (userIds.length === 0) return { users: [], total: count };

  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from("organization_memberships")
    .select("user_id,role_id,is_owner,roles!left(name)")
    .eq("organization_id", tenantId)
    .in("user_id", userIds)
    .eq("status", "active");
  throwOnError(membershipsError, UsersError, { internalMsg: "Failed to fetch memberships" });

  type MembershipRow = { user_id: string; role_id: string | null; is_owner: boolean; roles: { name: string } | null };
  const membershipByUser = new Map<string, MembershipRow>();
  for (const m of (memberships ?? []) as unknown as MembershipRow[]) {
    membershipByUser.set(m.user_id, m);
  }

  return {
    users: data.map((row) => {
      const membership = membershipByUser.get(row.id);
      return {
        ...rowToUser(row),
        tenantId,
        roleId: membership?.role_id ?? "",
        roleName: membership?.roles?.name ?? "",
        isOwner: membership?.is_owner ?? false,
      };
    }),
    total: count,
  };
}

export interface UpdateUserParams {
  userId: string;
  tenantId: string;
  name?: string;
  avatarUrl?: string | null;
  country?: string;
  language?: string;
  timezone?: string;
  roleId?: string;
  resolvedAuth: ResolvedAuth;
}

export async function updateUser(params: UpdateUserParams) {
  const { userId, tenantId, roleId, resolvedAuth } = params;
  if (!(await isTenantMember(userId, tenantId))) throw new UsersError("User not found", "not_found");

  const updates: Database["public"]["Tables"]["users"]["Update"] = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.avatarUrl !== undefined) updates.avatar_url = params.avatarUrl;
  if (params.country !== undefined) updates.country = params.country;
  if (params.language !== undefined) updates.language = params.language;
  if (params.timezone !== undefined) updates.timezone = params.timezone;
  updates.updated_at = nowIso();

  const { error } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("id", userId);
  throwOnError(error, UsersError, { internalMsg: "Failed to update user" });

  // Update role assignment if provided
  if (roleId !== undefined) {
    await updateUserRole(userId, tenantId, roleId, resolvedAuth);
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
    .eq("id", userId)
    .single();
  const updated = unwrapQuery(data, fetchError, UsersError, {
    notFoundMsg: "User not found",
    internalMsg: "Failed to fetch user",
  });
  return { ...rowToUser(updated), tenantId };
}

export interface RemoveUserParams {
  userId: string;
  tenantId: string;
  actorUserId: string;
  resolvedAuth: ResolvedAuth;
}

export async function removeUser(params: RemoveUserParams) {
  const { userId, tenantId, actorUserId, resolvedAuth } = params;

  if (userId === actorUserId) {
    throw new UsersError("Cannot remove yourself from the organization", "forbidden");
  }

  const { data: targetMembership, error: membershipErr } = await supabaseAdmin
    .from("organization_memberships")
    .select("is_owner, role_id, roles!left(system_key)")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle() as { data: { is_owner: boolean; role_id: string | null; roles: { system_key: string | null } | null } | null; error: PostgrestError | null };
  throwOnError(membershipErr, UsersError, { internalMsg: "Failed to check membership" });
  if (!targetMembership) throw new UsersError("User is not a member of this organization", "not_found");
  if (targetMembership.is_owner) {
    throw new UsersError("Cannot remove the organization owner", "forbidden");
  }

  // Prevent removing users at or above actor's level
  const targetSystemKey = targetMembership.roles?.system_key ?? null;
  if (!canManageRole(resolvedAuth, { systemKey: targetSystemKey, permissions: await loadRolePermissions(targetMembership.role_id) })) {
    throw new UsersError("Cannot remove a user at or above your own level", "forbidden");
  }

  const { error } = await supabaseAdmin
    .from("organization_memberships")
    .delete()
    .eq("organization_id", tenantId)
    .eq("user_id", userId);
  throwOnError(error, UsersError, { internalMsg: "Failed to remove user" });

  invalidatePermissionCache(userId, tenantId);
  await cleanUpAfterMembershipRemoval(userId, tenantId);
}
/**
 * The account belongs to the person, not to this tenant: it is deleted only when
 * no membership is left anywhere. memberships cascade from auth.users (0004), so
 * deleting it unconditionally wiped the user's access to every other organization.
 */
async function cleanUpAfterMembershipRemoval(userId: string, tenantId: string): Promise<void> {
  const { data: remaining, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("organization_id,status")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  throwOnError(error, UsersError, { internalMsg: "Failed to check remaining memberships" });
  // Any membership counts, active or not: deleting the account would cascade it away too.
  if (remaining && remaining.length > 0) {
    // Still a member elsewhere: only move their active organization off this one.
    const next = remaining.find((m) => m.status === "active")?.organization_id ?? null;
    const { error: moveError } = await supabaseAdmin
      .from("users")
      .update({ organization_id: next, updated_at: nowIso() })
      .eq("id", userId)
      .eq("organization_id", tenantId);
    throwOnError(moveError, UsersError, { internalMsg: "Failed to update the user's active organization" });
    return;
  }
  const { error: userDeleteError } = await supabaseAdmin.from("users").delete().eq("id", userId);
  throwOnError(userDeleteError, UsersError, { internalMsg: "Failed to remove user record" });
  // Remove from Supabase Auth so the email can be re-used
  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    // Log but don't fail — the user is already removed from the org.
    // A dangling auth record is less critical than blocking the operation.
    logger.warn({ userId, err: authDeleteError }, "[users] Failed to delete auth user from Supabase Auth");
  }
}


