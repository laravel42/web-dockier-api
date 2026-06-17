import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  integrationCreateIssueSchema,
  integrationRequestSchema,
  integrationWithTeamSchema,
  pmIntegrationSchema,
  pmItemSchema,
  teamMemberSchema,
} from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import { providers } from "./domain/providers/index.js";
import {
  createPMIntegration,
  deletePMIntegration,
  getPMIntegrationConfig,
  listPMIntegrations,
  PM_PROVIDERS,
  updatePMIntegration,
} from "./domain/pm-integrations.js";

async function resolvePMConfig(
  request: FastifyRequest,
  body: { integrationId?: string; type?: string; config?: Record<string, string> },
) {
  const auth = request.auth!;
  if (body.integrationId) {
    return getPMIntegrationConfig(body.integrationId, auth.tenantId);
  }
  if (!body.type || !body.config) {
    throw request.server.httpErrors.badRequest("Either integrationId or type+config is required");
  }
  return { type: body.type, config: body.config };
}

export async function registerIntegrationsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/integrations/pm",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["integrations"],
        summary: "List PM integrations",
        response: { 200: z.object({ integrations: z.array(pmIntegrationSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const integrations = await listPMIntegrations(auth.tenantId);
      return { integrations };
    },
  );

  typed.post(
    "/integrations/pm",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["integrations"],
        summary: "Create PM integration",
        body: z.object({
          provider: z.enum(PM_PROVIDERS),
          name: z.string().min(1),
          config: z.record(z.string(), z.string()),
          enabled: z.boolean().optional(),
        }),
        response: { 200: pmIntegrationSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await createPMIntegration({
        tenantId: auth.tenantId,
        provider: request.body.provider,
        name: request.body.name,
        config: request.body.config,
        enabled: request.body.enabled,
      });
    },
  );

  typed.put(
    "/integrations/pm/:integrationId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["integrations"],
        summary: "Update PM integration",
        params: z.object({ integrationId: z.uuid() }),
        body: z.object({
          name: z.string().min(1).optional(),
          config: z.record(z.string(), z.string()).optional(),
          enabled: z.boolean().optional(),
        }),
        response: { 200: pmIntegrationSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await updatePMIntegration({
        integrationId: request.params.integrationId,
        tenantId: auth.tenantId,
        name: request.body.name,
        config: request.body.config,
        enabled: request.body.enabled,
      });
    },
  );

  typed.delete(
    "/integrations/pm/:integrationId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["integrations"],
        summary: "Delete PM integration",
        params: z.object({ integrationId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      await deletePMIntegration(request.params.integrationId, auth.tenantId);
      return { success: true as const };
    },
  );

  typed.post(
    "/integrations/pm/teams",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["integrations"],
        summary: "List PM teams/containers",
        body: integrationRequestSchema,
        response: {
          200: z.object({
            teams: z.array(pmItemSchema),
            teamLabel: z.string(),
            projectLabel: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const { type, config } = await resolvePMConfig(request, request.body);
      const provider = providers[type];
      if (!provider) return { teams: [], teamLabel: "Team", projectLabel: "Project" };
      return provider.listTeams(config);
    },
  );

  typed.post(
    "/integrations/pm/team-projects",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["integrations"],
        summary: "List projects within team",
        body: integrationWithTeamSchema,
        response: { 200: z.object({ projects: z.array(pmItemSchema) }) },
      },
    },
    async (request) => {
      const { type, config } = await resolvePMConfig(request, request.body);
      const { teamId } = request.body;
      const provider = providers[type];
      if (!provider?.listTeamProjects) return { projects: [] };
      return provider.listTeamProjects(config, teamId);
    },
  );

  typed.post(
    "/integrations/pm/team-members",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["integrations"],
        summary: "List team members",
        body: integrationWithTeamSchema,
        response: { 200: z.object({ members: z.array(teamMemberSchema) }) },
      },
    },
    async (request) => {
      const { type, config } = await resolvePMConfig(request, request.body);
      const { teamId } = request.body;
      const provider = providers[type];
      if (!provider?.listTeamMembers) return { members: [] };
      return provider.listTeamMembers(config, teamId);
    },
  );

  typed.post(
    "/integrations/pm/issues",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["integrations"],
        summary: "Create PM issue/ticket",
        body: integrationCreateIssueSchema,
        response: {
          200: z.object({
            issueId: z.string(),
            issueKey: z.string(),
            issueUrl: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const { type, config } = await resolvePMConfig(request, request.body);
      const { title, description, assigneeId } = request.body;
      const provider = providers[type];
      if (!provider) throw app.httpErrors.notImplemented(`Unsupported integration type: ${type}`);
      try {
        return await provider.createIssue({
          type,
          config,
          teamId: request.body.teamId,
          projectId: request.body.projectId,
          title,
          description,
          priority: request.body.priority,
          estimateMinutes: request.body.estimateMinutes,
          assigneeId,
        });
      } catch (error) {
        app.log.error(error);
        throw app.httpErrors.badGateway("Failed to create issue in external provider");
      }
    },
  );
}
