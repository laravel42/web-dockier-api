import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery } from "../../../shared/supabase/query.js";
import type { Database } from "../../../shared/supabase/types.js";
import { canManageRole, type ResolvedAuth } from "../../../shared/permissions/authorization.js";
import { escapePostgrestFilter } from "../../../shared/security.js";
import { rowToUser } from "./mappers.js";

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
  if (authError) throw new UsersError("Failed to create auth user", "bad_request", authError);

  const id = authUser.user.id;
  const now = new Date().toISOString();

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

  const { data: created, error: fetchError } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
    .eq("id", id)
    .single();
  if (fetchError) throw new UsersError("Failed to fetch created user", "internal");
  if (!created) throw new UsersError("Failed to fetch created user", "internal");
  return rowToUser(created);
}

export async function getUser(userId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
    .eq("id", userId)
    .eq("organization_id", tenantId)
    .single();
  const user = unwrapQuery(data, error, UsersError, {
    notFoundMsg: "User not found",
    internalMsg: "Failed to fetch user",
  });
  return rowToUser(user);
}

export interface ListUsersParams {
  tenantId: string;
  limit: number;
  offset: number;
  search?: string;
}

export async function listUsers(params: ListUsersParams) {
  const { tenantId, limit, offset, search } = params;

  let query = supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at", { count: "exact" })
    .eq("organization_id", tenantId)
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  if (search) {
    const escaped = escapePostgrestFilter(search);
    query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
  }

  const { data, count, error } = await query;
  throwOnError(error, UsersError, { internalMsg: "Failed to list users" });

  // Fetch membership + role info
  const userIds = (data ?? []).map((u) => u.id);
  if (userIds.length === 0) return { users: [], pagination: { total: 0, limit, offset } };

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
    users: (data ?? []).map((row) => {
      const membership = membershipByUser.get(row.id);
      return {
        ...rowToUser(row),
        roleId: membership?.role_id ?? "",
        roleName: membership?.roles?.name ?? "",
        isOwner: membership?.is_owner ?? false,
      };
    }),
    pagination: { total: count ?? 0, limit, offset },
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

  const updates: Database["public"]["Tables"]["users"]["Update"] = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.avatarUrl !== undefined) updates.avatar_url = params.avatarUrl;
  if (params.country !== undefined) updates.country = params.country;
  if (params.language !== undefined) updates.language = params.language;
  if (params.timezone !== undefined) updates.timezone = params.timezone;
  updates.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("id", userId)
    .eq("organization_id", tenantId);
  throwOnError(error, UsersError, { internalMsg: "Failed to update user" });

  // Update role assignment if provided
  if (roleId !== undefined) {
    await updateUserRole(userId, tenantId, roleId, resolvedAuth);
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
    .eq("id", userId)
    .eq("organization_id", tenantId)
    .single();
  const updated = unwrapQuery(data, fetchError, UsersError, {
    notFoundMsg: "User not found",
    internalMsg: "Failed to fetch user",
  });
  return rowToUser(updated);
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
    .select("is_owner, roles!left(system_key)")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle() as { data: { is_owner: boolean; roles: { system_key: string | null } | null } | null; error: unknown };
  if (membershipErr) throw new UsersError("Failed to check membership", "internal");
  if (!targetMembership) throw new UsersError("User is not a member of this organization", "not_found");
  if (targetMembership.is_owner) {
    throw new UsersError("Cannot remove the organization owner", "forbidden");
  }

  // Prevent removing users at or above actor's level
  const targetSystemKey = targetMembership.roles?.system_key ?? null;
  if (!canManageRole(resolvedAuth, targetSystemKey)) {
    throw new UsersError("Cannot remove a user at or above your own level", "forbidden");
  }

  const { error } = await supabaseAdmin
    .from("organization_memberships")
    .delete()
    .eq("organization_id", tenantId)
    .eq("user_id", userId);
  throwOnError(error, UsersError, { internalMsg: "Failed to remove user" });

  // Remove the user from the tenant's users table so they no longer appear in listings
  const { error: userDeleteError } = await supabaseAdmin
    .from("users")
    .delete()
    .eq("id", userId)
    .eq("organization_id", tenantId);
  throwOnError(userDeleteError, UsersError, { internalMsg: "Failed to remove user record" });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Validate that a role exists in the tenant, is not soft-deleted, and that the
 * actor has sufficient hierarchy level to assign it. Returns the role row on success.
 */
async function validateRoleAssignment(roleId: string, tenantId: string, actor: ResolvedAuth) {
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

async function assignRoleToUser(
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

async function updateUserRole(
  userId: string,
  tenantId: string,
  roleId: string,
  resolvedAuth: ResolvedAuth,
) {
  // Prevent changing role of the organization owner
  const { data: targetMembership, error: membershipLookupError } = await supabaseAdmin
    .from("organization_memberships")
    .select("is_owner,role_id,roles!left(system_key)")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle() as { data: { is_owner: boolean; role_id: string | null; roles: { system_key: string | null } | null } | null; error: unknown };
  if (membershipLookupError) throw new UsersError("Failed to look up membership", "internal");
  if (!targetMembership) {
    throw new UsersError("User is not an active member of this organization", "not_found");
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
