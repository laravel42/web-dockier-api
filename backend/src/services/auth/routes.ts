import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  authMeSchema,
  authSessionSchema,
  membershipSchema,
  registerStartBodySchema,
  registerStartResponseSchema,
} from "./schemas.js";
import { env } from "../../shared/config.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { seedDefaultRoles } from "../roles/seed.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { getHierarchyLevel } from "../../shared/permissions/role-templates.js";
import { invalidatePermissionCache } from "../../shared/permissions/authorization.js";

function throwAuthStartError(app: FastifyInstance, message: string) {
  if (/rate limit|over_email_send_rate_limit|security purposes/i.test(message)) {
    throw app.httpErrors.tooManyRequests("Email rate limit exceeded. Please wait about 60 seconds before requesting another code.");
  }
  if (/signups?\s*(are)?\s*disabled|not allowed/i.test(message)) {
    throw app.httpErrors.forbidden("Signups are disabled in Supabase Auth. Enable email signups to allow registration.");
  }
  throw app.httpErrors.badRequest(message);
}

function slugifyTenant(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function signTenantToken(payload: { userId: string; email: string; tenantId: string }) {
  return jwt.sign(
    { userId: payload.userId, email: payload.email, tenantId: payload.tenantId },
    env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

async function listMembershipsForUser(userId: string) {
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

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const lowerEmail = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const matched = data.users.find((user) => (user.email ?? "").toLowerCase() === lowerEmail);
    if (matched?.id) return matched.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function resolveDemoAuthUser(email: string): Promise<string> {
  const existing = await findAuthUserIdByEmail(email);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: `Demo-${Date.now()}-Aa1!`,
    email_confirm: true,
    user_metadata: { display_name: "Demo User", demo_user: true },
  });
  if (error || !data.user?.id) {
    throw error ?? new Error("Unable to create demo auth user");
  }
  return data.user.id;
}

/**
 * Resolve permissions for a user in a tenant (used by /auth/me).
 */
async function resolveUserPermissions(userId: string, tenantId: string) {
  const { data: membership } = await supabaseAdmin
    .from("organization_memberships")
    .select("role_id, is_owner")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership?.role_id) return { permissions: [] as string[], roleId: "", roleName: "", systemKey: null as string | null, isOwner: false };

  const { data: role } = await supabaseAdmin
    .from("roles")
    .select("id, name, system_key")
    .eq("id", membership.role_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!role) return { permissions: [] as string[], roleId: "", roleName: "", systemKey: null as string | null, isOwner: membership.is_owner ?? false };

  const { data: rolePerms } = await supabaseAdmin
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", role.id);

  return {
    permissions: (rolePerms ?? []).map((rp) => rp.permission_id),
    roleId: role.id,
    roleName: role.name,
    systemKey: role.system_key ?? null,
    isOwner: membership.is_owner ?? false,
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/auth/demo-login",
    {
      schema: {
        tags: ["auth"],
        summary: "Development-only demo login",
        response: {
          200: z.object({ session: authSessionSchema, memberships: z.array(membershipSchema) }),
        },
      },
    },
    async () => {
      if (env.NODE_ENV === "production") {
        throw app.httpErrors.forbidden("Demo login is disabled in production.");
      }

      const demoTenantId = "00000000-0000-4000-8000-000000000010";
      const demoEmail = "demo@dockier.local";
      const demoName = "Demo User";
      const demoTenantName = "Demo Workspace";
      const demoTenantSlug = "demo-workspace";
      const now = new Date().toISOString();
      const demoUserId = await resolveDemoAuthUser(demoEmail);

      // Upsert user
      await supabaseAdmin.from("users").upsert(
        { id: demoUserId, email: demoEmail, name: demoName, organization_id: null, created_at: now },
        { onConflict: "id" },
      );

      // Upsert org
      await supabaseAdmin.from("organizations").upsert(
        { id: demoTenantId, name: demoTenantName, slug: demoTenantSlug, created_by: demoUserId },
        { onConflict: "id" },
      );

      // Sync user org
      await supabaseAdmin.from("users").update({ organization_id: demoTenantId, updated_at: now }).eq("id", demoUserId);

      // Seed roles
      const { adminRoleId } = await seedDefaultRoles(demoTenantId);

      // Upsert membership as owner
      await supabaseAdmin.from("organization_memberships").upsert(
        { organization_id: demoTenantId, user_id: demoUserId, role_id: adminRoleId, is_owner: true, status: "active" },
        { onConflict: "organization_id,user_id" },
      );

      return {
        session: {
          token: signTenantToken({ userId: demoUserId, email: demoEmail, tenantId: demoTenantId }),
          userId: demoUserId,
          tenantId: demoTenantId,
        },
        memberships: [
          { id: "00000000-0000-4000-8000-000000000099", tenantId: demoTenantId, tenantName: demoTenantName, tenantSlug: demoTenantSlug, roleName: "Admin", isOwner: true },
        ],
      };
    },
  );

  typed.post(
    "/auth/register/start",
    {
      schema: {
        tags: ["auth"],
        summary: "Start passwordless signup via Supabase OTP/magic link",
        body: registerStartBodySchema,
        response: { 200: registerStartResponseSchema },
      },
    },
    async (request) => {
      const { error } = await supabaseAdmin.auth.signInWithOtp({
        email: request.body.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: request.body.redirectTo,
          data: { display_name: request.body.displayName, tenant_name: request.body.tenantName },
        },
      });
      if (error) throwAuthStartError(app, error.message);
      return { success: true as const, message: "Signup started. Check your email for OTP or magic link." };
    },
  );

  typed.post(
    "/auth/passwordless/start",
    {
      schema: {
        tags: ["auth"],
        summary: "Start passwordless authentication via Supabase email OTP/magic link",
        body: z.object({ email: z.email(), redirectTo: z.string().url().optional() }),
        response: { 200: z.object({ success: z.literal(true), message: z.string() }) },
      },
    },
    async (request) => {
      const { error } = await supabaseAdmin.auth.signInWithOtp({
        email: request.body.email,
        options: { shouldCreateUser: false, emailRedirectTo: request.body.redirectTo },
      });
      if (error) throwAuthStartError(app, error.message);
      return { success: true as const, message: "Passwordless sign-in started. Check your email for OTP or magic link." };
    },
  );

  typed.post(
    "/auth/passwordless/verify",
    {
      schema: {
        tags: ["auth"],
        summary: "Verify OTP/magic link token and issue tenant-scoped API JWT",
        body: z.object({
          email: z.email(),
          token: z.string().min(4),
          type: z.enum(["email", "magiclink", "signup"]).default("email"),
          tenantSlug: z.string().min(2).max(60).optional(),
          tenantName: z.string().min(2).max(120).optional(),
        }),
        response: { 200: z.object({ session: authSessionSchema, memberships: z.array(membershipSchema) }) },
      },
    },
    async (request) => {
      const { data, error } = await supabaseAdmin.auth.verifyOtp({
        email: request.body.email,
        token: request.body.token,
        type: request.body.type,
      });
      if (error || !data.user) throw app.httpErrors.unauthorized(error?.message ?? "Invalid OTP token");

      const userId = data.user.id;
      const email = data.user.email ?? request.body.email;
      const displayName =
        (typeof data.user.user_metadata?.display_name === "string" && data.user.user_metadata.display_name) ||
        (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
        email.split("@")[0];
      const metadataTenantName =
        typeof data.user.user_metadata?.tenant_name === "string" ? data.user.user_metadata.tenant_name : undefined;

      // Upsert user record
      await supabaseAdmin.from("users").upsert(
        { id: userId, email, name: displayName, organization_id: null, created_at: new Date().toISOString() },
        { onConflict: "id" },
      );

      let memberships = await listMembershipsForUser(userId);
      let selected: (typeof memberships)[number] | undefined = memberships[0];

      if (request.body.tenantSlug) {
        selected = memberships.find((m) => m.tenantSlug === request.body.tenantSlug);
        if (!selected) throw app.httpErrors.forbidden("No membership in requested tenant");
      }

      // No existing membership — create a new org and make user Primary Owner
      if (!selected) {
        const tenantName = request.body.tenantName?.trim() || metadataTenantName || `${displayName}'s workspace`;
        const tenantSlugBase = slugifyTenant(tenantName) || "workspace";
        const tenantSlug = `${tenantSlugBase}-${userId.slice(0, 6)}`;

        const { data: org, error: orgError } = await supabaseAdmin
          .from("organizations")
          .insert({ name: tenantName, slug: tenantSlug, created_by: userId })
          .select("id,name,slug")
          .single();
        if (orgError || !org) throw app.httpErrors.internalServerError(orgError?.message ?? "Failed to create tenant");

        // Seed roles for the new org
        const { adminRoleId } = await seedDefaultRoles(org.id);

        // Create membership as Owner
        const { data: createdMembership, error: membershipError } = await supabaseAdmin
          .from("organization_memberships")
          .insert({
            organization_id: org.id,
            user_id: userId,
            role_id: adminRoleId,
            is_owner: true,
            status: "active",
          })
          .select("id,organization_id,is_owner")
          .single();
        if (membershipError || !createdMembership) {
          throw app.httpErrors.internalServerError(membershipError?.message ?? "Failed to create membership");
        }

        selected = {
          id: createdMembership.id,
          tenantId: org.id,
          tenantName: org.name,
          tenantSlug: org.slug,
          roleName: "Admin",
          isOwner: true,
        };
        memberships = [selected];
      }
      if (!selected) throw app.httpErrors.internalServerError("Unable to resolve tenant membership");

      // Sync user's active org
      await supabaseAdmin
        .from("users")
        .update({ organization_id: selected.tenantId, updated_at: new Date().toISOString() })
        .eq("id", userId);

      return {
        session: {
          token: signTenantToken({ userId, email, tenantId: selected.tenantId }),
          userId,
          tenantId: selected.tenantId,
        },
        memberships,
      };
    },
  );

  typed.get(
    "/auth/me",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["auth"],
        summary: "Get current user with tenant memberships and permissions",
        response: { 200: authMeSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("id,email,name")
        .eq("id", auth.userId)
        .maybeSingle();
      if (userError) throw app.httpErrors.internalServerError(userError.message);
      if (!user) throw app.httpErrors.notFound("User not found");

      // Resolve permissions from membership → role → role_permissions
      let resolved = await resolveUserPermissions(auth.userId, auth.tenantId);

      // Lazy migration: if no role_id on membership, seed roles and assign
      if (!resolved.roleId) {
        const seeded = await seedDefaultRoles(auth.tenantId);
        const fallbackRoleId = seeded.memberRoleId;
        await supabaseAdmin
          .from("organization_memberships")
          .update({ role_id: fallbackRoleId })
          .eq("organization_id", auth.tenantId)
          .eq("user_id", auth.userId);
        invalidatePermissionCache(auth.userId, auth.tenantId);
        resolved = await resolveUserPermissions(auth.userId, auth.tenantId);
      }

      const memberships = await listMembershipsForUser(auth.userId);

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        tenantId: auth.tenantId,
        roleId: resolved.roleId,
        roleName: resolved.roleName,
        systemKey: resolved.systemKey,
        isOwner: resolved.isOwner,
        permissions: resolved.permissions,
        memberships,
      };
    },
  );

  typed.get(
    "/auth/memberships",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["auth"],
        summary: "List memberships for authenticated user",
        response: { 200: z.object({ memberships: z.array(membershipSchema) }) },
      },
    },
    async (request) => {
      const memberships = await listMembershipsForUser(request.auth!.userId);
      return { memberships };
    },
  );

  typed.post(
    "/auth/tenants",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["auth"],
        summary: "Create a new organization and make current user Primary Owner",
        body: z.object({ name: z.string().min(2).max(120) }),
        response: { 200: z.object({ tenantId: z.string().uuid(), slug: z.string(), session: authSessionSchema }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const slug = `${slugifyTenant(request.body.name) || "workspace"}-${auth.userId.slice(0, 6)}`;
      const { data: org, error: orgError } = await supabaseAdmin
        .from("organizations")
        .insert({ name: request.body.name, slug, created_by: auth.userId })
        .select("id,slug")
        .single();
      if (orgError || !org) throw app.httpErrors.badRequest(orgError?.message ?? "Unable to create tenant");

      const { adminRoleId } = await seedDefaultRoles(org.id);

      await supabaseAdmin.from("organization_memberships").insert({
        organization_id: org.id,
        user_id: auth.userId,
        role_id: adminRoleId,
        is_owner: true,
        status: "active",
      });

      return {
        tenantId: org.id,
        slug: org.slug,
        session: {
          token: signTenantToken({ userId: auth.userId, email: auth.email, tenantId: org.id }),
          userId: auth.userId,
          tenantId: org.id,
        },
      };
    },
  );

  typed.post(
    "/auth/tenants/:tenantId/switch",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["auth"],
        summary: "Switch active tenant and issue a new JWT",
        params: z.object({ tenantId: z.string().uuid() }),
        response: { 200: authSessionSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await supabaseAdmin
        .from("organization_memberships")
        .select("status")
        .eq("organization_id", request.params.tenantId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (error) throw app.httpErrors.internalServerError(error.message);
      if (!data) throw app.httpErrors.forbidden("No membership in requested tenant");
      if (data.status !== "active") throw app.httpErrors.forbidden("Membership is not active");

      return {
        token: signTenantToken({ userId: auth.userId, email: auth.email, tenantId: request.params.tenantId }),
        userId: auth.userId,
        tenantId: request.params.tenantId,
      };
    },
  );

  typed.get(
    "/auth/tenants/:tenantId/memberships",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_VIEW),
      schema: {
        tags: ["auth"],
        summary: "List tenant memberships",
        params: z.object({ tenantId: z.string().uuid() }),
        response: {
          200: z.object({
            memberships: z.array(
              z.object({
                id: z.string().uuid(),
                userId: z.string().uuid(),
                email: z.email(),
                name: z.string(),
                roleName: z.string(),
                isOwner: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant to view its memberships");
      }

      const { data, error } = await supabaseAdmin
        .from("organization_memberships")
        .select("id,role_id,is_owner,user_id,users!inner(email,name),roles!left(name)")
        .eq("organization_id", request.params.tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw app.httpErrors.internalServerError(error.message);
      const rows = (data ?? []) as Array<{
        id: string;
        role_id: string | null;
        is_owner: boolean;
        user_id: string;
        users: { email: string; name: string };
        roles: { name: string } | null;
      }>;

      return {
        memberships: rows.map((item) => ({
          id: item.id,
          userId: item.user_id,
          email: item.users.email,
          name: item.users.name,
          roleName: item.roles?.name ?? "Member",
          isOwner: item.is_owner,
        })),
      };
    },
  );

  typed.post(
    "/auth/tenants/:tenantId/memberships",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["auth"],
        summary: "Add existing user to tenant",
        params: z.object({ tenantId: z.string().uuid() }),
        body: z.object({
          email: z.email(),
          roleId: z.string().min(1),
        }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before managing memberships");
      }

      // Validate the role exists in this org
      const { data: targetRole } = await supabaseAdmin
        .from("roles")
        .select("id, system_key")
        .eq("id", request.body.roleId)
        .eq("organization_id", auth.tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!targetRole) throw app.httpErrors.badRequest("Role not found in this organization");

      // Escalation check: cannot assign a role at or above your own level
      const resolved = request.resolvedAuth!;
      const targetLevel = getHierarchyLevel(targetRole.system_key);
      if (targetLevel <= resolved.hierarchyLevel) {
        throw app.httpErrors.forbidden("Cannot assign a role at or above your own level");
      }

      const { data: targetUser, error: userError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("email", request.body.email)
        .maybeSingle();
      if (userError) throw app.httpErrors.internalServerError(userError.message);
      if (!targetUser) throw app.httpErrors.notFound("User must sign in first before being added");

      const { error } = await supabaseAdmin.from("organization_memberships").upsert(
        {
          organization_id: request.params.tenantId,
          user_id: targetUser.id,
          role_id: targetRole.id,
          is_owner: false,
          status: "active",
        },
        { onConflict: "organization_id,user_id" },
      );
      if (error) throw app.httpErrors.badRequest(error.message);

      invalidatePermissionCache(targetUser.id, request.params.tenantId);
      return { success: true as const };
    },
  );

  // Remove member from tenant
  typed.delete(
    "/auth/tenants/:tenantId/memberships/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["auth"],
        summary: "Remove a member from the tenant",
        params: z.object({ tenantId: z.string().uuid(), userId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before managing memberships");
      }

      // Cannot remove yourself
      if (request.params.userId === auth.userId) {
        throw app.httpErrors.forbidden("Cannot remove yourself from the organization");
      }

      // Cannot remove the owner
      const { data: targetMembership } = await supabaseAdmin
        .from("organization_memberships")
        .select("is_owner")
        .eq("organization_id", request.params.tenantId)
        .eq("user_id", request.params.userId)
        .maybeSingle();
      if (!targetMembership) throw app.httpErrors.notFound("Membership not found");
      if (targetMembership.is_owner) {
        throw app.httpErrors.forbidden("Cannot remove the organization owner");
      }

      const { error } = await supabaseAdmin
        .from("organization_memberships")
        .delete()
        .eq("organization_id", request.params.tenantId)
        .eq("user_id", request.params.userId);
      if (error) throw app.httpErrors.badRequest(error.message);

      invalidatePermissionCache(request.params.userId, request.params.tenantId);
      return { success: true as const };
    },
  );

  // Transfer ownership
  typed.post(
    "/auth/tenants/:tenantId/transfer-ownership",
    {
      preHandler: app.requireOwner,
      schema: {
        tags: ["auth"],
        summary: "Transfer organization ownership to another member",
        params: z.object({ tenantId: z.string().uuid() }),
        body: z.object({ targetUserId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before transferring ownership");
      }

      if (request.body.targetUserId === auth.userId) {
        throw app.httpErrors.badRequest("You are already the owner");
      }

      // Verify target is an active member
      const { data: targetMembership } = await supabaseAdmin
        .from("organization_memberships")
        .select("id, status")
        .eq("organization_id", request.params.tenantId)
        .eq("user_id", request.body.targetUserId)
        .maybeSingle();
      if (!targetMembership) throw app.httpErrors.notFound("Target user is not a member of this organization");
      if (targetMembership.status !== "active") throw app.httpErrors.badRequest("Target member is not active");

      // Remove owner flag from current owner
      await supabaseAdmin
        .from("organization_memberships")
        .update({ is_owner: false })
        .eq("organization_id", request.params.tenantId)
        .eq("user_id", auth.userId);

      // Set owner flag on target
      await supabaseAdmin
        .from("organization_memberships")
        .update({ is_owner: true })
        .eq("organization_id", request.params.tenantId)
        .eq("user_id", request.body.targetUserId);

      invalidatePermissionCache(auth.userId, request.params.tenantId);
      invalidatePermissionCache(request.body.targetUserId, request.params.tenantId);
      return { success: true as const };
    },
  );
}
