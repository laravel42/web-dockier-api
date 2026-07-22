import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, throwOnMutationError } from "../../../shared/supabase/query.js";
import { invalidatePermissionCache } from "../../../shared/permissions/authorization.js";
import { seedDefaultRoles } from "../../roles/seed.js";
import { signTenantToken } from "./session.js";
import { slugifyTenant } from "./registration.js";
import { emit } from "../../../shared/events.js";

export interface CreateTenantParams {
  name: string;
  userId: string;
  email: string;
}

export interface CreateTenantResult {
  tenantId: string;
  slug: string;
  session: { token: string; userId: string; tenantId: string };
}

/**
 * Create a new organization and make the user Primary Owner.
 */
export async function createTenant(params: CreateTenantParams): Promise<CreateTenantResult> {
  const { name, userId, email } = params;
  const slug = `${slugifyTenant(name) || "workspace"}-${userId.slice(0, 6)}`;

  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .insert({ name, slug, created_by: userId })
    .select("id,slug")
    .single();
  if (orgError || !org) throw new TenantError("Unable to create tenant", "bad_request", orgError);

  const { adminRoleId } = await seedDefaultRoles(org.id);

  const { error: membershipError } = await supabaseAdmin.from("organization_memberships").insert({
    organization_id: org.id,
    user_id: userId,
    role_id: adminRoleId,
    is_owner: true,
    status: "active",
  });
  throwOnMutationError(membershipError, TenantError, { internalMsg: "Failed to create owner membership" });

  emit("tenant:created", { tenantId: org.id });

  return {
    tenantId: org.id,
    slug: org.slug,
    session: {
      token: signTenantToken({ userId, email, tenantId: org.id }),
      userId,
      tenantId: org.id,
    },
  };
}

export interface SwitchTenantParams {
  tenantId: string;
  userId: string;
  email: string;
}

/**
 * Switch active tenant — validates membership and issues a new JWT.
 */
export async function switchTenant(params: SwitchTenantParams): Promise<{ token: string; userId: string; tenantId: string }> {
  const { tenantId, userId, email } = params;

  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("status")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  throwOnError(error, TenantError, { internalMsg: "Failed to verify membership" });
  if (!data) throw new TenantError("No membership in requested tenant", "forbidden");
  if (data.status !== "active") throw new TenantError("Membership is not active", "forbidden");

  return {
    token: signTenantToken({ userId, email, tenantId }),
    userId,
    tenantId,
  };
}

export interface TransferOwnershipParams {
  tenantId: string;
  currentOwnerId: string;
  targetUserId: string;
}

/**
 * Transfer organization ownership to another active member.
 */
export async function transferOwnership(params: TransferOwnershipParams): Promise<void> {
  const { tenantId, currentOwnerId, targetUserId } = params;

  if (targetUserId === currentOwnerId) {
    throw new TenantError("You are already the owner", "bad_request");
  }

  // Verify target is an active member
  const { data: targetMembership, error: membershipError } = await supabaseAdmin
    .from("organization_memberships")
    .select("id, status")
    .eq("organization_id", tenantId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  throwOnError(membershipError, TenantError, { internalMsg: "Failed to verify target membership" });
  if (!targetMembership) throw new TenantError("Target user is not a member of this organization", "not_found");
  if (targetMembership.status !== "active") throw new TenantError("Target member is not active", "bad_request");

  // Atomic ownership transfer via RPC
  const transferOwnershipRpc = supabaseAdmin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>;
  const { error: rpcError } = await transferOwnershipRpc("transfer_ownership", {
    _organization_id: tenantId,
    _current_owner_id: currentOwnerId,
    _new_owner_id: targetUserId,
  });
  if (rpcError) throw new TenantError("Failed to transfer ownership", "internal", rpcError);

  invalidatePermissionCache(currentOwnerId, tenantId);
  invalidatePermissionCache(targetUserId, tenantId);
}

export const TenantError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("TenantError");
export type TenantError = InstanceType<typeof TenantError>;
