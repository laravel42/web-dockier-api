import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { serviceEntrySchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { normalizeAppName } from "../../../lib/naming.js";
import { generateTofuPreview, getDefaultRegion } from "../domain/planning/planner.js";
import { getProviderForTenant } from "../domain/providers.js";
import { resolveDeployTemplate } from "../domain/planning/templates.js";

export async function registerTofuRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/deploy/tofu/generate",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_CREATE),
      // IaC generation validates provider and computes the script in-process.
      handlerTimeout: 30_000,
      schema: {
        tags: ["deploy"],
        summary: "Generate IaC script preview",
        body: z.object({
          providerId: z.uuid(),
          repo: z.string().min(1).max(300),
          branch: z.string().min(1).max(200),
          techStack: z.array(z.string().max(50)).max(20).default([]),
          primaryLanguage: z.string().max(50).default(""),
          hasDocker: z.boolean(),
          appName: z.string().max(100).optional(),
          region: z.string().max(50).optional(),
          deployStrategy: z.enum(["vps", "managed", "static"]).optional(),
          useDocker: z.boolean().optional(),
          dockerImage: z.string().max(500).optional(),
          instanceType: z.string().max(50).optional(),
          services: z.array(serviceEntrySchema).max(20).optional(),
          templateId: z.string().max(100).optional(),
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
}
