import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { buildCredentialsSchema, buildSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { composeDeployingReason, composeSubmittedReason, normalizeBuildInput } from "./domain/orchestrator.js";
import { fetchBuildLogs, lookupCodeBuildId, refreshBuildStatus, resolveAwsCredentials } from "./domain/aws-runtime.js";
import { createBuildspecPreview } from "./domain/buildspec.js";

function rowToBuild(row: any) {
  return {
    id: row.id,
    codebuildId: row.codebuild_id ?? "",
    sourceRepo: row.source_repo ?? "",
    sourceRef: row.source_ref ?? "",
    commitSha: row.commit_sha ?? "",
    imageUri: row.image_uri ?? "",
    status: row.status,
    statusReason: row.status_reason ?? "",
    logsUrl: row.logs_url ?? "",
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags ?? [],
    buildMetadata: typeof row.build_metadata === "string" ? JSON.parse(row.build_metadata) : row.build_metadata ?? {},
    startedAt: row.started_at ?? "",
    finishedAt: row.finished_at ?? "",
    createdAt: row.created_at,
  };
}

export async function registerImageBuilderRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin as any;

  typed.post(
    "/image-builder/builds",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["image-builder"],
        summary: "Start image build",
        body: z.object({
          sourceRepo: z.string().min(1),
          sourceRef: z.string().optional(),
          commitSha: z.string().optional(),
          imageRepo: z.string().optional(),
          dockerfilePath: z.string().optional(),
          buildContext: z.string().optional(),
          tags: z.array(z.string()).optional(),
          projectId: z.string().optional(),
          gitConnectionId: z.string().optional(),
          deployTarget: z.enum(["ecs", "ec2", "s3"]).optional(),
          providerId: z.string().optional(),
          credentials: buildCredentialsSchema.optional(),
          deployParams: z.record(z.string(), z.any()).optional(),
        }),
        response: { 200: buildSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const id = uuidv4();
      const now = new Date().toISOString();
      const normalized = normalizeBuildInput(request.body);
      const payload = {
        id,
        app_id: auth.appId,
        project_id: request.body.projectId ?? "",
        source_repo: request.body.sourceRepo,
        source_ref: normalized.sourceRef,
        commit_sha: request.body.commitSha ?? "",
        dockerfile_path: normalized.dockerfilePath,
        build_context: normalized.buildContext,
        image_repo: normalized.imageRepo,
        image_uri: "",
        cache_repo_uri: "",
        status: "submitted",
        status_reason: composeSubmittedReason(normalized.inferredRuntime),
        logs_url: "",
        tags: normalized.tags,
        build_metadata: {
          ...normalized.metadata,
          buildspecPreview: createBuildspecPreview({
            runtime: normalized.inferredRuntime,
            sourceRef: normalized.sourceRef,
            dockerfilePath: normalized.dockerfilePath,
            buildContext: normalized.buildContext,
            imageRepo: normalized.imageRepo,
            tags: normalized.tags,
          }),
        },
        provider_id: request.body.providerId ?? "",
        created_at: now,
        updated_at: now,
      };
      const { error } = await db.from("builds").insert(payload);
      if (error) throw app.httpErrors.badRequest(error.message);
      return rowToBuild(payload);
    },
  );

  typed.get(
    "/image-builder/builds/:buildId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["image-builder"],
        summary: "Get build status",
        params: z.object({ buildId: z.string().uuid() }),
        response: { 200: buildSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db.from("builds").select("*").eq("id", request.params.buildId).single();
      if (error || !data) throw app.httpErrors.notFound("Build not found");
      if (data.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your build");

      let row = data;
      if (!row.codebuild_id && row.provider_id) {
        const credentials = await resolveAwsCredentials(db, row.provider_id);
        if (credentials) {
          const codebuildId = await lookupCodeBuildId(credentials, request.params.buildId);
          if (codebuildId) {
            await db.from("builds").update({ codebuild_id: codebuildId, updated_at: new Date().toISOString() }).eq("id", request.params.buildId);
            row = { ...row, codebuild_id: codebuildId };
          }
        }
      }
      if (row.codebuild_id && ["submitted", "in_progress", "pending"].includes(row.status)) {
        row = await refreshBuildStatus(db, row);
      }
      return rowToBuild(row);
    },
  );

  typed.get(
    "/image-builder/builds/:buildId/logs",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["image-builder"],
        summary: "Get build logs",
        params: z.object({ buildId: z.string().uuid() }),
        querystring: z.object({ nextToken: z.string().optional() }),
        response: {
          200: z.object({ buildId: z.string().uuid(), logs: z.array(z.string()), nextToken: z.string().optional() }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db
        .from("builds")
        .select("id,app_id,provider_id,codebuild_id,status,status_reason,updated_at")
        .eq("id", request.params.buildId)
        .single();
      if (error || !data) throw app.httpErrors.notFound("Build not found");
      if (data.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your build");
      let row = data;
      if (!row.codebuild_id && row.provider_id) {
        const credentials = await resolveAwsCredentials(db, row.provider_id);
        if (credentials) {
          const codebuildId = await lookupCodeBuildId(credentials, request.params.buildId);
          if (codebuildId) {
            await db.from("builds").update({ codebuild_id: codebuildId, updated_at: new Date().toISOString() }).eq("id", request.params.buildId);
            row = { ...row, codebuild_id: codebuildId };
          }
        }
      }
      const cloudwatch = await fetchBuildLogs(app, db, row, request.query.nextToken);
      return {
        buildId: request.params.buildId,
        logs: cloudwatch.logs.length > 0 ? cloudwatch.logs : [`[${row.updated_at}] status=${row.status}`, row.status_reason || "No logs available yet"],
        nextToken: cloudwatch.nextToken,
      };
    },
  );

  typed.get(
    "/image-builder/builds",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["image-builder"],
        summary: "List builds",
        querystring: z.object({
          sourceRepo: z.string().optional(),
          status: z.string().optional(),
          limit: z.coerce.number().int().positive().max(100).optional(),
        }),
        response: { 200: z.object({ builds: z.array(buildSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const limit = request.query.limit ?? 50;
      let query = db.from("builds").select("*").eq("app_id", auth.appId).order("created_at", { ascending: false }).limit(limit);
      if (request.query.sourceRepo) query = query.eq("source_repo", request.query.sourceRepo);
      if (request.query.status) query = query.eq("status", request.query.status);
      const { data, error } = await query;
      if (error) throw app.httpErrors.internalServerError(error.message);
      return { builds: (data ?? []).map(rowToBuild) };
    },
  );

  typed.post(
    "/image-builder/builds/:buildId/cancel",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["image-builder"],
        summary: "Cancel build",
        params: z.object({ buildId: z.string().uuid() }),
        response: { 200: buildSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db.from("builds").select("*").eq("id", request.params.buildId).single();
      if (error || !data) throw app.httpErrors.notFound("Build not found");
      if (data.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your build");
      if (!["submitted", "in_progress", "pending"].includes(data.status)) {
        throw app.httpErrors.preconditionFailed(`Cannot cancel build in status: ${data.status}`);
      }
      const { data: updated, error: updateError } = await db
        .from("builds")
        .update({
          status: "stopped",
          status_reason: "Cancelled by user",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.params.buildId)
        .select("*")
        .single();
      if (updateError) throw app.httpErrors.badRequest(updateError.message);
      return rowToBuild(updated);
    },
  );

  typed.get(
    "/image-builder/images/:revision",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["image-builder"],
        summary: "Resolve image by git revision",
        params: z.object({ revision: z.string().min(1) }),
        response: {
          200: z.object({
            imageUri: z.string(),
            buildId: z.string().uuid(),
            commitSha: z.string(),
            status: z.string(),
            createdAt: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db
        .from("builds")
        .select("*")
        .eq("app_id", auth.appId)
        .eq("status", "succeeded")
        .neq("image_uri", "")
        .or(`commit_sha.ilike.${request.params.revision}%,source_ref.eq.${request.params.revision}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) throw app.httpErrors.notFound(`No successful build found for revision: ${request.params.revision}`);
      const build = rowToBuild(data);
      return {
        imageUri: build.imageUri,
        buildId: build.id,
        commitSha: build.commitSha,
        status: build.status,
        createdAt: build.createdAt,
      };
    },
  );

  typed.get(
    "/image-builder/builds/:buildId/deploy-status",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["image-builder"],
        summary: "Get deploy status for build",
        params: z.object({ buildId: z.string().uuid() }),
        response: { 200: z.object({ status: z.string(), appUrl: z.string(), stackName: z.string() }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db.from("builds").select("*").eq("id", request.params.buildId).single();
      if (error || !data) throw app.httpErrors.notFound("Build not found");
      if (data.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your build");
      const build = rowToBuild(data);
      if (build.buildMetadata.appUrl) {
        return {
          status: "success",
          appUrl: build.buildMetadata.appUrl,
          stackName: build.buildMetadata.stackName ?? "",
        };
      }
      if (build.status === "failed") return { status: "failed", appUrl: "", stackName: "" };
      if (build.status === "succeeded") return { status: "success", appUrl: "", stackName: "" };
      return { status: "deploying", appUrl: "", stackName: "" };
    },
  );

  typed.post(
    "/image-builder/webhook",
    {
      schema: {
        tags: ["image-builder"],
        summary: "Build/deploy callback webhook",
        body: z.object({
          buildId: z.string().uuid(),
          stackName: z.string().optional(),
          status: z.enum(["deploying", "success", "failed"]),
          appUrl: z.string().optional(),
          cfnStatus: z.string().optional(),
          deployTarget: z.string().optional(),
          codebuildId: z.string().optional(),
        }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const { data } = await db.from("builds").select("*").eq("id", request.body.buildId).maybeSingle();
      if (!data) return { ok: false };
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (request.body.codebuildId) updates.codebuild_id = request.body.codebuildId;
      if (request.body.status === "success") {
        updates.status = "succeeded";
        updates.build_metadata = { ...(data.build_metadata ?? {}), appUrl: request.body.appUrl ?? "", stackName: request.body.stackName ?? "" };
      } else if (request.body.status === "failed") {
        updates.status = "failed";
        updates.status_reason = `Deploy failed: ${request.body.cfnStatus ?? "unknown"}`;
      } else {
        updates.status = "in_progress";
        updates.status_reason = composeDeployingReason(request.body.deployTarget);
      }
      await db.from("builds").update(updates).eq("id", request.body.buildId);
      return { ok: true };
    },
  );
}
