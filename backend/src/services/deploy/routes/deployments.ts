import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth.js";
import { deploymentSchema, deploymentStatusSchema, serviceEntrySchema } from "../schemas.js";
import type { ServiceEntry } from "../types.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { paginationQuerySchema, paginationMetaSchema } from "../../../shared/schemas/responses.js";
import { requireWebhookSignature, requireInternalToken } from "../../../shared/security.js";
import { tenantRateLimit } from "../../../shared/rate-limit.js";
import { DomainError } from "../../../shared/supabase/errors.js";
import { destroyDeployment } from "../domain/lifecycle/destroy.js";
import { applyDeploymentWebhookUpdate } from "../domain/processor.js";
import {
  listDeployments,
  getDeployment,
  getDeploymentForDestroy,
  getDeploymentForWebhook,
  updateDeploymentStatus,
  createAndEnqueueDeployment,
  cancelDeployment,
} from "../domain/deployments.js";

export async function registerDeploymentRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/deploy/deployments",
    {
      preHandler: [app.requirePermission(PERMISSIONS.DEPLOY_CREATE), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "deploy-create" })],
      // Deployment creation validates provider, creates a DB record, and enqueues
      // the pipeline job. Allow extra time for the full round-trip under load.
      handlerTimeout: 45_000,
      schema: {
        tags: ["deploy"],
        summary: "Create deployment",
        body: z.object({
          providerId: z.uuid(),
          gitConnectionId: z.union([z.uuid(), z.literal("")]),
          projectId: z.string().max(100).optional(),
          repo: z.string().min(1).max(300),
          branch: z.string().min(1).max(200),
          tofuScript: z.string().max(100_000).optional(),
          techStack: z.array(z.string().max(50)).max(20).optional(),
          primaryLanguage: z.string().max(50).optional(),
          registryUrl: z.string().max(500).optional(),
          deployStrategy: z.string().max(50).optional(),
          buildMethod: z.enum(["dockerfile", "railpack", "nixpacks", "codebuild"]).optional(),
          useRepoDockerfile: z.boolean().optional(),
          skipPipeline: z.boolean().optional(),
          templateId: z.string().max(100).optional(),
          services: z.array(serviceEntrySchema).max(20).optional(),
        }),
        response: { 200: deploymentSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createAndEnqueueDeployment({
        tenantId: auth.tenantId,
        providerId: request.body.providerId,
        gitConnectionId: request.body.gitConnectionId,
        projectId: request.body.projectId,
        repo: request.body.repo,
        branch: request.body.branch,
        tofuScript: request.body.tofuScript,
        techStack: request.body.techStack,
        primaryLanguage: request.body.primaryLanguage,
        registryUrl: request.body.registryUrl,
        deployStrategy: request.body.deployStrategy,
        buildMethod: request.body.buildMethod,
        useRepoDockerfile: request.body.useRepoDockerfile,
        skipPipeline: request.body.skipPipeline,
        templateId: request.body.templateId,
        services: request.body.services as ServiceEntry[] | undefined,
      });
    },
  );

  typed.get(
    "/deploy/deployments",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["deploy"],
        summary: "List deployments",
        querystring: paginationQuerySchema.extend({
          providerId: z.uuid().optional(),
          projectId: z.uuid().optional(),
        }),
        response: {
          200: z.object({
            deployments: z.array(deploymentSchema),
            pagination: paginationMetaSchema,
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { limit, offset } = request.query;
      const result = await listDeployments(auth.tenantId, {
        providerId: request.query.providerId,
        projectId: request.query.projectId,
        limit,
        offset,
      });
      return {
        deployments: result.deployments,
        pagination: { total: result.total, limit, offset },
      };
    },
  );

  typed.get(
    "/deploy/deployments/:deploymentId",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["deploy"],
        summary: "Get deployment",
        params: z.object({ deploymentId: z.uuid() }),
        response: { 200: deploymentSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getDeployment(request.params.deploymentId, auth.tenantId);
    },
  );

  typed.put(
    "/deploy/deployments/:deploymentId",
    {
      preHandler: requireInternalToken,
      schema: {
        tags: ["deploy"],
        summary: "Update deployment status/logs/url (internal)",
        params: z.object({ deploymentId: z.uuid() }),
        body: z.object({
          status: deploymentStatusSchema.optional(),
          logs: z.string().max(500_000).optional(),
          appUrl: z.string().max(500).optional(),
        }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      await updateDeploymentStatus(request.params.deploymentId, {
        status: request.body.status,
        logs: request.body.logs,
        appUrl: request.body.appUrl,
      });
      return { success: true as const };
    },
  );

  typed.post(
    "/deploy/deployments/:deploymentId/destroy",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_MANAGE),
      // Destroy may call cloud provider APIs to tear down infrastructure.
      handlerTimeout: 60_000,
      schema: {
        tags: ["deploy"],
        summary: "Destroy deployment",
        params: z.object({ deploymentId: z.uuid() }),
        response: { 200: z.object({ success: z.boolean(), message: z.string() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await getDeploymentForDestroy(request.params.deploymentId, auth.tenantId);
      const result = await destroyDeployment(request.params.deploymentId);
      if (!result.success) throw new DomainError(result.message, "bad_request");
      return { success: true, message: result.message };
    },
  );

  typed.post(
    "/deploy/deployments/:deploymentId/cancel",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Cancel a stuck or in-progress deployment",
        params: z.object({ deploymentId: z.uuid() }),
        response: { 200: deploymentSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await cancelDeployment(request.params.deploymentId, auth.tenantId);
    },
  );

  typed.post(
    "/deploy/webhook/aws-pipeline",
    {
      preHandler: requireWebhookSignature,
      schema: {
        tags: ["deploy"],
        summary: "Handle AWS deploy pipeline callback",
        body: z.object({
          buildId: z.uuid(),
          status: z.enum(["deploying", "success", "failed"]),
          appUrl: z.string().max(500).optional(),
          stackName: z.string().max(200).optional(),
          cfnStatus: z.string().max(100).optional(),
          deployTarget: z.string().max(50).optional(),
          codebuildId: z.string().max(200).optional(),
          region: z.string().max(50).optional(),
          instanceId: z.string().max(100).optional(),
          serverIp: z.string().max(50).optional(),
          containerName: z.string().max(100).optional(),
        }),
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (request) => {
      const deployment = await getDeploymentForWebhook(request.body.buildId);
      if (!deployment) return { success: false };
      await applyDeploymentWebhookUpdate(request.body.buildId, request.body);
      return { success: true };
    },
  );
}
