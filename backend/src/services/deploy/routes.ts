import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { deploymentSchema, deploymentStatusSchema, envVarSchema, postDeployCommandSchema, providerSchema, serviceEntrySchema } from "./schemas.js";
import type { DeploymentRow, ProviderRow, ServiceEntry, DeploymentStatus } from "./types.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { generateTofuPreview, getDefaultRegion, normalizeAppName } from "./domain/planner.js";
import { destroyDeployment } from "./domain/destroy.js";
import { applyDeploymentWebhookUpdate, createDeploymentRecord } from "./domain/processor.js";
import { resolveDeployTemplate } from "./domain/templates.js";
import { executePipeline } from "./domain/pipeline.js";
import { enqueueDeployment } from "./domain/worker.js";
import { requireWebhookSignature, requireInternalToken } from "../../shared/security.js";

function rowToProvider(row: Pick<ProviderRow, "id" | "provider" | "label" | "region" | "created_at">) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    region: row.region ?? "",
    createdAt: row.created_at,
  };
}

function rowToDeployment(row: DeploymentRow) {
  return {
    id: row.id,
    providerId: row.provider_id ?? "",
    gitConnectionId: row.git_connection_id ?? "",
    projectId: row.project_id ?? "",
    repo: row.repo,
    branch: row.branch,
    status: row.status as DeploymentStatus,
    logs: row.logs ?? "",
    appUrl: row.app_url ?? "",
    commitHash: row.commit_hash ?? "",
    dockerImage: row.docker_image ?? "",
    deployStrategy: row.deploy_strategy ?? "managed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function registerDeployRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;

  typed.post(
    "/deploy/providers",
    {
      preHandler: app.requireAuth,
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
      const id = uuidv4();
      const now = new Date().toISOString();
      const payload = {
        id,
        app_id: auth.appId,
        provider: request.body.provider,
        label: request.body.label,
        api_key: request.body.apiKey,
        api_secret: request.body.apiSecret,
        region: request.body.region ?? "",
        app_runner_connection_arn: "",
        created_at: now,
      };
      const { error } = await db.from("server_providers").insert(payload);
      if (error) throw app.httpErrors.badRequest(error.message);
      return rowToProvider(payload);
    },
  );

  typed.get(
    "/deploy/providers",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["deploy"],
        summary: "List deployment providers",
        response: { 200: z.object({ providers: z.array(providerSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db
        .from("server_providers")
        .select("id,provider,label,region,created_at")
        .eq("app_id", auth.appId)
        .order("created_at", { ascending: false });
      if (error) throw app.httpErrors.internalServerError(error.message);
      return { providers: (data ?? []).map(rowToProvider) };
    },
  );

  typed.put(
    "/deploy/providers/:providerId",
    {
      preHandler: app.requireAuth,
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
      const { data: existing, error: existingError } = await db
        .from("server_providers")
        .select("id,provider,label,region,created_at,app_id")
        .eq("id", request.params.providerId)
        .single();
      if (existingError || !existing) throw app.httpErrors.notFound("Provider not found");
      if (existing.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your provider");
      const updates: Partial<ProviderRow> = {};
      if (request.body.label !== undefined) updates.label = request.body.label;
      if (request.body.apiSecret !== undefined) updates.api_secret = request.body.apiSecret.trim();
      const { error } = await db.from("server_providers").update(updates).eq("id", request.params.providerId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return rowToProvider({
        id: existing.id,
        provider: existing.provider,
        label: request.body.label ?? existing.label,
        region: existing.region,
        created_at: existing.created_at,
      });
    },
  );

  typed.delete(
    "/deploy/providers/:providerId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["deploy"],
        summary: "Delete provider and dependent deployments",
        params: z.object({ providerId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: existing } = await db
        .from("server_providers")
        .select("id,app_id")
        .eq("id", request.params.providerId)
        .single();
      if (!existing) throw app.httpErrors.notFound("Provider not found");
      if (existing.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your provider");
      await db.from("deployments").delete().eq("provider_id", request.params.providerId);
      const { error } = await db.from("server_providers").delete().eq("id", request.params.providerId);
      if (error) throw app.httpErrors.badRequest(error.message);
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
      const { data, error } = await db
        .from("server_providers")
        .select("provider,region,api_key,api_secret")
        .eq("id", request.params.providerId)
        .single();
      if (error || !data) throw app.httpErrors.notFound("Provider not found");
      return {
        provider: data.provider,
        region: data.region ?? "",
        apiKey: data.api_key,
        apiSecret: data.api_secret,
      };
    },
  );

  typed.get(
    "/deploy/ssh-keys",
    {
      preHandler: app.requireAuth,
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
      const { data, error } = await db
        .from("ssh_keys")
        .select("id,label,public_key,fingerprint,created_at")
        .eq("app_id", auth.appId)
        .order("created_at", { ascending: false });
      if (error) throw app.httpErrors.internalServerError(error.message);
      return {
        keys: (data ?? []).map((row: any) => ({
          id: row.id,
          label: row.label,
          publicKey: row.public_key,
          fingerprint: row.fingerprint ?? "",
          createdAt: row.created_at,
        })),
      };
    },
  );

  typed.post(
    "/deploy/ssh-keys",
    {
      preHandler: app.requireAuth,
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
      const id = uuidv4();
      const publicKey = request.body.publicKey.trim();
      if (!publicKey.startsWith("ssh-") && !publicKey.startsWith("ecdsa-")) {
        throw app.httpErrors.badRequest("Invalid SSH public key format");
      }
      const parts = publicKey.split(/\s+/);
      const fingerprint = parts.length >= 2 ? `SHA256:${parts[1].slice(0, 16)}...` : "";
      const payload = {
        id,
        app_id: auth.appId,
        label: request.body.label,
        public_key: publicKey,
        fingerprint,
        created_at: new Date().toISOString(),
      };
      const { error } = await db.from("ssh_keys").insert(payload);
      if (error) throw app.httpErrors.badRequest(error.message);
      return {
        id,
        label: payload.label,
        publicKey,
        fingerprint,
        createdAt: payload.created_at,
      };
    },
  );

  typed.delete(
    "/deploy/ssh-keys/:keyId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["deploy"],
        summary: "Delete SSH key",
        params: z.object({ keyId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { error } = await db.from("ssh_keys").delete().eq("id", request.params.keyId).eq("app_id", auth.appId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );

  typed.post(
    "/deploy/deployments",
    {
      preHandler: app.requireAuth,
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
      const { data: providerRow, error: providerError } = await db
        .from("server_providers")
        .select("id,app_id,provider,region")
        .eq("id", request.body.providerId)
        .single();
      if (providerError || !providerRow) throw app.httpErrors.notFound("Provider not found");
      if (providerRow.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your provider");

      try {
        const payload = await createDeploymentRecord(
          db,
          {
            appId: auth.appId,
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
            appId: auth.appId,
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
          });
        }

        return rowToDeployment(payload as any);
      } catch (error) {
        throw app.httpErrors.badRequest((error as Error).message);
      }
    },
  );

  typed.get(
    "/deploy/deployments",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["deploy"],
        summary: "List deployments",
        querystring: z.object({ providerId: z.string().uuid().optional() }),
        response: { 200: z.object({ deployments: z.array(deploymentSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      let query = db.from("deployments").select("*").eq("app_id", auth.appId).order("created_at", { ascending: false }).limit(50);
      if (request.query.providerId) query = query.eq("provider_id", request.query.providerId);
      const { data, error } = await query;
      if (error) throw app.httpErrors.internalServerError(error.message);
      return { deployments: (data ?? []).map(rowToDeployment) };
    },
  );

  typed.get(
    "/deploy/deployments/:deploymentId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["deploy"],
        summary: "Get deployment",
        params: z.object({ deploymentId: z.string().uuid() }),
        response: { 200: deploymentSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db.from("deployments").select("*").eq("id", request.params.deploymentId).single();
      if (error || !data) throw app.httpErrors.notFound("Deployment not found");
      if (data.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your deployment");
      return rowToDeployment(data);
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
      const updates: Partial<DeploymentRow> = { updated_at: new Date().toISOString() };
      if (request.body.status !== undefined) updates.status = request.body.status;
      if (request.body.logs !== undefined) updates.logs = request.body.logs;
      if (request.body.appUrl !== undefined) updates.app_url = request.body.appUrl;
      const { error } = await db.from("deployments").update(updates).eq("id", request.params.deploymentId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { ok: true as const };
    },
  );

  typed.post(
    "/deploy/deployments/:deploymentId/destroy",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["deploy"],
        summary: "Destroy deployment",
        params: z.object({ deploymentId: z.string().uuid() }),
        response: { 200: z.object({ success: z.boolean(), message: z.string() }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: existing, error: existingError } = await db
        .from("deployments")
        .select("id,app_id")
        .eq("id", request.params.deploymentId)
        .single();
      if (existingError || !existing) throw app.httpErrors.notFound("Deployment not found");
      if (existing.app_id !== auth.appId) throw app.httpErrors.forbidden("Not your deployment");

      const result = await destroyDeployment(db, request.params.deploymentId);
      if (!result.success) throw app.httpErrors.badRequest(result.message);
      return { success: true, message: result.message };
    },
  );

  typed.post(
    "/deploy/tofu/generate",
    {
      preHandler: app.requireAuth,
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
      const { data: providerRow, error } = await db
        .from("server_providers")
        .select("provider,region,label")
        .eq("id", request.body.providerId)
        .single();
      if (error || !providerRow) throw app.httpErrors.notFound("Provider not found");

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
      const { data: row } = await db.from("deployments").select("id").eq("id", request.body.buildId).single();
      if (!row) return { ok: false };
      await applyDeploymentWebhookUpdate(db, request.body.buildId, request.body);
      return { ok: true };
    },
  );
}
