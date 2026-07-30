import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import { listRuleOverrides, upsertRuleOverride } from "../domain/rule-overrides.js";

export async function registerRuleOverrideRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/code-analysis/rule-overrides",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List global rule overrides",
        querystring: z.object({ tool: z.enum(["semgrep", "sonarqube"]) }),
        response: {
          200: z.object({
            overrides: z.array(z.object({ id: z.uuid(), ruleId: z.string(), enabled: z.boolean() })),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const overrides = await listRuleOverrides(auth.tenantId, request.query.tool);
      return { overrides };
    },
  );

  typed.post(
    "/code-analysis/rule-overrides",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_MANAGE),
      schema: {
        tags: ["code-analysis"],
        summary: "Upsert global rule override",
        body: z.object({
          tool: z.enum(["semgrep", "sonarqube"]),
          ruleId: z.string().min(1),
          enabled: z.boolean(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await upsertRuleOverride({
        tenantId: auth.tenantId,
        tool: request.body.tool,
        ruleId: request.body.ruleId,
        enabled: request.body.enabled,
      });
      return { success: true as const };
    },
  );
}
