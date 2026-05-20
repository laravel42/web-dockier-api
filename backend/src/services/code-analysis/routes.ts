import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { customRuleSchema, findingSchema, scanSchema, summarySchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import type { Database } from "../../shared/supabase/types.js";

const RULES_DIR = join(process.cwd(), "code-analysis", "rules", "opengrep");

function defaultSummary() {
  return {
    totalFindings: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    filesScanned: 0,
    filesInRepo: 0,
  };
}

function parseSummary(raw: unknown) {
  if (typeof raw === "string") {
    try {
      return summarySchema.parse(JSON.parse(raw));
    } catch {
      return defaultSummary();
    }
  }
  try {
    return summarySchema.parse(raw);
  } catch {
    return defaultSummary();
  }
}

function rowToScan(row: any) {
  return {
    id: row.id,
    projectId: row.project_id ?? "",
    connectionId: row.connection_id ?? "",
    repo: row.repo ?? "",
    branch: row.branch ?? "",
    status: row.status,
    summary: parseSummary(row.summary),
    commitSha: row.commit_sha ?? "",
    commitMessage: row.commit_message ?? "",
    commitAuthor: row.commit_author ?? "",
    commitDate: row.commit_date ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function registerCodeAnalysisRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;

  typed.post(
    "/code-analysis/scans",
    {
      preHandler: app.requireAuth,
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
      const id = uuidv4();
      const now = new Date().toISOString();
      const payload = {
        id,
        organization_id: auth.tenantId,
        project_id: request.body.projectId,
        connection_id: request.body.connectionId,
        repo: request.body.repo,
        branch: request.body.branch,
        status: "pending",
        summary: defaultSummary(),
        created_at: now,
        updated_at: now,
      };
      const { error } = await db.from("scans").insert(payload);
      if (error) throw app.httpErrors.badRequest(error.message);
      return rowToScan(payload);
    },
  );

  typed.get(
    "/code-analysis/scans",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "List scans",
        querystring: z.object({ projectId: z.string().optional(), branch: z.string().optional() }),
        response: { 200: z.object({ scans: z.array(scanSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      let query = db.from("scans").select("*").eq("organization_id", auth.tenantId).order("created_at", { ascending: false }).limit(50);
      if (request.query.projectId) query = query.eq("project_id", request.query.projectId);
      if (request.query.branch) query = query.eq("branch", request.query.branch);
      const { data, error } = await query;
      if (error) throw app.httpErrors.internalServerError(error.message);
      return { scans: (data ?? []).map(rowToScan) };
    },
  );

  typed.get(
    "/code-analysis/scans/:scanId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "Get scan",
        params: z.object({ scanId: z.string().uuid() }),
        response: { 200: scanSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db.from("scans").select("*").eq("id", request.params.scanId).single();
      if (error || !data) throw app.httpErrors.notFound("Scan not found");
      if (data.organization_id !== auth.tenantId) throw app.httpErrors.forbidden("Not your scan");
      return rowToScan(data);
    },
  );

  typed.get(
    "/code-analysis/scans/:scanId/findings",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "List scan findings",
        params: z.object({ scanId: z.string().uuid() }),
        querystring: z.object({ severity: z.string().optional() }),
        response: { 200: z.object({ findings: z.array(findingSchema) }) },
      },
    },
    async (request) => {
      let query = db
        .from("findings")
        .select("id,scan_id,rule_id,severity,message,file_path,start_line,end_line,snippet,created_at")
        .eq("scan_id", request.params.scanId)
        .order("severity", { ascending: true })
        .order("file_path", { ascending: true })
        .order("start_line", { ascending: true });
      if (request.query.severity) query = query.eq("severity", request.query.severity);
      const { data, error } = await query;
      if (error) throw app.httpErrors.internalServerError(error.message);
      return {
        findings: (data ?? []).map((row: any) => ({
          id: row.id,
          scanId: row.scan_id,
          ruleId: row.rule_id,
          severity: row.severity,
          message: row.message,
          filePath: row.file_path,
          startLine: row.start_line,
          endLine: row.end_line,
          snippet: row.snippet,
          createdAt: row.created_at,
        })),
      };
    },
  );

  typed.delete(
    "/code-analysis/scans/:scanId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "Delete scan",
        params: z.object({ scanId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: existing } = await db.from("scans").select("id,organization_id").eq("id", request.params.scanId).single();
      if (!existing) throw app.httpErrors.notFound("Scan not found");
      if (existing.organization_id !== auth.tenantId) throw app.httpErrors.forbidden("Not your scan");
      await db.from("findings").delete().eq("scan_id", request.params.scanId);
      const { error } = await db.from("scans").delete().eq("id", request.params.scanId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );

  typed.post(
    "/code-analysis/scans/:scanId/run",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "Run scan asynchronously",
        params: z.object({ scanId: z.string().uuid() }),
        body: z
          .object({
            enableSemgrep: z.boolean().optional(),
            enableSonarqube: z.boolean().optional(),
            enableCustomRules: z.boolean().optional(),
          })
          .optional(),
        response: { 200: scanSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db.from("scans").select("*").eq("id", request.params.scanId).single();
      if (error || !data) throw app.httpErrors.notFound("Scan not found");
      if (data.organization_id !== auth.tenantId) throw app.httpErrors.forbidden("Not your scan");
      await db
        .from("scans")
        .update({
          status: "running",
          summary: {
            ...defaultSummary(),
            note: "Scan queued; external semgrep/sonarqube workers will populate findings asynchronously.",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.params.scanId);
      const { data: updated } = await db.from("scans").select("*").eq("id", request.params.scanId).single();
      return rowToScan(updated ?? data);
    },
  );

  typed.get(
    "/code-analysis/custom-rules",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "List custom rules",
        querystring: z.object({ type: z.string().optional() }),
        response: { 200: z.object({ rules: z.array(customRuleSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const type = request.query.type ?? "custom";
      const { data, error } = await db
        .from("custom_rules")
        .select("id,organization_id,rule_id,severity,message,pattern,extensions,enabled,type,yaml_content,created_at")
        .or(`organization_id.eq.,organization_id.eq.${auth.tenantId}`)
        .eq("type", type)
        .order("rule_id", { ascending: true });
      if (error) throw app.httpErrors.internalServerError(error.message);
      return {
        rules: (data ?? []).map((row: any) => ({
          id: row.id,
          ruleId: row.rule_id,
          severity: row.severity,
          message: row.message,
          pattern: row.pattern ?? "",
          extensions: row.extensions ?? [],
          enabled: row.enabled,
          isSystem: row.organization_id === "",
          type: row.type,
          yamlContent: row.yaml_content ?? "",
          createdAt: row.created_at,
        })),
      };
    },
  );

  typed.post(
    "/code-analysis/custom-rules",
    {
      preHandler: app.requireAuth,
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
      const id = uuidv4();
      const ruleType = request.body.type ?? "custom";
      if (ruleType === "custom" && request.body.pattern) {
        try {
          new RegExp(request.body.pattern);
        } catch {
          throw app.httpErrors.badRequest("Invalid regex pattern");
        }
      }
      const payload = {
        id,
        organization_id: auth.tenantId,
        rule_id: request.body.ruleId,
        severity: request.body.severity,
        message: request.body.message,
        pattern: request.body.pattern,
        extensions: request.body.extensions,
        type: ruleType,
        yaml_content: request.body.yamlContent ?? "",
        enabled: true,
        created_at: new Date().toISOString(),
      };
      const { error } = await db.from("custom_rules").insert(payload);
      if (error) throw app.httpErrors.badRequest(error.message);
      return {
        id: payload.id,
        ruleId: payload.rule_id,
        severity: payload.severity,
        message: payload.message,
        pattern: payload.pattern,
        extensions: payload.extensions,
        enabled: true,
        isSystem: false,
        type: payload.type,
        yamlContent: payload.yaml_content,
        createdAt: payload.created_at,
      };
    },
  );

  typed.put(
    "/code-analysis/custom-rules/:ruleDbId",
    {
      preHandler: app.requireAuth,
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
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: existing } = await db.from("custom_rules").select("organization_id,type").eq("id", request.params.ruleDbId).single();
      if (!existing) throw app.httpErrors.notFound("Rule not found");
      if (existing.organization_id !== "" && existing.organization_id !== auth.tenantId) throw app.httpErrors.forbidden("Not your rule");
      if (existing.organization_id === "" && request.body.enabled === undefined) {
        throw app.httpErrors.forbidden("System rules only support enable/disable");
      }
      if (request.body.pattern && existing.type === "custom") {
        try {
          new RegExp(request.body.pattern);
        } catch {
          throw app.httpErrors.badRequest("Invalid regex pattern");
        }
      }
      const updates: Database["public"]["Tables"]["custom_rules"]["Update"] = {};
      if (request.body.ruleId !== undefined) updates.rule_id = request.body.ruleId;
      if (request.body.severity !== undefined) updates.severity = request.body.severity;
      if (request.body.message !== undefined) updates.message = request.body.message;
      if (request.body.pattern !== undefined) updates.pattern = request.body.pattern;
      if (request.body.extensions !== undefined) updates.extensions = request.body.extensions;
      if (request.body.enabled !== undefined) updates.enabled = request.body.enabled;
      if (request.body.yamlContent !== undefined) updates.yaml_content = request.body.yamlContent;
      const { error } = await db.from("custom_rules").update(updates).eq("id", request.params.ruleDbId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );

  typed.delete(
    "/code-analysis/custom-rules/:ruleDbId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "Delete custom rule",
        params: z.object({ ruleDbId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data: existing } = await db.from("custom_rules").select("organization_id").eq("id", request.params.ruleDbId).single();
      if (!existing) throw app.httpErrors.notFound("Rule not found");
      if (existing.organization_id === "") throw app.httpErrors.forbidden("Cannot delete system rules");
      if (existing.organization_id !== auth.tenantId) throw app.httpErrors.forbidden("Not your rule");
      const { error } = await db.from("custom_rules").delete().eq("id", request.params.ruleDbId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );

  typed.get(
    "/code-analysis/semgrep-rules",
    {
      preHandler: app.requireAuth,
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
    async () => {
      if (!existsSync(RULES_DIR)) return { rules: [], languages: [] };
      const rules: Array<{ id: string; name: string; lang: string; path: string; severity: string; category: string; message: string }> = [];
      const walk = (dir: string, base: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory() && !entry.name.startsWith(".")) walk(join(dir, entry.name), rel);
          if (entry.isFile() && entry.name.endsWith(".yaml") && !entry.name.startsWith(".")) {
            const lang = rel.split("/")[0];
            rules.push({
              id: rel.replace(/\.yaml$/, "").replace(/\//g, "."),
              name: entry.name.replace(/\.yaml$/, "").replace(/-/g, " "),
              lang,
              path: rel,
              severity: "info",
              category: rel.split("/")[1] ?? "general",
              message: "",
            });
          }
        }
      };
      walk(RULES_DIR, "");
      const languages = [...new Set(rules.map((rule) => rule.lang))].sort();
      return { rules, languages };
    },
  );

  typed.get(
    "/code-analysis/semgrep-rules/content",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "Get semgrep rule file content",
        querystring: z.object({ path: z.string().min(1) }),
        response: { 200: z.object({ content: z.string() }) },
      },
    },
    async (request) => {
      const filePath = join(RULES_DIR, request.query.path);
      if (!filePath.startsWith(RULES_DIR) || !existsSync(filePath)) throw app.httpErrors.notFound("Rule file not found");
      return { content: readFileSync(filePath, "utf-8") };
    },
  );

  typed.put(
    "/code-analysis/semgrep-rules/content",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "Update semgrep rule file content",
        body: z.object({ path: z.string().min(1), content: z.string() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const filePath = join(RULES_DIR, request.body.path);
      if (!filePath.startsWith(RULES_DIR)) throw app.httpErrors.badRequest("Invalid path");
      writeFileSync(filePath, request.body.content, "utf-8");
      return { success: true as const };
    },
  );

  typed.get(
    "/code-analysis/sonar/profiles",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "List SonarQube profiles (migration stub)",
        response: { 200: z.object({ profiles: z.array(z.any()) }) },
      },
    },
    async () => ({ profiles: [] }),
  );

  typed.get(
    "/code-analysis/sonar/rules",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "List SonarQube rules (migration stub)",
        querystring: z.object({ profileKey: z.string(), page: z.coerce.number().optional(), query: z.string().optional() }),
        response: { 200: z.object({ rules: z.array(z.any()), total: z.number().int().nonnegative() }) },
      },
    },
    async () => ({ rules: [], total: 0 }),
  );

  typed.post(
    "/code-analysis/sonar/rules/toggle",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "Toggle SonarQube rule activation (migration stub)",
        body: z.object({ profileKey: z.string(), ruleKey: z.string(), activate: z.boolean() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async () => ({ success: true as const }),
  );

  typed.get(
    "/code-analysis/rule-overrides",
    {
      preHandler: app.requireAuth,
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
      const table = request.query.tool === "semgrep" ? "opengrep_rules" : "sonarqube_rules";
      const { data, error } = await db.from(table).select("id,rule_id,enabled").order("rule_id", { ascending: true });
      if (error) throw app.httpErrors.internalServerError(error.message);
      return {
        overrides: (data ?? []).map((row: any) => ({
          id: row.id,
          ruleId: row.rule_id,
          enabled: row.enabled,
        })),
      };
    },
  );

  typed.post(
    "/code-analysis/rule-overrides",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["code-analysis"],
        summary: "Upsert global rule override",
        body: z.object({
          tool: z.enum(["semgrep", "sonarqube"]),
          ruleId: z.string().min(1),
          enabled: z.boolean(),
        }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const table = request.body.tool === "semgrep" ? "opengrep_rules" : "sonarqube_rules";
      const payload = {
        id: uuidv4(),
        organization_id: auth.tenantId,
        rule_id: request.body.ruleId,
        enabled: request.body.enabled,
      };
      const { error } = await db.from(table).upsert(payload, { onConflict: "rule_id" });
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );
}
