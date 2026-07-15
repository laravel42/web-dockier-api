/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth.js";
import { deploymentSchema, deploymentStatusSchema, providerSchema, serviceEntrySchema } from "./schemas.js";
import type { ServiceEntry } from "./types.js";
import { generateTofuPreview, getDefaultRegion, normalizeAppName } from "./domain/planner.js";
import { destroyDeployment } from "./domain/destroy.js";
import { applyDeploymentWebhookUpdate } from "./domain/processor.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { resolveDeployTemplate } from "./domain/templates.js";
import { requireWebhookSignature, requireInternalToken } from "../../shared/security.js";
import { successResponseSchema, paginationQuerySchema, paginationMetaSchema } from "../../shared/schemas/responses.js";
import { tenantRateLimit } from "../../shared/rate-limit.js";
import { DomainError } from "../../shared/supabase/errors.js";
import {
  createProvider,
  listProviders,
  getProviderForTenant,
  updateProvider,
  deleteProvider,
  getProviderCredentials,
} from "./domain/providers.js";
import { listSshKeys, createSshKey, deleteSshKey } from "./domain/ssh-keys.js";
import { listDeployments, getDeployment, getDeploymentForDestroy, getDeploymentForWebhook, updateDeploymentStatus, createAndEnqueueDeployment } from "./domain/deployments.js";

export async function registerDeployRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/deploy/providers",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Add deployment provider credentials",
        body: z.object({
          provider: z.string().min(1),
          label: z.string().min(1),
          apiKey: z.string().min(1),
          apiSecret: z.string().min(1),
          region: z.string().optional(),
        }),
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createProvider({
        tenantId: auth.tenantId,
        provider: request.body.provider,
        label: request.body.label,
        apiKey: request.body.apiKey,
        apiSecret: request.body.apiSecret,
        region: request.body.region,
      });
    },
  );

  typed.get(
    "/deploy/providers",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["deploy"],
        summary: "List deployment providers",
        response: { 200: z.object({ providers: z.array(providerSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const providers = await listProviders(auth.tenantId);
      return { providers };
    },
  );

  typed.put(
    "/deploy/providers/:providerId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Update provider label or secret",
        params: z.object({ providerId: z.uuid() }),
        body: z.object({ label: z.string().optional(), apiSecret: z.string().optional() }),
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateProvider({
        providerId: request.params.providerId,
        tenantId: auth.tenantId,
        label: request.body.label,
        apiSecret: request.body.apiSecret,
      });
    },
  );

  typed.delete(
    "/deploy/providers/:providerId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Delete provider and dependent deployments",
        params: z.object({ providerId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteProvider(request.params.providerId, auth.tenantId);
      return { success: true as const };
    },
  );

  typed.get(
    "/deploy/providers/:providerId/credentials",
    {
      preHandler: requireInternalToken,
      schema: {
        tags: ["deploy"],
        summary: "Get provider credentials (service-to-service)",
        params: z.object({ providerId: z.uuid() }),
        response: {
          200: z.object({
            provider: z.string(),
            region: z.string(),
            apiKey: z.string(),
            apiSecret: z.string(),
          }),
        },
      },
    },
    async (request) => {
      return await getProviderCredentials(request.params.providerId);
    },
  );

  typed.get(
    "/deploy/ssh-keys",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["deploy"],
        summary: "List SSH keys",
        response: {
          200: z.object({
            keys: z.array(
              z.object({
                id: z.uuid(),
                label: z.string(),
                publicKey: z.string(),
                fingerprint: z.string(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const keys = await listSshKeys(auth.tenantId);
      return { keys };
    },
  );

  typed.post(
    "/deploy/ssh-keys",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Add SSH key",
        body: z.object({ label: z.string().min(1), publicKey: z.string().min(1) }),
        response: {
          200: z.object({
            id: z.uuid(),
            label: z.string(),
            publicKey: z.string(),
            fingerprint: z.string(),
            createdAt: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createSshKey({
        tenantId: auth.tenantId,
        label: request.body.label,
        publicKey: request.body.publicKey,
      });
    },
  );

  typed.delete(
    "/deploy/ssh-keys/:keyId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Delete SSH key",
        params: z.object({ keyId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteSshKey(request.params.keyId, auth.tenantId);
      return { success: true as const };
    },
  );

  typed.post(
    "/deploy/deployments",
    {
      preHandler: [app.requirePermission(PERMISSIONS.DEPLOY_CREATE), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "deploy-create" })],
      schema: {
        tags: ["deploy"],
        summary: "Create deployment",
        body: z.object({
          providerId: z.uuid(),
          gitConnectionId: z.uuid(),
          projectId: z.string().optional(),
          repo: z.string().min(1),
          branch: z.string().min(1),
          tofuScript: z.string().optional(),
          techStack: z.array(z.string()).optional(),
          primaryLanguage: z.string().optional(),
          registryUrl: z.string().optional(),
          deployStrategy: z.string().optional(),
          buildMethod: z.enum(["dockerfile", "railpack", "nixpacks", "codebuild"]).optional(),
          useRepoDockerfile: z.boolean().optional(),
          skipPipeline: z.boolean().optional(),
          templateId: z.string().optional(),
          services: z.array(serviceEntrySchema).optional(),
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
          logs: z.string().optional(),
          appUrl: z.string().optional(),
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
    "/deploy/tofu/generate",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_CREATE),
      schema: {
        tags: ["deploy"],
        summary: "Generate IaC script preview",
        body: z.object({
          providerId: z.uuid(),
          repo: z.string().min(1),
          branch: z.string().min(1),
          techStack: z.array(z.string()).default([]),
          primaryLanguage: z.string().default(""),
          hasDocker: z.boolean(),
          appName: z.string().optional(),
          region: z.string().optional(),
          deployStrategy: z.enum(["vps", "managed", "static"]).optional(),
          useDocker: z.boolean().optional(),
          dockerImage: z.string().optional(),
          instanceType: z.string().optional(),
          services: z.array(serviceEntrySchema).optional(),
          templateId: z.string().optional(),
          aiAnalysis: z.any().optional(),
        }),
        response: {
          200: z.object({
            script: z.string(),
            provider: z.string(),
            region: z.string(),
            appName: z.string(),
            estimatedResources: z.array(z.string()),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const full = await getProviderForTenant(request.body.providerId, auth.tenantId);
      const providerRow = { provider: full.provider, region: full.region, label: full.label };

      const provider = providerRow.provider;
      const region = request.body.region || providerRow.region || getDefaultRegion(provider);
      const repoName = request.body.repo.split("/").pop() || "app";
      const appName = normalizeAppName(request.body.appName || repoName);
      const services = request.body.services ?? [];
      const deployStrategy = request.body.deployStrategy ?? "managed";
      const template = resolveDeployTemplate({
        provider,
        strategy: deployStrategy,
        primaryLanguage: request.body.primaryLanguage,
        techStack: request.body.techStack,
        requestedTemplateId: request.body.templateId,
      });
      const { script, estimatedResources } = generateTofuPreview({
        provider,
        region,
        appName,
        repo: request.body.repo,
        branch: request.body.branch,
        techStack: request.body.techStack,
        primaryLanguage: request.body.primaryLanguage,
        hasDocker: request.body.hasDocker,
        deployStrategy,
        services,
        aiAnalysis: request.body.aiAnalysis,
      });

      return {
        script,
        provider,
        region,
        appName,
        estimatedResources: Array.from(new Set([...estimatedResources, ...template.defaultServices.map((service) => `${service.type}:${service.mode}`)])),
      };
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
          appUrl: z.string().optional(),
          stackName: z.string().optional(),
          cfnStatus: z.string().optional(),
          deployTarget: z.string().optional(),
          codebuildId: z.string().optional(),
          region: z.string().optional(),
          instanceId: z.string().optional(),
          serverIp: z.string().optional(),
          containerName: z.string().optional(),
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
