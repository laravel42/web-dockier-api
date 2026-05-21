import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { listUsersResponseSchema, userSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import type { Database } from "../../shared/supabase/types.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { canManageRole } from "../../shared/permissions/authorization.js";
import { escapePostgrestFilter } from "../../shared/security.js";

function rowToUser(row: {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  country: string | null;
  language: string | null;
  timezone: string | null;
  organization_id: string | null;
  created_at: string;
}) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    country: row.country ?? "",
    language: row.language ?? "en",
    timezone: row.timezone ?? "UTC",
    tenantId: row.organization_id,
    createdAt: row.created_at,
  };
}

export async function registerUsersRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/users",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["users"],
        summary: "Create user",
        body: z.object({
          email: z.email(),
          name: z.string().min(1),
          password: z.string().min(8).optional(),
          country: z.string().optional(),
          language: z.string().optional(),
          timezone: z.string().optional(),
          roleId: z.string().uuid().optional(),
        }),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const id = uuidv4();
      const now = new Date().toISOString();

      const passwordHash = request.body.password ? await bcrypt.hash(request.body.password, 12) : null;

      const { error } = await supabaseAdmin.from("users").insert({
        id,
        email: request.body.email,
        name: request.body.name,
        organization_id: auth.tenantId,
        password_hash: passwordHash,
        country: request.body.country ?? "",
        language: request.body.language ?? "en",
        timezone: request.body.timezone ?? "UTC",
        two_factor_enabled: false,
        created_at: now,
      });
      if (error) throw app.httpErrors.badRequest(error.message);

      // Create organization membership with role
      if (request.body.roleId) {
        // Validate role exists in same org and actor can assign it
        const resolved = request.resolvedAuth!;
        const { data: targetRole, error: roleLookupError } = await supabaseAdmin
          .from("roles")
          .select("id,system_key")
          .eq("id", request.body.roleId)
          .eq("organization_id", auth.tenantId)
          .is("deleted_at", null)
          .maybeSingle();
        if (roleLookupError) throw app.httpErrors.internalServerError(roleLookupError.message);
        if (!targetRole) throw app.httpErrors.badRequest("Role not found");
        if (!canManageRole(resolved, targetRole.system_key)) {
          throw app.httpErrors.forbidden("Cannot assign a role at or above your own level");
        }

        const { error: membershipError } = await supabaseAdmin.from("organization_memberships").insert({
          organization_id: auth.tenantId,
          user_id: id,
          role_id: request.body.roleId,
          is_owner: false,
          status: "active",
        });
        if (membershipError) throw app.httpErrors.badRequest(membershipError.message);
      }

      const { data: created, error: fetchError } = await supabaseAdmin
        .from("users")
        .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
        .eq("id", id)
        .single();
      if (fetchError) throw app.httpErrors.internalServerError(fetchError.message);
      return rowToUser(created);
    },
  );

  typed.get(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_VIEW),
      schema: {
        tags: ["users"],
        summary: "Get user by ID",
        params: z.object({ userId: z.string().uuid() }),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
        .eq("id", request.params.userId)
        .eq("organization_id", request.auth!.tenantId)
        .single();
      if (error) throw app.httpErrors.notFound("User not found");
      return rowToUser(data);
    },
  );

  typed.get(
    "/users",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_VIEW),
      schema: {
        tags: ["users"],
        summary: "List users",
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          search: z.string().optional(),
        }),
        response: { 200: listUsersResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const page = request.query.page;
      const limit = request.query.limit;
      const offset = (page - 1) * limit;

      let query = supabaseAdmin
        .from("users")
        .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at", {
          count: "exact",
        })
        .eq("organization_id", auth.tenantId)
        .range(offset, offset + limit - 1)
        .order("created_at", { ascending: false });

      if (request.query.search) {
        const escaped = escapePostgrestFilter(request.query.search);
        query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
      }

      const { data, count, error } = await query;
      if (error) throw app.httpErrors.internalServerError(error.message);

      // Fetch membership + role info for all returned users
      const userIds = (data ?? []).map((u) => u.id);
      const { data: memberships, error: membershipsError } = await supabaseAdmin
        .from("organization_memberships")
        .select("user_id,role_id,is_owner,roles!left(name)")
        .eq("organization_id", auth.tenantId)
        .in("user_id", userIds)
        .eq("status", "active");
      if (membershipsError) throw app.httpErrors.internalServerError(membershipsError.message);

      type MembershipRow = { user_id: string; role_id: string | null; is_owner: boolean; roles: { name: string } | null };
      const membershipByUser = new Map<string, MembershipRow>();
      for (const m of (memberships ?? []) as MembershipRow[]) {
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
        total: count ?? 0,
        page,
        limit,
      };
    },
  );

  typed.put(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["users"],
        summary: "Update user fields",
        params: z.object({ userId: z.string().uuid() }),
        body: z
          .object({
            name: z.string().optional(),
            avatarUrl: z.string().nullable().optional(),
            country: z.string().optional(),
            language: z.string().optional(),
            timezone: z.string().optional(),
            roleId: z.string().uuid().optional(),
          })
          .refine((value) => Object.keys(value).length > 0, "Provide at least one field"),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const updates: Database["public"]["Tables"]["users"]["Update"] = {};
      if (request.body.name !== undefined) updates.name = request.body.name;
      if (request.body.avatarUrl !== undefined) updates.avatar_url = request.body.avatarUrl;
      if (request.body.country !== undefined) updates.country = request.body.country;
      if (request.body.language !== undefined) updates.language = request.body.language;
      if (request.body.timezone !== undefined) updates.timezone = request.body.timezone;

      updates.updated_at = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("users")
        .update(updates)
        .eq("id", request.params.userId)
        .eq("organization_id", auth.tenantId);
      if (error) throw app.httpErrors.badRequest(error.message);

      // Update role assignment if provided
      if (request.body.roleId !== undefined) {
        // Validate role exists in same org and actor can assign it
        const resolved = request.resolvedAuth!;

        // Prevent changing role of the organization owner
        const { data: targetMembership, error: membershipLookupError } = await supabaseAdmin
          .from("organization_memberships")
          .select("is_owner,role_id,roles!left(system_key)")
          .eq("organization_id", auth.tenantId)
          .eq("user_id", request.params.userId)
          .eq("status", "active")
          .maybeSingle() as { data: { is_owner: boolean; role_id: string | null; roles: { system_key: string | null } | null } | null; error: unknown };
        if (membershipLookupError) throw app.httpErrors.internalServerError((membershipLookupError as Error).message);
        if (targetMembership?.is_owner) {
          throw app.httpErrors.forbidden("Cannot change the role of the organization owner");
        }
        // Prevent changing role of users at or above actor's level
        const targetCurrentSystemKey = targetMembership?.roles?.system_key ?? null;
        if (!canManageRole(resolved, targetCurrentSystemKey)) {
          throw app.httpErrors.forbidden("Cannot change the role of a user at or above your own level");
        }

        const { data: targetRole, error: roleLookupErr } = await supabaseAdmin
          .from("roles")
          .select("id,system_key")
          .eq("id", request.body.roleId)
          .eq("organization_id", auth.tenantId)
          .is("deleted_at", null)
          .maybeSingle();
        if (roleLookupErr) throw app.httpErrors.internalServerError(roleLookupErr.message);
        if (!targetRole) throw app.httpErrors.badRequest("Role not found");
        if (!canManageRole(resolved, targetRole.system_key)) {
          throw app.httpErrors.forbidden("Cannot assign a role at or above your own level");
        }

        const { error: updateError } = await supabaseAdmin
          .from("organization_memberships")
          .update({ role_id: request.body.roleId })
          .eq("organization_id", auth.tenantId)
          .eq("user_id", request.params.userId);
        if (updateError) throw app.httpErrors.badRequest(updateError.message);
      }

      const { data, error: fetchError } = await supabaseAdmin
        .from("users")
        .select("id,email,name,avatar_url,country,language,timezone,organization_id,created_at")
        .eq("id", request.params.userId)
        .eq("organization_id", auth.tenantId)
        .single();
      if (fetchError) throw app.httpErrors.notFound("User not found");
      return rowToUser(data);
    },
  );

  typed.delete(
    "/users/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["users"],
        summary: "Remove user from organization",
        params: z.object({ userId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;

      // Cannot remove yourself
      if (request.params.userId === auth.userId) {
        throw app.httpErrors.forbidden("Cannot remove yourself from the organization");
      }

      // Prevent removing the organization owner
      const { data: targetMembership, error: membershipErr } = await supabaseAdmin
        .from("organization_memberships")
        .select("is_owner")
        .eq("organization_id", auth.tenantId)
        .eq("user_id", request.params.userId)
        .maybeSingle();
      if (membershipErr) throw app.httpErrors.internalServerError(membershipErr.message);
      if (!targetMembership) throw app.httpErrors.notFound("User is not a member of this organization");
      if (targetMembership.is_owner) {
        throw app.httpErrors.forbidden("Cannot remove the organization owner");
      }

      // Remove membership (not the global user record)
      const { error } = await supabaseAdmin
        .from("organization_memberships")
        .delete()
        .eq("organization_id", auth.tenantId)
        .eq("user_id", request.params.userId);
      if (error) throw app.httpErrors.badRequest(error.message);

      return { success: true as const };
    },
  );
}
