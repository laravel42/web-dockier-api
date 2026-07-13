/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth.js";
import { buildCredentialsSchema, buildSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
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
  ImageBuilderError,
} from "./domain/builds.js";
import { assertOwnership } from "../../shared/supabase/query.js";
import { deployParamsSchema } from "./domain/deploy-params.js";
import { processImageBuilderWebhook } from "./domain/webhook.js";
import { fetchBuildLogs } from "./domain/aws-runtime.js";

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
          deployParams: deployParamsSchema.optional(),
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
      return await processImageBuilderWebhook(request.body);
    },
  );
}
