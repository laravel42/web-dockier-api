import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { customRuleSchema, findingSchema, scanSchema } from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";

// Domain modules
import { createScan, listScans, getScan, deleteScan, runScan } from "./domain/scans.js";
import { listFindings } from "./domain/findings.js";
import { listCustomRules, createCustomRule, updateCustomRule, deleteCustomRule } from "./domain/custom-rules.js";
import { listSemgrepRules, getSemgrepRuleContent, updateSemgrepRuleContent } from "./domain/semgrep-rules.js";
import { listRuleOverrides, upsertRuleOverride } from "./domain/rule-overrides.js";
import {
  listSonarProfiles,
  listSonarRules,
  SonarNotConfiguredError,
  toggleSonarRule,
} from "./domain/sonarqube.js";

export async function registerCodeAnalysisRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Scans ─────────────────────────────────────────────────────────────────

  typed.post(
    "/code-analysis/scans",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_RUN),
      schema: {
        tags: ["code-analysis"],
        summary: "Create scan",
        body: z.object({
          projectId: z.string(),
          connectionId: z.string(),
          repo: z.string(),
          branch: z.string(),
        }),
        response: { 200: scanSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await createScan({
        tenantId: auth.tenantId,
        projectId: request.body.projectId,
        connectionId: request.body.connectionId,
        repo: request.body.repo,
        branch: request.body.branch,
      });
    },
  );

  typed.get(
    "/code-analysis/scans",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List scans",
        querystring: z.object({ projectId: z.string().optional(), branch: z.string().optional() }),
        response: { 200: z.object({ scans: z.array(scanSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const scans = await listScans({
        tenantId: auth.tenantId,
        projectId: request.query.projectId,
        branch: request.query.branch,
      });
      return { scans };
    },
  );

  typed.get(
    "/code-analysis/scans/:scanId",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "Get scan",
        params: z.object({ scanId: z.string().uuid() }),
        response: { 200: scanSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await getScan(request.params.scanId, auth.tenantId);
    },
  );

  typed.delete(
    "/code-analysis/scans/:scanId",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_MANAGE),
      schema: {
        tags: ["code-analysis"],
        summary: "Delete scan",
        params: z.object({ scanId: z.string().uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      await deleteScan(request.params.scanId, auth.tenantId);
      return { success: true as const };
    },
  );

  typed.post(
    "/code-analysis/scans/:scanId/run",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_RUN),
      schema: {
        tags: ["code-analysis"],
        summary: "Run scan asynchronously",
        params: z.object({ scanId: z.string().uuid() }),
        body: z
          .object({
            enableSemgrep: z.boolean().optional(),
            enableOpengrep: z.boolean().optional(),
            enableSonarqube: z.boolean().optional(),
            enableCustomRules: z.boolean().optional(),
            enableSensitiveData: z.boolean().optional(),
          })
          .optional(),
        response: { 200: scanSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const body = request.body ?? {};
      const enableSemgrep = body.enableOpengrep ?? body.enableSemgrep;
      return await runScan(request.params.scanId, auth.tenantId, {
        ...body,
        enableSemgrep,
      });
    },
  );

  // ─── Findings ──────────────────────────────────────────────────────────────

  typed.get(
    "/code-analysis/scans/:scanId/findings",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List scan findings",
        params: z.object({ scanId: z.string().uuid() }),
        querystring: z.object({ severity: z.string().optional() }),
        response: { 200: z.object({ findings: z.array(findingSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const findings = await listFindings({
        scanId: request.params.scanId,
        tenantId: auth.tenantId,
        severity: request.query.severity,
      });
      return { findings };
    },
  );

  // ─── Custom Rules ──────────────────────────────────────────────────────────

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
      const auth = request.auth!;
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
      const auth = request.auth!;
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
        params: z.object({ ruleDbId: z.string().uuid() }),
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
      const auth = request.auth!;
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
        params: z.object({ ruleDbId: z.string().uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      await deleteCustomRule(request.params.ruleDbId, auth.tenantId);
      return { success: true as const };
    },
  );

  // ─── Semgrep Rules (filesystem) ────────────────────────────────────────────

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

  // ─── SonarQube ─────────────────────────────────────────────────────────────

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
      try {
        const profiles = await listSonarProfiles();
        return { profiles };
      } catch (err) {
        if (err instanceof SonarNotConfiguredError) {
          throw app.httpErrors.serviceUnavailable(err.message);
        }
        throw err;
      }
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
      try {
        return await listSonarRules(request.query);
      } catch (err) {
        if (err instanceof SonarNotConfiguredError) {
          throw app.httpErrors.serviceUnavailable(err.message);
        }
        throw err;
      }
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
      try {
        await toggleSonarRule(request.body);
        return { success: true as const };
      } catch (err) {
        if (err instanceof SonarNotConfiguredError) {
          throw app.httpErrors.serviceUnavailable(err.message);
        }
        throw err;
      }
    },
  );

  // ─── Rule Overrides ────────────────────────────────────────────────────────

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
            overrides: z.array(z.object({ id: z.string().uuid(), ruleId: z.string(), enabled: z.boolean() })),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
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
      const auth = request.auth!;
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
