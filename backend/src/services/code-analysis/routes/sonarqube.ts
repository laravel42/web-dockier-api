import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import {
  listSonarProfiles,
  listSonarRules,
  toggleSonarRule,
} from "../domain/sonarqube.js";

export async function registerSonarQubeRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/code-analysis/sonar/profiles",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List SonarQube quality profiles",
        response: { 200: z.object({ profiles: z.array(z.any()) }) },
      },
    },
    async () => {
      const profiles = await listSonarProfiles();
      return { profiles };
    },
  );

  typed.get(
    "/code-analysis/sonar/rules",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List SonarQube rules for a quality profile",
        querystring: z.object({ profileKey: z.string(), page: z.coerce.number().optional(), query: z.string().optional() }),
        response: { 200: z.object({ rules: z.array(z.any()), total: z.number().int().nonnegative() }) },
      },
    },
    async (request) => {
      return await listSonarRules(request.query);
    },
  );

  typed.post(
    "/code-analysis/sonar/rules/toggle",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_MANAGE),
      schema: {
        tags: ["code-analysis"],
        summary: "Toggle SonarQube rule activation in a quality profile",
        body: z.object({ profileKey: z.string(), ruleKey: z.string(), activate: z.boolean() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      await toggleSonarRule(request.body);
      return { success: true as const };
    },
  );
}
