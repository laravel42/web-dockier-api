import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
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
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { throwDomainError } from "../../shared/error-handler.js";
import { DomainError } from "../../shared/supabase/errors.js";

// Domain modules
import {
  listMembershipsForUser,
  resolvePermissionsWithMigration,
  addMemberToTenant,
  removeMemberFromTenant,
  listTenantMemberships,
} from "./domain/membership.js";
import {
  classifyAuthError,
  performDemoLogin,
  performPasswordLogin,
  verifyOtpAndProvision,
} from "./domain/registration.js";
import {
  createTenant,
  switchTenant,
  transferOwnership,
} from "./domain/tenant.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Demo Login ────────────────────────────────────────────────────────────

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
      return performDemoLogin();
    },
  );

  // ─── Password Login ────────────────────────────────────────────────────────

  typed.post(
    "/auth/password/login",
    {
      schema: {
        tags: ["auth"],
        summary: "Password-based login (development)",
        body: z.object({
          email: z.email(),
          password: z.string().min(1),
        }),
        response: {
          200: z.object({ session: authSessionSchema, memberships: z.array(membershipSchema) }),
        },
      },
    },
    async (request) => {
      if (env.NODE_ENV === "production") {
        throw app.httpErrors.forbidden("Password login is disabled in production.");
      }
      try {
        return await performPasswordLogin({
          email: request.body.email,
          password: request.body.password,
          supabaseUrl: env.SUPABASE_URL,
          supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        });
      } catch (err) {
        if (err instanceof DomainError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  // ─── Register Start (OTP) ─────────────────────────────────────────────────

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
      if (error) {
        const classified = classifyAuthError(error.message);
        if (classified.status === "rate_limit") throw app.httpErrors.tooManyRequests(classified.userMessage);
        if (classified.status === "forbidden") throw app.httpErrors.forbidden(classified.userMessage);
        throw app.httpErrors.badRequest(classified.userMessage);
      }
      return { success: true as const, message: "Signup started. Check your email for OTP or magic link." };
    },
  );

  // ─── Passwordless Start ────────────────────────────────────────────────────

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
      if (error) {
        const classified = classifyAuthError(error.message);
        if (classified.status === "rate_limit") throw app.httpErrors.tooManyRequests(classified.userMessage);
        if (classified.status === "forbidden") throw app.httpErrors.forbidden(classified.userMessage);
        throw app.httpErrors.badRequest(classified.userMessage);
      }
      return { success: true as const, message: "Passwordless sign-in started. Check your email for OTP or magic link." };
    },
  );

  // ─── Passwordless Verify ───────────────────────────────────────────────────

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
      try {
        return await verifyOtpAndProvision({
          email: request.body.email,
          token: request.body.token,
          type: request.body.type,
          tenantSlug: request.body.tenantSlug,
          tenantName: request.body.tenantName,
        });
      } catch (err) {
        if (err instanceof DomainError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  // ─── Auth Me ───────────────────────────────────────────────────────────────

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

      const resolved = await resolvePermissionsWithMigration(auth.userId, auth.tenantId);
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

  // ─── List My Memberships ───────────────────────────────────────────────────

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

  // ─── Create Tenant ─────────────────────────────────────────────────────────

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
      try {
        return await createTenant({ name: request.body.name, userId: auth.userId, email: auth.email });
      } catch (err) {
        if (err instanceof DomainError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  // ─── Switch Tenant ─────────────────────────────────────────────────────────

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
      try {
        return await switchTenant({ tenantId: request.params.tenantId, userId: auth.userId, email: auth.email });
      } catch (err) {
        if (err instanceof DomainError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  // ─── List Tenant Memberships (Admin) ───────────────────────────────────────

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
      try {
        const memberships = await listTenantMemberships(request.params.tenantId);
        return { memberships };
      } catch (err) {
        if (err instanceof DomainError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  // ─── Add Member to Tenant ──────────────────────────────────────────────────

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
      try {
        await addMemberToTenant({
          tenantId: auth.tenantId,
          email: request.body.email,
          roleId: request.body.roleId,
          actorHierarchyLevel: request.resolvedAuth!.hierarchyLevel,
        });
        return { success: true as const };
      } catch (err) {
        if (err instanceof DomainError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  // ─── Remove Member from Tenant ─────────────────────────────────────────────

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
      try {
        await removeMemberFromTenant({
          tenantId: request.params.tenantId,
          targetUserId: request.params.userId,
          actorUserId: auth.userId,
        });
        return { success: true as const };
      } catch (err) {
        if (err instanceof DomainError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  // ─── Transfer Ownership ────────────────────────────────────────────────────

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
      try {
        await transferOwnership({
          tenantId: request.params.tenantId,
          currentOwnerId: auth.userId,
          targetUserId: request.body.targetUserId,
        });
        return { success: true as const };
      } catch (err) {
        if (err instanceof DomainError) throwDomainError(app, err);
        throw err;
      }
    },
  );
}
