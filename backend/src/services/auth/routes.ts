import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { authMeSchema, authSessionSchema, membershipSchema } from "./schemas.js";
import { env } from "../../shared/config.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { membershipRoleSchemaValues, type MembershipRole } from "../../shared/auth.js";

function slugifyTenant(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function signTenantToken(payload: { userId: string; email: string; tenantId: string; role: MembershipRole }) {
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      tenantId: payload.tenantId,
      appId: payload.tenantId,
      role: payload.role,
    },
    env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

async function listMembershipsForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("id,role,organization_id,organizations!inner(id,name,slug)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    role: MembershipRole;
    organization_id: string;
    organizations: { id: string; name: string; slug: string };
  }>;
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.organization_id,
    tenantName: row.organizations.name,
    tenantSlug: row.organizations.slug,
    role: row.role as MembershipRole,
  }));
}

export async function registerAuthRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/auth/passwordless/start",
    {
      schema: {
        tags: ["auth"],
        summary: "Start passwordless authentication via Supabase email OTP/magic link",
        body: z.object({
          email: z.email(),
          redirectTo: z.string().url().optional(),
        }),
        response: {
          200: z.object({
            success: z.literal(true),
            message: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const { error } = await supabaseAdmin.auth.signInWithOtp({
        email: request.body.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: request.body.redirectTo,
        },
      });
      if (error) throw app.httpErrors.badRequest(error.message);
      return {
        success: true as const,
        message: "Passwordless sign-in started. Check your email for OTP or magic link.",
      };
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

      await supabaseAdmin.from("users").upsert({
        id: userId,
        email,
        name: displayName,
        app_id: "",
        created_at: new Date().toISOString(),
      });

      let memberships = await listMembershipsForUser(userId);
      let selected: (typeof memberships)[number] | undefined = memberships[0];

      if (request.body.tenantSlug) {
        selected = memberships.find((m) => m.tenantSlug === request.body.tenantSlug);
        if (!selected) throw app.httpErrors.forbidden("No membership in requested tenant");
      }

      if (!selected) {
        const tenantName = request.body.tenantName?.trim() || `${displayName}'s workspace`;
        const tenantSlugBase = slugifyTenant(tenantName) || "workspace";
        const tenantSlug = `${tenantSlugBase}-${userId.slice(0, 6)}`;

        const { data: org, error: orgError } = await supabaseAdmin
          .from("organizations")
          .insert({ name: tenantName, slug: tenantSlug, created_by: userId })
          .select("id,name,slug")
          .single();
        if (orgError || !org) throw app.httpErrors.internalServerError(orgError?.message ?? "Failed to create tenant");

        const { data: createdMembership, error: membershipError } = await supabaseAdmin
          .from("organization_memberships")
          .insert({
            organization_id: org.id,
            user_id: userId,
            role: "admin",
          })
          .select("id,role,organization_id")
          .single();
        if (membershipError || !createdMembership) {
          throw app.httpErrors.internalServerError(membershipError?.message ?? "Failed to create membership");
        }

        selected = {
          id: createdMembership.id,
          tenantId: org.id,
          tenantName: org.name,
          tenantSlug: org.slug,
          role: createdMembership.role as MembershipRole,
        };
        memberships = [selected];
      }
      if (!selected) throw app.httpErrors.internalServerError("Unable to resolve tenant membership");

      const { error: syncError } = await supabaseAdmin
        .from("users")
        .update({
          app_id: selected.tenantId,
          organization_id: selected.tenantId,
          role: selected.role,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (syncError) throw app.httpErrors.internalServerError(syncError.message);

      return {
        session: {
          token: signTenantToken({
            userId,
            email,
            tenantId: selected.tenantId,
            role: selected.role,
          }),
          userId,
          tenantId: selected.tenantId,
          role: selected.role,
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
        summary: "Get current user with tenant memberships",
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

      const memberships = await listMembershipsForUser(auth.userId);

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        tenantId: auth.tenantId,
        role: auth.role,
        roleId: auth.role,
        appId: auth.tenantId,
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
        summary: "Create a tenant and make current user admin",
        body: z.object({
          name: z.string().min(2).max(120),
        }),
        response: { 200: z.object({ tenantId: z.string().uuid(), slug: z.string(), session: authSessionSchema }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const slug = `${slugifyTenant(request.body.name) || "workspace"}-${auth.userId.slice(0, 6)}`;
      const { data: org, error: orgError } = await supabaseAdmin
        .from("organizations")
        .insert({
          name: request.body.name,
          slug,
          created_by: auth.userId,
        })
        .select("id,slug")
        .single();
      if (orgError || !org) throw app.httpErrors.badRequest(orgError?.message ?? "Unable to create tenant");

      const { error: membershipError } = await supabaseAdmin.from("organization_memberships").insert({
        organization_id: org.id,
        user_id: auth.userId,
        role: "admin",
      });
      if (membershipError) throw app.httpErrors.badRequest(membershipError.message);

      return {
        tenantId: org.id,
        slug: org.slug,
        session: {
          token: signTenantToken({
            userId: auth.userId,
            email: auth.email,
            tenantId: org.id,
            role: "admin",
          }),
          userId: auth.userId,
          tenantId: org.id,
          role: "admin" as const,
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
        .select("role")
        .eq("organization_id", request.params.tenantId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (error) throw app.httpErrors.internalServerError(error.message);
      if (!data) throw app.httpErrors.forbidden("No membership in requested tenant");

      return {
        token: signTenantToken({
          userId: auth.userId,
          email: auth.email,
          tenantId: request.params.tenantId,
          role: data.role as MembershipRole,
        }),
        userId: auth.userId,
        tenantId: request.params.tenantId,
        role: data.role as MembershipRole,
      };
    },
  );

  typed.get(
    "/auth/tenants/:tenantId/memberships",
    {
      preHandler: app.requireAuth,
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
                role: z.enum(membershipRoleSchemaValues),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: callerMembership } = await supabaseAdmin
        .from("organization_memberships")
        .select("id")
        .eq("organization_id", request.params.tenantId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (!callerMembership) throw app.httpErrors.forbidden("No membership in requested tenant");

      const { data, error } = await supabaseAdmin
        .from("organization_memberships")
        .select("id,role,user_id,users!inner(email,name)")
        .eq("organization_id", request.params.tenantId)
        .order("created_at", { ascending: true });
      if (error) throw app.httpErrors.internalServerError(error.message);
      const rows = (data ?? []) as Array<{
        id: string;
        role: MembershipRole;
        user_id: string;
        users: { email: string; name: string };
      }>;

      return {
        memberships: rows.map((item) => ({
          id: item.id,
          userId: item.user_id,
          email: item.users.email,
          name: item.users.name,
          role: item.role as MembershipRole,
        })),
      };
    },
  );

  typed.post(
    "/auth/tenants/:tenantId/memberships",
    {
      preHandler: app.requireTenantAdmin,
      schema: {
        tags: ["auth"],
        summary: "Add existing user to tenant (admin only)",
        params: z.object({ tenantId: z.string().uuid() }),
        body: z.object({
          email: z.email(),
          role: z.enum(membershipRoleSchemaValues).default("member"),
        }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before managing memberships");
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
          role: request.body.role,
        },
        { onConflict: "organization_id,user_id" },
      );
      if (error) throw app.httpErrors.badRequest(error.message);

      await supabaseAdmin
        .from("users")
        .update({
          organization_id: request.params.tenantId,
          role: request.body.role,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUser.id);

      return { success: true as const };
    },
  );
}
