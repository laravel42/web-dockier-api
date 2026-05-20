import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { listUsersResponseSchema, userSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import type { Database } from "../../shared/supabase/types.js";
import { membershipRoleSchemaValues } from "../../shared/auth.js";
import { escapePostgrestFilter } from "../../shared/security.js";

function rowToUser(row: {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  country: string | null;
  language: string | null;
  timezone: string | null;
  role: "admin" | "member" | null;
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
    role: row.role ?? "member",
    roleId: row.role ?? "member",
    roleName: row.role === "admin" ? "Admin" : "Member",
    tenantId: row.organization_id,
    createdAt: row.created_at,
  };
}

export async function registerUsersRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/users",
    {
      preHandler: app.requireTenantAdmin,
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
          role: z.enum(membershipRoleSchemaValues).optional(),
          roleId: z.enum(membershipRoleSchemaValues).optional(),
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
        role: request.body.role ?? request.body.roleId ?? "member",
        two_factor_enabled: false,
        created_at: now,
      });
      if (error) throw app.httpErrors.badRequest(error.message);

      const { data: created, error: fetchError } = await supabaseAdmin
        .from("users")
        .select("id,email,name,avatar_url,country,language,timezone,role,organization_id,created_at")
        .eq("id", id)
        .single();
      if (fetchError) throw app.httpErrors.internalServerError(fetchError.message);
      return rowToUser(created);
    },
  );

  typed.get(
    "/users/:userId",
    {
      preHandler: app.requireAuth,
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
        .select("id,email,name,avatar_url,country,language,timezone,role,organization_id,created_at")
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
      preHandler: app.requireAuth,
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
        .select("id,email,name,avatar_url,country,language,timezone,role,organization_id,created_at", {
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

      return {
        users: (data ?? []).map(rowToUser),
        total: count ?? 0,
        page,
        limit,
      };
    },
  );

  typed.put(
    "/users/:userId",
    {
      preHandler: app.requireTenantAdmin,
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
            role: z.enum(membershipRoleSchemaValues).optional(),
            roleId: z.enum(membershipRoleSchemaValues).optional(),
          })
          .refine((value) => Object.keys(value).length > 0, "Provide at least one field"),
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const updates: Database["public"]["Tables"]["users"]["Update"] = {};
      if (request.body.name !== undefined) updates.name = request.body.name;
      if (request.body.avatarUrl !== undefined) updates.avatar_url = request.body.avatarUrl;
      if (request.body.country !== undefined) updates.country = request.body.country;
      if (request.body.language !== undefined) updates.language = request.body.language;
      if (request.body.timezone !== undefined) updates.timezone = request.body.timezone;
      if (request.body.role !== undefined) updates.role = request.body.role;
      if (request.body.roleId !== undefined) updates.role = request.body.roleId;

      updates.updated_at = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("users")
        .update(updates)
        .eq("id", request.params.userId)
        .eq("organization_id", request.auth!.tenantId);
      if (error) throw app.httpErrors.badRequest(error.message);

      const { data, error: fetchError } = await supabaseAdmin
        .from("users")
        .select("id,email,name,avatar_url,country,language,timezone,role,organization_id,created_at")
        .eq("id", request.params.userId)
        .eq("organization_id", request.auth!.tenantId)
        .single();
      if (fetchError) throw app.httpErrors.notFound("User not found");
      return rowToUser(data);
    },
  );

  typed.delete(
    "/users/:userId",
    {
      preHandler: app.requireTenantAdmin,
      schema: {
        tags: ["users"],
        summary: "Delete user",
        params: z.object({ userId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const { error } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("id", request.params.userId)
        .eq("organization_id", request.auth!.tenantId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );
}
