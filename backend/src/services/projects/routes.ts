import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { projectConfigSchema, projectSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import type { Database } from "../../shared/supabase/types.js";

function rowToProject(row: {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connection_id: string | null;
  platform: string | null;
  source_type: string | null;
  template: string | null;
  config: unknown;
  created_at: string;
}) {
  return {
    id: row.id,
    name: row.name,
    repository: row.repository,
    branch: row.branch,
    connectionId: row.connection_id ?? "",
    platform: row.platform ?? "",
    sourceType: row.source_type ?? "repository",
    template: row.template ?? "",
    config: projectConfigSchema.parse(row.config ?? {}),
    createdAt: row.created_at,
  };
}

export async function registerProjectsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/projects",
    {
      preHandler: app.requireTenantAdmin,
      schema: {
        tags: ["projects"],
        summary: "Create project",
        body: z.object({
          name: z.string().min(1),
          repository: z.string().min(1),
          branch: z.string().min(1),
          connectionId: z.string().optional(),
          platform: z.string().optional(),
          sourceType: z.string().optional(),
          template: z.string().optional(),
          config: projectConfigSchema.optional(),
        }),
        response: { 200: projectSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const id = uuidv4();
      const now = new Date().toISOString();
      const payload = {
        id,
        app_id: auth.tenantId,
        organization_id: auth.tenantId,
        name: request.body.name,
        repository: request.body.repository,
        branch: request.body.branch,
        connection_id: request.body.connectionId ?? "",
        platform: request.body.platform ?? "",
        source_type: request.body.sourceType ?? "repository",
        template: request.body.template ?? "",
        config: request.body.config ?? {},
        created_at: now,
      };
      const { error } = await supabaseAdmin.from("projects").insert(payload);
      if (error) throw app.httpErrors.badRequest(error.message);
      return rowToProject(payload);
    },
  );

  typed.get(
    "/projects/:projectId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["projects"],
        summary: "Get project",
        params: z.object({ projectId: z.string().uuid() }),
        response: { 200: projectSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id,name,repository,branch,connection_id,platform,source_type,template,config,created_at")
        .eq("id", request.params.projectId)
        .eq("organization_id", auth.tenantId)
        .single();
      if (error || !data) throw app.httpErrors.notFound("Project not found");
      return rowToProject(data);
    },
  );

  typed.get(
    "/projects",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["projects"],
        summary: "List projects",
        response: {
          200: z.object({
            projects: z.array(projectSchema),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id,name,repository,branch,connection_id,platform,source_type,template,config,created_at")
        .eq("organization_id", auth.tenantId)
        .order("created_at", { ascending: false });
      if (error) throw app.httpErrors.internalServerError(error.message);
      return { projects: (data ?? []).map(rowToProject) };
    },
  );

  typed.put(
    "/projects/:projectId",
    {
      preHandler: app.requireTenantAdmin,
      schema: {
        tags: ["projects"],
        summary: "Update project",
        params: z.object({ projectId: z.string().uuid() }),
        body: z.object({
          name: z.string().optional(),
          repository: z.string().optional(),
          branch: z.string().optional(),
          connectionId: z.string().optional(),
          platform: z.string().optional(),
          sourceType: z.string().optional(),
          template: z.string().optional(),
          config: projectConfigSchema.optional(),
        }),
        response: { 200: projectSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("projects")
        .select("organization_id,config")
        .eq("id", request.params.projectId)
        .eq("organization_id", auth.tenantId)
        .single();
      if (existingError || !existing) throw app.httpErrors.notFound("Project not found");

      const updates: Database["public"]["Tables"]["projects"]["Update"] = {
        updated_at: new Date().toISOString(),
      };
      if (request.body.name !== undefined) updates.name = request.body.name;
      if (request.body.repository !== undefined) updates.repository = request.body.repository;
      if (request.body.branch !== undefined) updates.branch = request.body.branch;
      if (request.body.connectionId !== undefined) updates.connection_id = request.body.connectionId;
      if (request.body.platform !== undefined) updates.platform = request.body.platform;
      if (request.body.sourceType !== undefined) updates.source_type = request.body.sourceType;
      if (request.body.template !== undefined) updates.template = request.body.template;
      if (request.body.config !== undefined) {
        updates.config = { ...(typeof existing.config === "object" ? (existing.config as object) : {}), ...request.body.config };
      }

      const { error } = await supabaseAdmin
        .from("projects")
        .update(updates)
        .eq("id", request.params.projectId)
        .eq("organization_id", auth.tenantId);
      if (error) throw app.httpErrors.badRequest(error.message);

      const { data, error: fetchError } = await supabaseAdmin
        .from("projects")
        .select("id,name,repository,branch,connection_id,platform,source_type,template,config,created_at")
        .eq("id", request.params.projectId)
        .eq("organization_id", auth.tenantId)
        .single();
      if (fetchError || !data) throw app.httpErrors.notFound("Project not found");
      return rowToProject(data);
    },
  );

  typed.delete(
    "/projects/:projectId",
    {
      preHandler: app.requireTenantAdmin,
      schema: {
        tags: ["projects"],
        summary: "Delete project",
        params: z.object({ projectId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("id", request.params.projectId)
        .eq("organization_id", auth.tenantId)
        .single();
      if (existingError || !existing) throw app.httpErrors.notFound("Project not found");

      const { error } = await supabaseAdmin
        .from("projects")
        .delete()
        .eq("id", request.params.projectId)
        .eq("organization_id", auth.tenantId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );
}
