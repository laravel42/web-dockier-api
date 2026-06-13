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
import { resolveSupabaseSecretKey } from "../../shared/supabase/keys.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import { rateLimit } from "../../shared/rate-limit.js";

// Domain modules
import {
  listMembershipsForUser,
  getAuthenticatedUser,
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
import { setupTwoFactor, enableTwoFactor } from "./domain/two-factor.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Rate limiters for public auth endpoints
  const authStartLimit = rateLimit({ max: 5, windowMs: 60_000, prefix: "auth-start" });
  const authVerifyLimit = rateLimit({ max: 10, windowMs: 60_000, prefix: "auth-verify" });
  const authLoginLimit = rateLimit({ max: 10, windowMs: 60_000, prefix: "auth-login" });
  const auth2faLimit = rateLimit({ max: 10, windowMs: 60_000, prefix: "auth-2fa" });

  // ─── Demo Login ────────────────────────────────────────────────────────────

  typed.post(
    "/auth/demo-login",
    {
      preHandler: authLoginLimit,
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
      preHandler: authLoginLimit,
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
      return await performPasswordLogin({
        email: request.body.email,
        password: request.body.password,
        supabaseUrl: env.SUPABASE_URL,
        supabaseSecretKey: resolveSupabaseSecretKey(env),
      });
    },
  );

  // ─── Register Start (OTP) ─────────────────────────────────────────────────

  typed.post(
    "/auth/register/start",
    {
      preHandler: authStartLimit,
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
      preHandler: authStartLimit,
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
      preHandler: authVerifyLimit,
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
      return await verifyOtpAndProvision({
        email: request.body.email,
        token: request.body.token,
        type: request.body.type,
        tenantSlug: request.body.tenantSlug,
        tenantName: request.body.tenantName,
      });
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
      return await getAuthenticatedUser(auth.userId, auth.tenantId);
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

  // ─── Two-Factor Authentication ─────────────────────────────────────────────

  typed.post(
    "/auth/2fa/setup",
    {
      preHandler: [app.requireAuth, auth2faLimit],
      schema: {
        tags: ["auth"],
        summary: "Generate a TOTP secret and QR code for 2FA setup",
        response: {
          200: z.object({
            secret: z.string(),
            qrCodeUrl: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await setupTwoFactor(auth.userId, auth.email);
    },
  );

  typed.post(
    "/auth/2fa/enable",
    {
      preHandler: [app.requireAuth, auth2faLimit],
      schema: {
        tags: ["auth"],
        summary: "Verify a TOTP code and enable 2FA",
        body: z.object({
          token: z.string().trim().min(6).max(8),
        }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await enableTwoFactor(auth.userId, request.body.token);
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
      return await createTenant({ name: request.body.name, userId: auth.userId, email: auth.email });
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
      return await switchTenant({ tenantId: request.params.tenantId, userId: auth.userId, email: auth.email });
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
      return { memberships: await listTenantMemberships(request.params.tenantId) };
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
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before managing memberships");
      }
      await addMemberToTenant({
        tenantId: auth.tenantId,
        email: request.body.email,
        roleId: request.body.roleId,
        actorHierarchyLevel: request.resolvedAuth!.hierarchyLevel,
      });
      return { success: true as const };
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
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before managing memberships");
      }
      await removeMemberFromTenant({
        tenantId: request.params.tenantId,
        targetUserId: request.params.userId,
        actorUserId: auth.userId,
      });
      return { success: true as const };
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
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before transferring ownership");
      }
      await transferOwnership({
        tenantId: request.params.tenantId,
        currentOwnerId: auth.userId,
        targetUserId: request.body.targetUserId,
      });
      return { success: true as const };
    },
  );
}
