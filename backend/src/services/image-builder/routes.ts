import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth.js";
import { buildCredentialsSchema, buildSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import type { Database } from "../../shared/supabase/types.js";
import { composeDeployingReason } from "./domain/orchestrator.js";
import { fetchBuildLogs } from "./domain/aws-runtime.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { resolveAwsCredentials } from "../../lib/provider-credentials.js";
import { requireWebhookSignature } from "../../shared/security.js";
import { tenantRateLimit } from "../../shared/rate-limit.js";
import {
  createBuild,
  getBuildWithStatus,
  getBuildForLogs,
  getDeployStatus,
  listBuilds,
  cancelBuild,
  resolveImageByRevision,
} from "./domain/builds.js";
import { runPostDeployCommands } from "./domain/post-deploy.js";

export async function registerImageBuilderRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;

  typed.post(
    "/image-builder/builds",
    {
      preHandler: [app.requirePermission(PERMISSIONS.DEPLOY_CREATE), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "build-create" })],
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
      const auth = getAuth(request);
      return await createBuild({
        tenantId: auth.tenantId,
        sourceRepo: request.body.sourceRepo,
        sourceRef: request.body.sourceRef,
        commitSha: request.body.commitSha,
        imageRepo: request.body.imageRepo,
        dockerfilePath: request.body.dockerfilePath,
        buildContext: request.body.buildContext,
        tags: request.body.tags,
        projectId: request.body.projectId,
        gitConnectionId: request.body.gitConnectionId,
        deployTarget: request.body.deployTarget,
        providerId: request.body.providerId,
        deployParams: request.body.deployParams,
      });
    },
  );

  typed.get(
    "/image-builder/builds/:buildId",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "Get build status",
        params: z.object({ buildId: z.uuid() }),
        response: { 200: buildSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getBuildWithStatus(request.params.buildId, auth.tenantId);
    },
  );

  typed.get(
    "/image-builder/builds/:buildId/logs",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "Get build logs",
        params: z.object({ buildId: z.uuid() }),
        querystring: z.object({ nextToken: z.string().optional() }),
        response: {
          200: z.object({ buildId: z.uuid(), logs: z.array(z.string()), nextToken: z.string().optional() }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const row = await getBuildForLogs(request.params.buildId, auth.tenantId);
      const cloudwatch = await fetchBuildLogs(app, row, request.query.nextToken);
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
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
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
      const auth = getAuth(request);
      const builds = await listBuilds({
        tenantId: auth.tenantId,
        sourceRepo: request.query.sourceRepo,
        status: request.query.status,
        limit: request.query.limit,
      });
      return { builds };
    },
  );

  typed.post(
    "/image-builder/builds/:buildId/cancel",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_MANAGE),
      schema: {
        tags: ["image-builder"],
        summary: "Cancel build",
        params: z.object({ buildId: z.uuid() }),
        response: { 200: buildSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await cancelBuild(request.params.buildId, auth.tenantId);
    },
  );

  typed.get(
    "/image-builder/images/:revision",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "Resolve image by git revision",
        params: z.object({ revision: z.string().min(1) }),
        response: {
          200: z.object({
            imageUri: z.string(),
            buildId: z.uuid(),
            commitSha: z.string(),
            status: z.string(),
            createdAt: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await resolveImageByRevision(request.params.revision, auth.tenantId);
    },
  );

  typed.get(
    "/image-builder/builds/:buildId/deploy-status",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "Get deploy status for build",
        params: z.object({ buildId: z.uuid() }),
        response: { 200: z.object({ status: z.string(), appUrl: z.string(), stackName: z.string() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getDeployStatus(
        request.params.buildId,
        auth.tenantId,
        { debug: (msg: string) => app.log.debug(msg) },
      );
    },
  );

  typed.post(
    "/image-builder/builds/:buildId/run-post-deploy",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_CREATE),
      schema: {
        tags: ["image-builder"],
        summary: "Run post-deploy commands on the deployed instance",
        params: z.object({ buildId: z.uuid() }),
        body: z.object({
          commands: z.array(z.object({
            command: z.string().min(1).max(500),
            enabled: z.boolean(),
            continueOnFailure: z.boolean(),
          })).max(20),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            output: z.array(z.string()),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { data, error } = await db.from("builds").select("*").eq("id", request.params.buildId).single();
      if (error || !data) throw app.httpErrors.notFound("Build not found");
      if (data.organization_id !== auth.tenantId) throw app.httpErrors.forbidden("Not your build");

      const credentials = await resolveAwsCredentials(data.provider_id || "");
      if (!credentials) throw app.httpErrors.preconditionFailed("AWS credentials not available");

      try {
        return await runPostDeployCommands({
          buildRow: {
            source_repo: data.source_repo || "",
            build_metadata: data.build_metadata,
            provider_id: data.provider_id,
          },
          commands: request.body.commands,
          credentials,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw app.httpErrors.preconditionFailed(message);
      }
    },
  );

  typed.post(
    "/image-builder/webhook",
    {
      preHandler: requireWebhookSignature,
      schema: {
        tags: ["image-builder"],
        summary: "Build/deploy callback webhook",
        body: z.object({
          buildId: z.uuid(),
          stackName: z.string().optional(),
          status: z.enum(["deploying", "success", "failed"]),
          appUrl: z.string().optional(),
          cfnStatus: z.string().optional(),
          deployTarget: z.string().optional(),
          codebuildId: z.string().optional(),
        }),
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (request) => {
      const { data, error: fetchError } = await db.from("builds").select("*").eq("id", request.body.buildId).maybeSingle();
      if (fetchError) {
        app.log.error(fetchError);
        throw app.httpErrors.internalServerError("Database error fetching build");
      }
      if (!data) return { success: false };
      const updates: Database["public"]["Tables"]["builds"]["Update"] = { updated_at: new Date().toISOString() };
      if (request.body.codebuildId) updates.codebuild_id = request.body.codebuildId;
      if (request.body.status === "success") {
        updates.status = "succeeded";
        const existingMeta: Record<string, unknown> = typeof data.build_metadata === "string" && data.build_metadata
          ? JSON.parse(data.build_metadata) : {};
        updates.build_metadata = JSON.stringify({ ...existingMeta, appUrl: request.body.appUrl ?? "", stackName: request.body.stackName ?? "" });
      } else if (request.body.status === "failed") {
        updates.status = "failed";
        updates.status_reason = `Deploy failed: ${request.body.cfnStatus ?? "unknown"}`;
      } else {
        updates.status = "in_progress";
        updates.status_reason = composeDeployingReason(request.body.deployTarget);
      }
      const { error: updateError } = await db.from("builds").update(updates).eq("id", request.body.buildId);
      if (updateError) {
        app.log.error(updateError);
        throw app.httpErrors.internalServerError("Database error updating build");
      }
      return { success: true };
    },
  );
}
