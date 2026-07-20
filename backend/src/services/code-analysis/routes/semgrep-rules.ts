import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import { listSemgrepRules, getSemgrepRuleContent, updateSemgrepRuleContent } from "../domain/semgrep-rules.js";

export async function registerSemgrepRuleRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/code-analysis/semgrep-rules",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List local semgrep rules",
        response: {
          200: z.object({
            rules: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                lang: z.string(),
                path: z.string(),
                severity: z.string(),
                category: z.string(),
                message: z.string(),
              }),
            ),
            languages: z.array(z.string()),
          }),
        },
      },
    },
    async () => listSemgrepRules(),
  );

  typed.get(
    "/code-analysis/semgrep-rules/content",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "Get semgrep rule file content",
        querystring: z.object({ path: z.string().min(1) }),
        response: { 200: z.object({ content: z.string() }) },
      },
    },
    async (request) => {
      const content = getSemgrepRuleContent(request.query.path);
      return { content };
    },
  );

  typed.put(
    "/code-analysis/semgrep-rules/content",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_MANAGE),
      schema: {
        tags: ["code-analysis"],
        summary: "Update semgrep rule file content",
        body: z.object({ path: z.string().min(1), content: z.string() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      updateSemgrepRuleContent(request.body.path, request.body.content);
      return { success: true as const };
    },
  );
}
