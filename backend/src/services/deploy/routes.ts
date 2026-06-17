/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { deploymentSchema, deploymentStatusSchema, envVarSchema, postDeployCommandSchema, providerSchema, serviceEntrySchema } from "./schemas.js";
import type { ServiceEntry } from "./types.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { generateTofuPreview, getDefaultRegion, normalizeAppName } from "./domain/planner.js";
import { destroyDeployment } from "./domain/destroy.js";
import { applyDeploymentWebhookUpdate, createDeploymentRecord } from "./domain/processor.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { resolveDeployTemplate } from "./domain/templates.js";
import { enqueueDeployment } from "./domain/worker.js";
import { requireWebhookSignature, requireInternalToken } from "../../shared/security.js";
import { rowToDeployment } from "./domain/mappers.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import {
  createProvider,
  listProviders,
  getProviderForTenant,
  updateProvider,
  deleteProvider,
  getProviderCredentials,
} from "./domain/providers.js";
import { listSshKeys, createSshKey, deleteSshKey } from "./domain/ssh-keys.js";
import { listDeployments, getDeployment, getDeploymentForDestroy, updateDeploymentStatus } from "./domain/deployments.js";

export async function registerDeployRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;

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
      const auth = request.auth!;
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
      const auth = request.auth!;
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
        params: z.object({ providerId: z.string().uuid() }),
        body: z.object({ label: z.string().optional(), apiSecret: z.string().optional() }),
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
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
        params: z.object({ providerId: z.string().uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
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
        params: z.object({ providerId: z.string().uuid() }),
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
                id: z.string().uuid(),
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
      const auth = request.auth!;
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
            id: z.string().uuid(),
            label: z.string(),
            publicKey: z.string(),
            fingerprint: z.string(),
            createdAt: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
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
        params: z.object({ keyId: z.string().uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      await deleteSshKey(request.params.keyId, auth.tenantId);
      return { success: true as const };
    },
  );

  typed.post(
    "/deploy/deployments",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_CREATE),
      schema: {
        tags: ["deploy"],
        summary: "Create deployment",
        body: z.object({
          providerId: z.string().uuid(),
          gitConnectionId: z.string().uuid(),
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
          envVars: z.array(envVarSchema).optional(),
          services: z.array(serviceEntrySchema).optional(),
          postDeployCommands: z.array(postDeployCommandSchema).max(20).optional(),
        }),
        response: { 200: deploymentSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const full = await getProviderForTenant(request.body.providerId, auth.tenantId);
      const providerRow = { id: full.id, organization_id: full.organization_id, provider: full.provider, region: full.region };

      const payload = await createDeploymentRecord(
        db,
        {
          tenantId: auth.tenantId,
          providerId: request.body.providerId,
          gitConnectionId: request.body.gitConnectionId,
          projectId: request.body.projectId,
          repo: request.body.repo,
          branch: request.body.branch,
          tofuScript: request.body.tofuScript,
          techStack: request.body.techStack,
          primaryLanguage: request.body.primaryLanguage,
          hasDocker: request.body.buildMethod === "dockerfile",
          deployStrategy: (request.body.deployStrategy as "vps" | "managed" | "static" | undefined) ?? "managed",
          templateId: request.body.templateId,
          buildMethod: request.body.buildMethod,
          registryUrl: request.body.registryUrl,
          skipPipeline: request.body.skipPipeline,
          useRepoDockerfile: request.body.useRepoDockerfile,
          services: request.body.services as ServiceEntry[] | undefined,
        },
        {
          provider: providerRow.provider,
          region: providerRow.region ?? null,
        },
      );

      // Enqueue the deploy pipeline for background processing
      if (!request.body.skipPipeline) {
        await enqueueDeployment({
          deploymentId: payload.id,
          tenantId: auth.tenantId,
          providerId: request.body.providerId,
          gitConnectionId: request.body.gitConnectionId,
          projectId: request.body.projectId,
          repo: request.body.repo,
          branch: request.body.branch,
          tofuScript: payload.tofu_script || "",
          techStack: request.body.techStack,
          primaryLanguage: request.body.primaryLanguage,
          hasDocker: request.body.buildMethod === "dockerfile",
          deployStrategy: payload.deploy_strategy || "managed",
          templateId: request.body.templateId,
          buildMethod: request.body.buildMethod,
          registryUrl: request.body.registryUrl,
          envVars: request.body.envVars,
          postDeployCommands: request.body.postDeployCommands,
          services: request.body.services as Array<{ type: string; name: string; mode: string }> | undefined,
          useRepoDockerfile: request.body.useRepoDockerfile,
        });
      }

      return rowToDeployment(payload as any);
    },
  );

  typed.get(
    "/deploy/deployments",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["deploy"],
        summary: "List deployments",
        querystring: z.object({
          providerId: z.string().uuid().optional(),
          projectId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
          offset: z.coerce.number().int().min(0).optional(),
        }),
        response: {
          200: z.object({
            deployments: z.array(deploymentSchema),
            total: z.number().int().nonnegative(),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await listDeployments(auth.tenantId, {
        providerId: request.query.providerId,
        projectId: request.query.projectId,
        limit: request.query.limit,
        offset: request.query.offset,
      });
    },
  );

  typed.get(
    "/deploy/deployments/:deploymentId",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["deploy"],
        summary: "Get deployment",
        params: z.object({ deploymentId: z.string().uuid() }),
        response: { 200: deploymentSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
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
        params: z.object({ deploymentId: z.string().uuid() }),
        body: z.object({
          status: deploymentStatusSchema.optional(),
          logs: z.string().optional(),
          appUrl: z.string().optional(),
        }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await updateDeploymentStatus(request.params.deploymentId, {
        status: request.body.status,
        logs: request.body.logs,
        appUrl: request.body.appUrl,
      });
      return { ok: true as const };
    },
  );

  typed.post(
    "/deploy/deployments/:deploymentId/destroy",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Destroy deployment",
        params: z.object({ deploymentId: z.string().uuid() }),
        response: { 200: z.object({ success: z.boolean(), message: z.string() }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      await getDeploymentForDestroy(request.params.deploymentId, auth.tenantId);
      const result = await destroyDeployment(db, request.params.deploymentId);
      if (!result.success) throw app.httpErrors.badRequest(result.message);
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
          providerId: z.string().uuid(),
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
      const auth = request.auth!;
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
          buildId: z.string().uuid(),
          status: z.enum(["deploying", "success", "failed"]),
          appUrl: z.string().optional(),
          stackName: z.string().optional(),
          cfnStatus: z.string().optional(),
          deployTarget: z.string().optional(),
          codebuildId: z.string().optional(),
        }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const { data: row, error: fetchError } = await db.from("deployments").select("id").eq("id", request.body.buildId).single();
      if (fetchError) {
        if (fetchError.code === "PGRST116") return { ok: false };
        app.log.error(fetchError);
        throw app.httpErrors.internalServerError("Database error fetching deployment");
      }
      if (!row) return { ok: false };
      await applyDeploymentWebhookUpdate(db, request.body.buildId, request.body);
      return { ok: true };
    },
  );
}
