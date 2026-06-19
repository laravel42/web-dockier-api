/**
 * Repository operation routes: tree, file content, members, commits, pull, issues, stats.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { tenantRateLimit } from "../../../shared/rate-limit.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { fetchRepoFile, getRepoFileTree } from "../domain/provider-client.js";
import { getGitProvider, type RepoStats } from "../domain/git-provider.js";
import { parseJsonField, writeRepoCache } from "../domain/cache.js";
import { requireConnection, isPlaceholderStats, needsContributorProfileRefresh } from "./shared.js";

export async function registerRepositoryRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;
  const log = app.log;

  typed.post(
    "/git/connections/:connectionId/issues",
    {
      preHandler: [app.requirePermission(PERMISSIONS.SCAN_CREATE_ISSUE), tenantRateLimit({ max: 20, windowMs: 60_000, prefix: "git-issues" })],
      schema: {
        tags: ["git-integration"],
        summary: "Create Git issue",
        params: z.object({ connectionId: z.uuid() }),
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
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const provider = getGitProvider(conn);
      if (!provider.createIssue) {
        throw app.httpErrors.notImplemented(`Unsupported provider: ${conn.provider}`);
      }
      return await provider.createIssue({
        owner: request.body.owner,
        repo: request.body.repo,
        title: request.body.title,
        body: request.body.body,
        assignee: request.body.assignee,
      });
    },
  );

  typed.post(
    "/git/connections/:connectionId/pull",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Fetch latest commits as pull preview",
        params: z.object({ connectionId: z.uuid() }),
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
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.body.branch || "main";
      const log: string[] = [`$ git pull origin ${branch}`, `From ${conn.endpoint || "remote"}:${request.body.owner}/${request.body.repo}`];
      const commits = await getGitProvider(conn).listCommits({
        owner: request.body.owner,
        repo: request.body.repo,
        branch,
        limit: 10,
      });
      if (commits.length === 0 || (request.body.currentHash && commits[0].hash === request.body.currentHash)) {
        log.push("Already up to date.");
      } else {
        for (const commit of commits) log.push(`${commit.shortHash} ${commit.message}`);
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
        params: z.object({ connectionId: z.uuid() }),
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
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const branch = request.query.branch || "main";
      const limit = request.query.limit ?? 5;
      const commits = await getGitProvider(conn).listCommits({ owner: request.query.owner, repo: request.query.repo, branch, limit });
      return { commits };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repo-tree",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get repository file tree",
        params: z.object({ connectionId: z.uuid() }),
        querystring: z.object({ owner: z.string(), repo: z.string(), branch: z.string().optional() }),
        response: { 200: z.object({ files: z.array(z.object({ path: z.string(), type: z.enum(["file", "dir"]), size: z.number() })) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
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
        params: z.object({ connectionId: z.uuid() }),
        querystring: z.object({ owner: z.string(), repo: z.string(), branch: z.string(), path: z.string() }),
        response: { 200: z.object({ content: z.string() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
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
        params: z.object({ connectionId: z.uuid() }),
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
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const members = await getGitProvider(conn).listMembers({ owner: request.query.owner, repo: request.query.repo });
      return { members };
    },
  );

  typed.get(
    "/git/connections/:connectionId/repo-stats",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 20, windowMs: 60_000, prefix: "git-stats" })],
      schema: {
        tags: ["git-integration"],
        summary: "Get repository stats",
        params: z.object({ connectionId: z.uuid() }),
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
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);

      const repoKey = `${request.query.owner}/${request.query.repo}`;
      const branch = request.query.branch || "main";
      if (!request.query.refresh) {
        const cached = await db.from("stats_cache").select("result").eq("repo", repoKey).eq("branch", branch).maybeSingle();
        if (cached.data?.result) {
          const parsed = parseJsonField<RepoStats>(cached.data.result)!;
          if (!isPlaceholderStats(parsed) && !needsContributorProfileRefresh(parsed, conn.provider)) {
            return parsed;
          }
        }
      }

      const stats = await getGitProvider(conn).getRepoStats({
        owner: request.query.owner,
        repo: request.query.repo,
        branch,
      });

      if (!isPlaceholderStats(stats)) {
        await writeRepoCache("stats_cache", {
          tenantId: auth.tenantId,
          repoKey,
          branch,
          projectId: request.query.projectId,
          result: stats,
        }, log);
      }
      return stats;
    },
  );
}
