import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  integrationCreateIssueSchema,
  integrationRequestSchema,
  integrationWithTeamSchema,
  pmItemSchema,
  teamMemberSchema,
} from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { providers } from "./domain/providers/index.js";

export async function registerIntegrationsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

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
      const provider = providers[request.body.type];
      if (!provider) return { teams: [], teamLabel: "Team", projectLabel: "Project" };
      return provider.listTeams(request.body.config);
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
      const { type, config, teamId } = request.body;
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
      const { type, config, teamId } = request.body;
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
      const { type, config, title, description, assigneeId } = request.body;
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
