import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth.js";
import { customRuleSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import { listCustomRules, createCustomRule, updateCustomRule, deleteCustomRule } from "../domain/custom-rules.js";

export async function registerCustomRuleRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/code-analysis/custom-rules",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List custom rules",
        querystring: z.object({ type: z.string().optional() }),
        response: { 200: z.object({ rules: z.array(customRuleSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const rules = await listCustomRules({ tenantId: auth.tenantId, type: request.query.type });
      return { rules };
    },
  );

  typed.post(
    "/code-analysis/custom-rules",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_MANAGE),
      schema: {
        tags: ["code-analysis"],
        summary: "Create custom rule",
        body: z.object({
          ruleId: z.string().min(1),
          severity: z.string().min(1),
          message: z.string().min(1),
          pattern: z.string().default(""),
          extensions: z.array(z.string()).default([]),
          type: z.string().optional(),
          yamlContent: z.string().optional(),
        }),
        response: { 200: customRuleSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createCustomRule({
        tenantId: auth.tenantId,
        ruleId: request.body.ruleId,
        severity: request.body.severity,
        message: request.body.message,
        pattern: request.body.pattern,
        extensions: request.body.extensions,
        type: request.body.type,
        yamlContent: request.body.yamlContent,
      });
    },
  );

  typed.put(
    "/code-analysis/custom-rules/:ruleDbId",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_MANAGE),
      schema: {
        tags: ["code-analysis"],
        summary: "Update custom/system rule",
        params: z.object({ ruleDbId: z.uuid() }),
        body: z.object({
          ruleId: z.string().optional(),
          severity: z.string().optional(),
          message: z.string().optional(),
          pattern: z.string().optional(),
          extensions: z.array(z.string()).optional(),
          enabled: z.boolean().optional(),
          yamlContent: z.string().optional(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await updateCustomRule({
        ruleDbId: request.params.ruleDbId,
        tenantId: auth.tenantId,
        ruleId: request.body.ruleId,
        severity: request.body.severity,
        message: request.body.message,
        pattern: request.body.pattern,
        extensions: request.body.extensions,
        enabled: request.body.enabled,
        yamlContent: request.body.yamlContent,
      });
      return { success: true as const };
    },
  );

  typed.delete(
    "/code-analysis/custom-rules/:ruleDbId",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_MANAGE),
      schema: {
        tags: ["code-analysis"],
        summary: "Delete custom rule",
        params: z.object({ ruleDbId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteCustomRule(request.params.ruleDbId, auth.tenantId);
      return { success: true as const };
    },
  );
}
