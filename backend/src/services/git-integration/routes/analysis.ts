/**
 * Analysis routes: stack analysis, repo-analyze, sensitive data, badges, AI, MR creation.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import { analyzeSensitiveDataFromText, runRepoAnalysis } from "../domain/analysis.js";
import { fetchRepoFile, getRepoFileTree } from "../domain/providers/provider-client.js";
import { resolveRepoFaviconDataUrl, isRepoFaviconCacheValid, isValidFaviconDataUrl, REPO_FAVICON_RESOLVER_VERSION, type RepoFaviconCacheEntry } from "../domain/repo-favicon.js";
import { createMergeRequest, estimateFixMinutes, parseRepoKey, summarizeFindingTitle } from "../domain/ai/mr-generator.js";
import { getFindingById } from "../../../shared/service-clients/findings.js";
import { runAiAnalysisForRepo } from "../domain/ai/ai-analysis.js";
import type { TechStackItem } from "../domain/tech-stack.js";
import type { DetectedService } from "../domain/services.js";
import { env } from "../../../shared/config.js";
import { nowIso } from "../../../shared/utils/time.js";
import { tenantRateLimit } from "../../../shared/http/rate-limit.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import {
  parseJsonField,
  writeRepoCache,
  writeAnalysisCache,
  updateAnalysisCache,
  writeSensitiveCache,
  getLatestSuccessfulDeployId,
} from "../domain/cache.js";
import { requireConnection } from "./shared.js";

export async function registerAnalysisRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;
  const log = app.log;

  typed.get(
    "/git/connections/:connectionId/stack-analysis",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 20, windowMs: 60_000, prefix: "git-stack" })],
      handlerTimeout: 45_000,
      schema: {
        tags: ["git-integration"],
        summary: "Get stack analysis",
        params: z.object({ connectionId: z.uuid() }),
        querystring: z.object({
          owner: z.string(),
          repo: z.string(),
          branch: z.string().optional(),
          projectId: z.string().optional(),
        }),
        response: { 200: z.object({ stack: z.any().nullable(), cached: z.boolean() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const repoKey = `${request.query.owner}/${request.query.repo}`;
      const cached = await db.from("stack_cache").select("result").eq("repo", repoKey).eq("branch", branch).maybeSingle();
      if (cached.data?.result) {
        return { stack: parseJsonField(cached.data.result), cached: true };
      }

      const files = await getRepoFileTree(conn, { owner: request.query.owner, repo: request.query.repo, branch });
      const topDirs = new Map<string, number>();
      for (const file of files) {
        const top = file.split("/")[0];
        topDirs.set(top, (topDirs.get(top) ?? 0) + 1);
      }
      const components = Array.from(topDirs.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count], index) => ({
          id: `${index + 1}`,
          name,
          path: [name],
          tech: null,
          techs: [],
          languages: {},
          dependencies: [],
          edges: [],
          childs: [],
          fileCount: count,
        }));
      const stack = { components };
      await writeRepoCache("stack_cache", {
        tenantId: auth.tenantId,
        repoKey,
        branch,
        projectId: request.query.projectId,
        result: stack,
      }, log);
      return { stack, cached: false };
    },
  );

  typed.get(
    "/git/connections/:connectionId/sensitive-data",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "git-sensitive" })],
      handlerTimeout: 45_000,
      schema: {
        tags: ["git-integration"],
        summary: "Scan repository for sensitive schema fields",
        params: z.object({ connectionId: z.uuid() }),
        querystring: z.object({ owner: z.string(), repo: z.string(), branch: z.string().optional() }),
        response: { 200: z.object({ sensitiveData: z.array(z.any()) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const files = await getRepoFileTree(conn, { owner: request.query.owner, repo: request.query.repo, branch });
      const schemaFiles = files.filter((file) => /migrations?.*\.sql$|schema\.sql$/i.test(file)).slice(0, 40);
      const BATCH_SIZE = 8;
      const contents: string[] = [];
      for (let i = 0; i < schemaFiles.length; i += BATCH_SIZE) {
        const batch = schemaFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((file) => fetchRepoFile(conn, { owner: request.query.owner, repo: request.query.repo, branch }, file)),
        );
        for (const content of results) {
          if (content) contents.push(content);
        }
      }
      const schemaText = contents.join("\n");
      const analyzed = analyzeSensitiveDataFromText(schemaText);
      return {
        sensitiveData: analyzed.tables.flatMap((table) =>
          table.columns.map((column: any) => ({
            entity: table.name,
            field: column.name,
            sensitivity: column.category,
            reason: column.reason,
          })),
        ),
      };
    },
  );

  typed.post(
    "/git/analyze-sensitive-data",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "git-analyze-sensitive" })],
      schema: {
        tags: ["git-integration"],
        summary: "Analyze SQL schema with AI",
        body: z.object({ schema: z.string(), projectId: z.string().optional() }),
        response: {
          200: z.object({
            tables: z.array(z.any()),
            summary: z.object({
              totalTables: z.number(),
              highRiskTables: z.number(),
              criticalFindings: z.array(z.string()),
            }),
          }),
        },
      },
    },
    async (request) => {
      if (request.body.projectId && !request.body.schema.trim()) {
        const cached = await db.from("sensitive_cache").select("result").eq("project_id", request.body.projectId).maybeSingle();
        if (cached.data?.result) return parseJsonField(cached.data.result)!;
      }

      const result = analyzeSensitiveDataFromText(request.body.schema);
      if (request.body.projectId) {
        await writeSensitiveCache(request.body.projectId, result, log);
      }
      return result;
    },
  );

  typed.get(
    "/git/repo-badges",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 30, windowMs: 60_000, prefix: "git-badges" })],
      schema: {
        tags: ["git-integration"],
        summary: "Get technology badges",
        querystring: z.object({ repo: z.string(), branch: z.string().optional(), connectionId: z.string().optional() }),
        response: { 200: z.object({ badges: z.array(z.object({ name: z.string(), category: z.string(), confidence: z.number() })) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const branch = request.query.branch || "main";
      const repo = request.query.repo;

      const stackCached = await db.from("stack_cache").select("result").eq("repo", repo).eq("branch", branch).maybeSingle();
      if (stackCached.data?.result) {
        const parsed = parseJsonField<{ components?: Array<{ techs?: string[] }> }>(stackCached.data.result)!;
        const techSet = new Set<string>();
        for (const component of parsed.components ?? []) {
          for (const tech of component.techs ?? []) techSet.add(tech);
        }
        if (techSet.size > 0) {
          return {
            badges: Array.from(techSet).map((name) => ({ name, category: "framework", confidence: 90 })),
          };
        }
      }

      const analysisCached = await db.from("analysis_cache").select("result").eq("repo", repo).eq("branch", branch).maybeSingle();
      if (analysisCached.data?.result) {
        const parsed = parseJsonField<{ techStack?: Array<{ name: string; category: string; confidence: number }> }>(analysisCached.data.result)!;
        const techStack = parsed.techStack ?? [];
        const hasFramework = techStack.some((item) => item.category === "framework");
        if (techStack.length > 0 && (hasFramework || !request.query.connectionId)) {
          return {
            badges: techStack.map((item) => ({
              name: item.name,
              category: item.category,
              confidence: item.confidence,
            })),
          };
        }
      }

      if (request.query.connectionId) {
        const parts = repo.split("/").filter(Boolean);
        if (parts.length >= 2) {
          const owner = parts.slice(0, -1).join("/");
          const repoName = parts[parts.length - 1]!;
          const conn = await requireConnection(request.query.connectionId, auth.tenantId);
          const result = await runRepoAnalysis(conn, { owner, repo: repoName, branch });
          await writeAnalysisCache({
            tenantId: auth.tenantId,
            repoKey: repo,
            branch,
            result: result as unknown as Json,
          }, log);
          return {
            badges: result.techStack.map((item) => ({
              name: item.name,
              category: item.category,
              confidence: item.confidence,
            })),
          };
        }
      }

      return { badges: [] };
    },
  );

  typed.get(
    "/git/repo-favicon",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 30, windowMs: 60_000, prefix: "git-favicon" })],
      handlerTimeout: 45_000,
      schema: {
        tags: ["git-integration"],
        summary: "Get repository favicon from source files",
        querystring: z.object({
          repo: z.string(),
          branch: z.string().optional(),
          connectionId: z.string().optional(),
          rootDirectory: z.string().optional(),
          webDirectory: z.string().optional(),
        }),
        response: { 200: z.object({ favicon: z.string().nullable(), deployId: z.string().nullable() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const branch = request.query.branch || "main";
      const repo = request.query.repo;
      const directoryOptions = {
        rootDirectory: request.query.rootDirectory,
        webDirectory: request.query.webDirectory,
      };

      type FaviconCache = { repoFavicon?: RepoFaviconCacheEntry };
      const latestDeployId = await getLatestSuccessfulDeployId(repo, branch);
      const analysisCached = await db.from("analysis_cache").select("result").eq("repo", repo).eq("branch", branch).maybeSingle();
      const cachedResult = parseJsonField<FaviconCache>(analysisCached.data?.result);
      if (isRepoFaviconCacheValid(cachedResult?.repoFavicon, latestDeployId)) {
        const cachedUrl = cachedResult!.repoFavicon!.dataUrl;
        return {
          favicon: cachedUrl && isValidFaviconDataUrl(cachedUrl) ? cachedUrl : null,
          deployId: latestDeployId,
        };
      }

      if (!request.query.connectionId) {
        return { favicon: null, deployId: latestDeployId };
      }

      const parts = repo.split("/").filter(Boolean);
      if (parts.length < 2) {
        return { favicon: null, deployId: latestDeployId };
      }

      const owner = parts.slice(0, -1).join("/");
      const repoName = parts[parts.length - 1]!;
      const conn = await requireConnection(request.query.connectionId, auth.tenantId);
      const favicon = await resolveRepoFaviconDataUrl(
        conn,
        { owner, repo: repoName, branch },
        directoryOptions,
      );

      const mergedResult = {
        ...(cachedResult ?? {}),
        repoFavicon: {
          dataUrl: favicon,
          resolvedAt: nowIso(),
          deployId: latestDeployId,
          version: REPO_FAVICON_RESOLVER_VERSION,
        } satisfies RepoFaviconCacheEntry,
      };

      if (cachedResult) {
        await updateAnalysisCache(repo, branch, mergedResult as Json, log);
      } else {
        await writeAnalysisCache({
          tenantId: auth.tenantId,
          repoKey: repo,
          branch,
          result: mergedResult as Json,
        }, log);
      }

      // deployId is the same key the server cache invalidates on, so the client
      // can hold this favicon until the project's next successful deploy.
      return { favicon, deployId: latestDeployId };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repo-analyze",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "git-repo-analyze" })],
      handlerTimeout: 90_000,
      schema: {
        tags: ["git-integration"],
        summary: "Analyze repository stack and deploy options",
        params: z.object({ connectionId: z.uuid() }),
        querystring: z.object({
          owner: z.string(),
          repo: z.string(),
          branch: z.string().optional(),
          aiType: z.string().optional(),
          projectId: z.string().optional(),
        }),
        response: { 200: z.any() },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const repoKey = `${request.query.owner}/${request.query.repo}`;
      const cached = await db.from("analysis_cache").select("result").eq("repo", repoKey).eq("branch", branch).maybeSingle();
      if (cached.data?.result) {
        const parsed = parseJsonField<Record<string, unknown>>(cached.data.result)!;
        // If AI analysis was requested but cache doesn't have it, run AI and update cache
        if (request.query.aiType && env.OPENAI_API_KEY && !parsed.aiAnalysis) {
          const ref = { owner: request.query.owner, repo: request.query.repo, branch };
          const aiResult = await runAiAnalysisForRepo(
            conn,
            ref,
            (parsed.techStack as TechStackItem[]) ?? [],
            (parsed.detectedServices as DetectedService[]) ?? [],
          );
          if (aiResult) {
            const updated = { ...parsed, aiAnalysis: aiResult };
            await updateAnalysisCache(repoKey, branch, updated as unknown as Json, log);
            return updated;
          }
        }
        return parsed;
      }

      const result = await runRepoAnalysis(conn, {
        owner: request.query.owner,
        repo: request.query.repo,
        branch,
      });

      // Run AI analysis if requested and API key is available
      let aiAnalysis: Record<string, unknown> | undefined;
      if (request.query.aiType && env.OPENAI_API_KEY) {
        const ref = { owner: request.query.owner, repo: request.query.repo, branch };
        const aiResult = await runAiAnalysisForRepo(
          conn,
          ref,
          result.techStack,
          result.detectedServices,
        );
        if (aiResult) {
          aiAnalysis = aiResult as unknown as Record<string, unknown>;
        }
      }

      const finalResult = aiAnalysis ? { ...result, aiAnalysis } : result;

      await writeAnalysisCache({
        tenantId: auth.tenantId,
        repoKey,
        branch,
        projectId: request.query.projectId,
        result: finalResult as unknown as Json,
      }, log);
      return finalResult;
    },
  );

  typed.post(
    "/git/connections/:connectionId/create-mr",
    {
      preHandler: [app.requirePermission(PERMISSIONS.SCAN_CREATE_MR), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "git-create-mr" })],
      handlerTimeout: 90_000,
      schema: {
        tags: ["git-integration"],
        summary: "Create fix MR/PR",
        params: z.object({ connectionId: z.uuid() }),
        body: z.object({
          findingId: z.uuid().optional(),
          owner: z.string().optional(),
          repo: z.string().optional(),
          branch: z.string().optional(),
          filePath: z.string().optional(),
          startLine: z.number().optional(),
          endLine: z.number().optional(),
          ruleId: z.string().optional(),
          severity: z.string().optional(),
          message: z.string().optional(),
          snippet: z.string().optional(),
          aiType: z.string().optional(),
          aiConfig: z.record(z.string(), z.string()).optional(),
          assignee: z.string().optional(),
          reviewer: z.string().optional(),
        }),
        response: { 200: z.object({ mrUrl: z.string(), mrId: z.string(), mrTitle: z.string() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);

      let body = request.body;
      if (body.findingId) {
        const finding = await getFindingById(body.findingId, auth.tenantId);
        if (finding.connectionId !== conn.id) {
          throw app.httpErrors.badRequest("Finding belongs to a different git connection");
        }
        const { owner, repo } = parseRepoKey(finding.repo);
        body = {
          ...body,
          owner,
          repo,
          branch: finding.branch,
          filePath: finding.filePath,
          startLine: finding.startLine,
          endLine: finding.endLine,
          ruleId: finding.ruleId,
          severity: finding.severity,
          message: finding.message,
          snippet: finding.snippet,
          aiType: body.aiType ?? "openai",
        };
      }

      const required = ["owner", "repo", "branch", "filePath", "startLine", "endLine", "ruleId", "severity", "message"] as const;
      for (const key of required) {
        if (body[key] === undefined || body[key] === null || body[key] === "") {
          throw app.httpErrors.badRequest(`Missing required field: ${key}`);
        }
      }

      return await createMergeRequest(
        conn,
        {
          owner: body.owner!,
          repo: body.repo!,
          branch: body.branch!,
          filePath: body.filePath!,
          startLine: body.startLine!,
          endLine: body.endLine!,
          ruleId: body.ruleId!,
          severity: body.severity!,
          message: body.message!,
          snippet: body.snippet || "",
          aiType: body.aiType,
          assignee: body.assignee,
          reviewer: body.reviewer,
        },
        {
          openAiApiKey: env.OPENAI_API_KEY,
          openAiModel: env.OPENAI_MODEL,
        },
      );
    },
  );

  typed.post(
    "/git/ai/summarize-finding",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Summarize security finding for issue title",
        body: z.object({ severity: z.string(), message: z.string(), filePath: z.string(), snippet: z.string().optional() }),
        response: { 200: z.object({ title: z.string(), estimateMinutes: z.number().int().nonnegative() }) },
      },
    },
    async (request) => ({
      title: summarizeFindingTitle({
        severity: request.body.severity,
        message: request.body.message,
        filePath: request.body.filePath,
      }),
      estimateMinutes: estimateFixMinutes({
        severity: request.body.severity,
        snippet: request.body.snippet || "",
        startLine: 1,
        endLine: Math.max(1, (request.body.snippet || "").split("\n").length),
      }),
    }),
  );
}
