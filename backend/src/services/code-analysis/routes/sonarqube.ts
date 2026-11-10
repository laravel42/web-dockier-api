import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { listSonarProfiles, listSonarRules } from "../domain/sonarqube.js";

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

}
