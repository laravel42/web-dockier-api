import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { connectionIdParamsSchema, connectionSchema, listConnectionsResponseSchema, providerSchema, successResponseSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import type { Database } from "../../shared/supabase/types.js";
import { analyzeSensitiveDataFromText, runRepoAnalysis } from "./domain/analysis.js";
import { fetchRepoFile, getRepoFileTree, listBranches, listRepos } from "./domain/provider-client.js";
import { createMergeRequest, estimateFixMinutes, summarizeFindingTitle } from "./domain/mr-generator.js";
import { analyzeWithAI, CONFIG_FILES_TO_FETCH as AI_CONFIG_FILES } from "./domain/ai-analysis.js";
import { env } from "../../shared/config.js";
import { requireInternalToken } from "../../shared/security.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import {
  getConnection,
  getConnectionForTenant,
  createConnection,
  listConnections,
  deleteConnection,
  updateConnection,
  parseRepoUrl,
} from "./domain/connections.js";
import {
  GitHubApiError,
  listCommits as ghListCommits,
  getRepoInfo as ghGetRepoInfo,
  getLanguages as ghGetLanguages,
  getContributors as ghGetContributors,
  getCollaborators as ghGetCollaborators,
  createIssue as ghCreateIssue,
} from "./domain/github-client.js";

function throwProviderError(app: FastifyInstance, error: unknown): never {
  if (error instanceof GitHubApiError) {
    throw app.httpErrors.badRequest(`GitHub API error ${error.status}: ${error.statusText}`);
  }
  throw app.httpErrors.badRequest((error as Error).message);
}

export async function registerGitIntegrationRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;

  /**
   * Get connection for tenant, letting domain errors propagate to the global handler.
   */
  async function requireConnection(connectionId: string, tenantId: string) {
    return await getConnectionForTenant(connectionId, tenantId);
  }

  typed.post(
    "/git/connections",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["git-integration"],
        summary: "Add git connection",
        body: z.object({
          provider: providerSchema,
          personalToken: z.string().min(1),
          label: z.string().min(1),
          repoUrl: z.string().default(""),
          endpoint: z.string().default(""),
        }),
        response: { 200: connectionSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await createConnection({
        tenantId: auth.tenantId,
        provider: request.body.provider,
        personalToken: request.body.personalToken,
        label: request.body.label,
        repoUrl: request.body.repoUrl,
        endpoint: request.body.endpoint,
      });
    },
  );

  typed.get(
    "/git/connections",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "List git connections",
        response: { 200: listConnectionsResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const connections = await listConnections(auth.tenantId);
      return { connections };
    },
  );

  typed.delete(
    "/git/connections/:connectionId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["git-integration"],
        summary: "Delete git connection",
        params: connectionIdParamsSchema,
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      await deleteConnection(request.params.connectionId, auth.tenantId);
      return { success: true as const };
    },
  );

  typed.put(
    "/git/connections/:connectionId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["git-integration"],
        summary: "Update git connection",
        params: connectionIdParamsSchema,
        body: z.object({ label: z.string().min(1), personalToken: z.string().optional() }),
        response: { 200: connectionSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      return await updateConnection({
        connectionId: request.params.connectionId,
        tenantId: auth.tenantId,
        label: request.body.label,
        personalToken: request.body.personalToken,
      });
    },
  );

  typed.get(
    "/git/connections/:connectionId/scan-auth",
    {
      preHandler: requireInternalToken,
      schema: {
        tags: ["git-integration"],
        summary: "Get connection token for scanning (internal)",
        params: connectionIdParamsSchema,
        response: { 200: z.object({ provider: z.string(), token: z.string(), endpoint: z.string() }) },
      },
    },
    async (request) => {
      const conn = await getConnection(request.params.connectionId);
      return { provider: conn.provider, token: conn.personal_token, endpoint: conn.endpoint ?? "" };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repos",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "List repos for connection",
        params: connectionIdParamsSchema,
        querystring: z.object({ refresh: z.coerce.boolean().optional() }),
        response: {
          200: z.object({
            repos: z.array(
              z.object({
                name: z.string(),
                fullName: z.string(),
                url: z.string(),
                defaultBranch: z.string(),
                private: z.boolean(),
              }),
            ),
            cached: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);

      if (!request.query.refresh) {
        const cached = await db.from("repo_cache").select("repos").eq("connection_id", request.params.connectionId).maybeSingle();
        if (cached.data?.repos) {
          return { repos: typeof cached.data.repos === "string" ? JSON.parse(cached.data.repos) : cached.data.repos, cached: true };
        }
      }

      let repos: Array<{ name: string; fullName: string; url: string; defaultBranch: string; private: boolean }>;
      try {
        repos = await listRepos(conn);
      } catch (error) {
        throw app.httpErrors.badRequest((error as Error).message);
      }

      await db.from("repo_cache").upsert(
        {
          id: request.params.connectionId,
          connection_id: request.params.connectionId,
          organization_id: auth.tenantId,
          repos,
          created_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );
      return { repos, cached: false };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repo-branches",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "List branches for owner/repo",
        params: z.object({ connectionId: z.string().uuid() }),
        querystring: z.object({ owner: z.string(), repo: z.string() }),
        response: { 200: z.object({ branches: z.array(z.string()) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branches = await listBranches(conn, { owner: request.query.owner, repo: request.query.repo, branch: "main" });
      return { branches };
    },
  );

  typed.get(
    "/git/connections/:connectionId/branches",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "List branches for configured repo URL",
        params: z.object({ connectionId: z.string().uuid() }),
        response: { 200: z.object({ branches: z.array(z.string()) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      if (!conn.repo_url) throw app.httpErrors.preconditionFailed("No repo URL configured");
      const parsed = parseRepoUrl(conn.repo_url);
      if (!parsed) throw app.httpErrors.badRequest("Could not parse owner/repo from URL");
      const branches = await listBranches(conn, { owner: parsed.owner, repo: parsed.repo, branch: "main" });
      return { branches };
    },
  );

  app.delete(
    "/git/stats-cache",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Invalidate stats cache",
        querystring: z.object({ repo: z.string(), branch: z.string().optional() }),
        response: { 200: z.object({ done: z.literal(true) }) },
      },
    },
    async (request: any) => {
      const auth = request.auth!;
      const query = request.query as { repo: string; branch?: string };
      let del = db.from("stats_cache").delete().eq("organization_id", auth.tenantId).eq("repo", query.repo);
      if (query.branch) del = del.eq("branch", query.branch);
      await del;
      return { done: true as const };
    },
  );

  app.delete(
    "/git/stack-cache",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Invalidate stack cache",
        querystring: z.object({ repo: z.string(), branch: z.string().optional() }),
        response: { 200: z.object({ done: z.literal(true) }) },
      },
    },
    async (request: any) => {
      const auth = request.auth!;
      const query = request.query as { repo: string; branch?: string };
      let del = db.from("stack_cache").delete().eq("organization_id", auth.tenantId).eq("repo", query.repo);
      if (query.branch) del = del.eq("branch", query.branch);
      await del;
      return { done: true as const };
    },
  );

  app.delete(
    "/git/analysis-cache",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Invalidate analysis cache",
        querystring: z.object({ repo: z.string().optional(), branch: z.string().optional() }),
        response: { 200: z.object({ deleted: z.literal(true) }) },
      },
    },
    async (request: any) => {
      const auth = request.auth!;
      let del = db.from("analysis_cache").delete().eq("organization_id", auth.tenantId);
      if (request.query.repo) del = del.eq("repo", request.query.repo);
      if (request.query.branch) del = del.eq("branch", request.query.branch);
      await del;
      return { deleted: true as const };
    },
  );

  typed.post(
    "/git/connections/:connectionId/issues",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_CREATE_ISSUE),
      schema: {
        tags: ["git-integration"],
        summary: "Create Git issue",
        params: z.object({ connectionId: z.string().uuid() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
          title: z.string().min(1),
          body: z.string().default(""),
          assignee: z.string().optional(),
        }),
        response: { 200: z.object({ issueId: z.string(), issueUrl: z.string(), issueNumber: z.number().int() }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      if (conn.provider === "github") {
        try {
          return await ghCreateIssue(conn, {
            owner: request.body.owner,
            repo: request.body.repo,
            title: request.body.title,
            body: request.body.body,
            assignee: request.body.assignee,
          });
        } catch (error) {
          throwProviderError(app, error);
        }
      }
      throw app.httpErrors.notImplemented(`Unsupported provider: ${conn.provider}`);
    },
  );

  typed.post(
    "/git/connections/:connectionId/pull",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Fetch latest commits as pull preview",
        params: z.object({ connectionId: z.string().uuid() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
          branch: z.string().default("main"),
          currentHash: z.string().optional(),
        }),
        response: { 200: z.object({ log: z.array(z.string()) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.body.branch || "main";
      const log: string[] = [`$ git pull origin ${branch}`, `From ${conn.endpoint || "remote"}:${request.body.owner}/${request.body.repo}`];
      if (conn.provider === "github") {
        try {
          const commits = await ghListCommits(conn, { owner: request.body.owner, repo: request.body.repo, branch, limit: 10 });
          if (commits.length === 0 || (request.body.currentHash && commits[0].hash === request.body.currentHash)) {
            log.push("Already up to date.");
          } else {
            for (const commit of commits) log.push(`${commit.shortHash} ${commit.message}`);
          }
        } catch (error) {
          throwProviderError(app, error);
        }
      }
      return { log };
    },
  );

  typed.get(
    "/git/connections/:connectionId/recent-commits",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get recent commits",
        params: z.object({ connectionId: z.string().uuid() }),
        querystring: z.object({
          owner: z.string(),
          repo: z.string(),
          branch: z.string().optional(),
          limit: z.coerce.number().int().positive().max(20).optional(),
        }),
        response: {
          200: z.object({
            commits: z.array(
              z.object({
                hash: z.string(),
                shortHash: z.string(),
                message: z.string(),
                author: z.string(),
                authorAvatar: z.string(),
                date: z.string(),
                url: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const limit = request.query.limit ?? 5;
      if (conn.provider === "github") {
        try {
          const commits = await ghListCommits(conn, { owner: request.query.owner, repo: request.query.repo, branch, limit });
          return { commits };
        } catch (error) {
          throwProviderError(app, error);
        }
      }
      return { commits: [] };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repo-tree",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get repository file tree",
        params: z.object({ connectionId: z.string().uuid() }),
        querystring: z.object({ owner: z.string(), repo: z.string(), branch: z.string().optional() }),
        response: { 200: z.object({ files: z.array(z.object({ path: z.string(), type: z.enum(["file", "dir"]), size: z.number() })) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const tree = await getRepoFileTree(conn, { owner: request.query.owner, repo: request.query.repo, branch });
      const files = tree.map((path) => ({ path, type: "file" as const, size: 0 }));
      return { files };
    },
  );

  typed.get(
    "/git/connections/:connectionId/file-content",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get file content from repository",
        params: z.object({ connectionId: z.string().uuid() }),
        querystring: z.object({ owner: z.string(), repo: z.string(), branch: z.string(), path: z.string() }),
        response: { 200: z.object({ content: z.string() }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const content = await fetchRepoFile(conn, request.query, request.query.path);
      if (content === null) throw app.httpErrors.notFound("File not found in repository");
      return { content };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repo-members",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "List repo members",
        params: z.object({ connectionId: z.string().uuid() }),
        querystring: z.object({ owner: z.string(), repo: z.string() }),
        response: {
          200: z.object({
            members: z.array(
              z.object({ id: z.string(), username: z.string(), name: z.string(), avatarUrl: z.string() }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      if (conn.provider === "github") {
        const members = await ghGetCollaborators(conn, { owner: request.query.owner, repo: request.query.repo });
        return { members };
      }
      return { members: [] };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repo-stats",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get repository stats",
        params: z.object({ connectionId: z.string().uuid() }),
        querystring: z.object({
          owner: z.string(),
          repo: z.string(),
          branch: z.string().optional(),
          refresh: z.coerce.boolean().optional(),
          projectId: z.string().optional(),
        }),
        response: {
          200: z.object({
            stars: z.number(),
            forks: z.number(),
            openIssues: z.number(),
            watchers: z.number(),
            language: z.string(),
            languages: z.record(z.string(), z.number()),
            lastCommitDate: z.string(),
            lastCommitMessage: z.string(),
            lastCommitAuthor: z.string(),
            lastCommitHash: z.string(),
            totalCommits: z.number(),
            contributors: z.number(),
            topContributors: z.array(
              z.object({ name: z.string(), avatarUrl: z.string(), commits: z.number(), profileUrl: z.string() }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);

      const repoKey = `${request.query.owner}/${request.query.repo}`;
      const branch = request.query.branch || "main";
      if (!request.query.refresh) {
        const cached = await db.from("stats_cache").select("result").eq("repo", repoKey).eq("branch", branch).maybeSingle();
        if (cached.data?.result) return typeof cached.data.result === "string" ? JSON.parse(cached.data.result) : cached.data.result;
      }

      const stats = {
        stars: 0,
        forks: 0,
        openIssues: 0,
        watchers: 0,
        language: "",
        languages: {} as Record<string, number>,
        lastCommitDate: "",
        lastCommitMessage: "",
        lastCommitAuthor: "",
        lastCommitHash: "",
        totalCommits: 0,
        contributors: 0,
        topContributors: [] as Array<{ name: string; avatarUrl: string; commits: number; profileUrl: string }>,
      };

      if (conn.provider === "github") {
        const [owner, repo] = repoKey.split("/");
        const [repoInfo, commits, contributors, languages] = await Promise.all([
          ghGetRepoInfo(conn, { owner, repo }),
          ghListCommits(conn, { owner, repo, branch, limit: 20 }).catch(() => [] as any[]),
          ghGetContributors(conn, { owner, repo, limit: 20 }),
          ghGetLanguages(conn, { owner, repo }),
        ]);

        stats.stars = repoInfo.stars;
        stats.forks = repoInfo.forks;
        stats.openIssues = repoInfo.openIssues;
        stats.watchers = repoInfo.watchers;
        stats.language = repoInfo.language;
        stats.languages = languages;

        if (commits.length > 0) {
          const latest = commits[0];
          stats.lastCommitDate = latest.date;
          stats.lastCommitMessage = latest.message;
          stats.lastCommitAuthor = latest.author;
          stats.lastCommitHash = latest.hash;
          stats.totalCommits = commits.length;
        }

        stats.contributors = contributors.length;
        stats.topContributors = contributors;
      }

      await db.from("stats_cache").upsert(
        {
          id: auth.tenantId + ":" + repoKey + ":" + branch,
          repo: repoKey,
          branch,
          result: stats,
          created_at: new Date().toISOString(),
          organization_id: auth.tenantId,
          project_id: request.query.projectId ?? "",
        },
        { onConflict: "organization_id,repo,branch" },
      );
      return stats;
    },
  );

  typed.get(
    "/git/connections/:connectionId/stack-analysis",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get stack analysis",
        params: z.object({ connectionId: z.string().uuid() }),
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
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const repoKey = `${request.query.owner}/${request.query.repo}`;
      const cached = await db.from("stack_cache").select("result").eq("repo", repoKey).eq("branch", branch).maybeSingle();
      if (cached.data?.result) {
        return { stack: typeof cached.data.result === "string" ? JSON.parse(cached.data.result) : cached.data.result, cached: true };
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
      await db.from("stack_cache").upsert(
        {
          id: auth.tenantId + ":" + repoKey + ":" + branch,
          repo: repoKey,
          branch,
          result: stack,
          created_at: new Date().toISOString(),
          organization_id: auth.tenantId,
          project_id: request.query.projectId ?? "",
        },
        { onConflict: "organization_id,repo,branch" },
      );
      return { stack, cached: false };
    },
  );

  typed.get(
    "/git/connections/:connectionId/sensitive-data",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Scan repository for sensitive schema fields",
        params: z.object({ connectionId: z.string().uuid() }),
        querystring: z.object({ owner: z.string(), repo: z.string(), branch: z.string().optional() }),
        response: { 200: z.object({ sensitiveData: z.array(z.any()) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const files = await getRepoFileTree(conn, { owner: request.query.owner, repo: request.query.repo, branch });
      const schemaFiles = files.filter((file) => /migrations?.*\.sql$|schema\.sql$/i.test(file)).slice(0, 40);
      let schemaText = "";
      for (const file of schemaFiles) {
        const content = await fetchRepoFile(conn, { owner: request.query.owner, repo: request.query.repo, branch }, file);
        if (content) schemaText += `${content}\n`;
      }
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
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
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
        if (cached.data?.result) return typeof cached.data.result === "string" ? JSON.parse(cached.data.result) : cached.data.result;
      }

      const result = analyzeSensitiveDataFromText(request.body.schema);
      if (request.body.projectId) {
        await db.from("sensitive_cache").upsert(
          {
            id: request.body.projectId,
            project_id: request.body.projectId,
            result,
            created_at: new Date().toISOString(),
          },
          { onConflict: "project_id" },
        );
      }
      return result;
    },
  );

  typed.get(
    "/git/repo-badges",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get technology badges",
        querystring: z.object({ repo: z.string(), branch: z.string().optional(), connectionId: z.string().optional() }),
        response: { 200: z.object({ badges: z.array(z.object({ name: z.string(), category: z.string(), confidence: z.number() })) }) },
      },
    },
    async (request) => {
      const branch = request.query.branch || "main";
      const cached = await db.from("stack_cache").select("result").eq("repo", request.query.repo).eq("branch", branch).maybeSingle();
      if (!cached.data?.result) return { badges: [] };
      const parsed = typeof cached.data.result === "string" ? JSON.parse(cached.data.result) : cached.data.result;
      const techSet = new Set<string>();
      for (const component of parsed.components ?? []) {
        for (const tech of component.techs ?? []) techSet.add(tech);
      }
      return {
        badges: Array.from(techSet).map((name) => ({ name, category: "framework", confidence: 90 })),
      };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repo-analyze",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Analyze repository stack and deploy options",
        params: z.object({ connectionId: z.string().uuid() }),
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
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const repoKey = `${request.query.owner}/${request.query.repo}`;
      const cached = await db.from("analysis_cache").select("result").eq("repo", repoKey).eq("branch", branch).maybeSingle();
      if (cached.data?.result) {
        const parsed = typeof cached.data.result === "string" ? JSON.parse(cached.data.result) : cached.data.result;
        // If AI analysis was requested but cache doesn't have it, run AI and update cache
        if (request.query.aiType && env.OPENAI_API_KEY && !parsed.aiAnalysis) {
          const ref = { owner: request.query.owner, repo: request.query.repo, branch };
          const files = await getRepoFileTree(conn, ref);
          const configContents: Record<string, string> = {};
          for (const candidate of AI_CONFIG_FILES) {
            const path = files.find((f) => f.toLowerCase().endsWith(candidate.toLowerCase()));
            if (!path) continue;
            const content = await fetchRepoFile(conn, ref, path);
            if (content) configContents[path] = content;
          }
          const aiResult = await analyzeWithAI(
            env.OPENAI_API_KEY,
            files,
            configContents,
            parsed.techStack ?? [],
            parsed.detectedServices ?? [],
          );
          if (aiResult) {
            const updated = { ...parsed, aiAnalysis: aiResult };
            await db.from("analysis_cache").update({ result: updated }).eq("repo", repoKey).eq("branch", branch);
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
        const files = await getRepoFileTree(conn, ref);
        const configContents: Record<string, string> = {};
        for (const candidate of AI_CONFIG_FILES) {
          const path = files.find((f) => f.toLowerCase().endsWith(candidate.toLowerCase()));
          if (!path) continue;
          const content = await fetchRepoFile(conn, ref, path);
          if (content) configContents[path] = content;
        }
        const aiResult = await analyzeWithAI(
          env.OPENAI_API_KEY,
          files,
          configContents,
          result.techStack,
          result.detectedServices,
        );
        if (aiResult) {
          aiAnalysis = aiResult as unknown as Record<string, unknown>;
        }
      }

      const finalResult = aiAnalysis ? { ...result, aiAnalysis } : result;

      await db.from("analysis_cache").upsert(
        {
          id: auth.tenantId + ":" + repoKey + ":" + branch,
          repo: repoKey,
          branch,
          commit_sha: "",
          result: finalResult as unknown as Database["public"]["Tables"]["analysis_cache"]["Row"]["result"],
          created_at: new Date().toISOString(),
          organization_id: auth.tenantId,
          project_id: request.query.projectId ?? "",
        },
        { onConflict: "organization_id,repo,branch" },
      );
      return finalResult;
    },
  );

  typed.post(
    "/git/connections/:connectionId/create-mr",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_CREATE_MR),
      schema: {
        tags: ["git-integration"],
        summary: "Create fix MR/PR",
        params: z.object({ connectionId: z.string().uuid() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
          branch: z.string(),
          filePath: z.string(),
          startLine: z.number(),
          endLine: z.number(),
          ruleId: z.string(),
          severity: z.string(),
          message: z.string(),
          snippet: z.string(),
          aiType: z.string().optional(),
          aiConfig: z.record(z.string(), z.string()).optional(),
          assignee: z.string().optional(),
          reviewer: z.string().optional(),
        }),
        response: { 200: z.object({ mrUrl: z.string(), mrId: z.string(), mrTitle: z.string() }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      try {
        return await createMergeRequest(conn, request.body);
      } catch (error) {
        throw app.httpErrors.badRequest((error as Error).message);
      }
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
