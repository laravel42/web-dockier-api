/**
 * Authentication Routes
 *
 * Handles login, registration, OTP verification, and session endpoints.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth.js";
import {
  authMeSchema,
  authSessionSchema,
  membershipSchema,
  registerStartBodySchema,
  registerStartResponseSchema,
} from "../schemas.js";
import { env } from "../../../shared/config.js";
import { resolveSupabaseSecretKey } from "../../../shared/supabase/keys.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { rateLimit } from "../../../shared/rate-limit.js";
import {
  listMembershipsForUser,
  getAuthenticatedUser,
} from "../domain/membership.js";
import {
  performDemoLogin,
  performPasswordLogin,
  verifyOtpAndProvision,
  throwAuthError,
} from "../domain/registration.js";

export async function registerAuthenticationRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const authStartLimit = rateLimit({ max: 5, windowMs: 60_000, prefix: "auth-start" });
  const authVerifyLimit = rateLimit({ max: 10, windowMs: 60_000, prefix: "auth-verify" });
  const authLoginLimit = rateLimit({ max: 10, windowMs: 60_000, prefix: "auth-login" });

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
      if (error) throwAuthError(error.message);
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
      if (error) throwAuthError(error.message);
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
      const auth = getAuth(request);
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
      const memberships = await listMembershipsForUser(getAuth(request).userId);
      return { memberships };
    },
  );
}
