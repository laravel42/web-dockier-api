/**
 * Repository operation routes: tree, file content, members, commits, pull, issues, stats.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { tenantRateLimit } from "../../../shared/http/rate-limit.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { fetchRepoFile, getRepoFileTree } from "../domain/providers/provider-client.js";
import { getGitProvider, type RepoStats } from "../domain/providers/git-provider.js";
import { parseJsonField, writeRepoCache } from "../domain/cache.js";
import { requireConnection, isPlaceholderStats, needsContributorProfileRefresh } from "./shared.js";
import { planIssueFix, applyIssueFix, type FixIssuePlan } from "../domain/ai/fix-issue-ai.js";
import { generatePRReview, postPRReview } from "../domain/ai/review-pr-ai.js";
import { env } from "../../../shared/config.js";

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
    "/git/connections/:connectionId/open-issues",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get open issues",
        params: z.object({ connectionId: z.uuid() }),
        querystring: z.object({
          owner: z.string(),
          repo: z.string(),
          limit: z.coerce.number().int().positive().max(30).optional(),
        }),
        response: {
          200: z.object({
            issues: z.array(
              z.object({
                number: z.number(),
                title: z.string(),
                body: z.string(),
                url: z.string(),
                author: z.string(),
                authorAvatar: z.string(),
                createdAt: z.string(),
                comments: z.number(),
                labels: z.array(z.object({ name: z.string(), color: z.string() })),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const limit = request.query.limit ?? 10;
      const issues = await getGitProvider(conn).listIssues({ owner: request.query.owner, repo: request.query.repo, limit });
      return { issues };
    },
  );

  typed.get(
    "/git/connections/:connectionId/pull-requests",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW),
      schema: {
        tags: ["git-integration"],
        summary: "Get open pull/merge requests",
        params: z.object({ connectionId: z.uuid() }),
        querystring: z.object({
          owner: z.string(),
          repo: z.string(),
          limit: z.coerce.number().int().positive().max(30).optional(),
        }),
        response: {
          200: z.object({
            pullRequests: z.array(
              z.object({
                number: z.number(),
                title: z.string(),
                body: z.string(),
                url: z.string(),
                author: z.string(),
                authorAvatar: z.string(),
                createdAt: z.string(),
                draft: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const limit = request.query.limit ?? 10;
      const pullRequests = await getGitProvider(conn).listPullRequests({ owner: request.query.owner, repo: request.query.repo, limit });
      return { pullRequests };
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

  typed.patch(
    "/git/connections/:connectionId/issues/:issueNumber/close",
    {
      preHandler: [app.requirePermission(PERMISSIONS.SCAN_CREATE_ISSUE), tenantRateLimit({ max: 20, windowMs: 60_000, prefix: "git-close-issue" })],
      schema: {
        tags: ["git-integration"],
        summary: "Close a Git issue",
        params: z.object({ connectionId: z.uuid(), issueNumber: z.coerce.number().int() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
        }),
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const provider = getGitProvider(conn);
      if (!provider.closeIssue) {
        throw app.httpErrors.notImplemented(`Close issue not supported for provider: ${conn.provider}`);
      }
      await provider.closeIssue({
        owner: request.body.owner,
        repo: request.body.repo,
        issueNumber: request.params.issueNumber,
      });
      return { success: true };
    },
  );

  typed.post(
    "/git/connections/:connectionId/branches",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "git-create-branch" })],
      schema: {
        tags: ["git-integration"],
        summary: "Create a new branch from a base branch",
        params: z.object({ connectionId: z.uuid() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
          branchName: z.string().min(1),
          baseBranch: z.string().optional(),
        }),
        response: { 200: z.object({ ref: z.string(), sha: z.string() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      const provider = getGitProvider(conn);
      if (!provider.createBranch) {
        throw app.httpErrors.notImplemented(`Branch creation not supported for provider: ${conn.provider}`);
      }
      return await provider.createBranch({
        owner: request.body.owner,
        repo: request.body.repo,
        branchName: request.body.branchName,
        baseBranch: request.body.baseBranch,
      });
    },
  );

  typed.post(
    "/git/connections/:connectionId/fix-issue/plan",
    {
      preHandler: [app.requirePermission(PERMISSIONS.SCAN_CREATE_ISSUE), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "git-fix-issue" })],
      schema: {
        tags: ["git-integration"],
        summary: "Fix a Git issue using AI (creates branch, commits fix, opens PR)",
        params: z.object({ connectionId: z.uuid() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
          baseBranch: z.string().default("main"),
          issueNumber: z.number().int(),
          issueTitle: z.string().min(1),
          issueBody: z.string().default(""),
        }),
        response: {
          200: z.object({
  summary: z.string(),
  prDescription: z.string(),
  branchName: z.string(),
  baseBranch: z.string(),
  issueNumber: z.number().int(),
  issueTitle: z.string(),
  files: z.array(z.object({ path: z.string(), before: z.string(), after: z.string() })),
}),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);

      if (!env.OPENAI_API_KEY) {
        throw app.httpErrors.serviceUnavailable("AI is not configured on this server");
      }

      try {
        return await planIssueFix(conn, {
          owner: request.body.owner,
          repo: request.body.repo,
          baseBranch: request.body.baseBranch,
          issueNumber: request.body.issueNumber,
          issueTitle: request.body.issueTitle,
          issueBody: request.body.issueBody,
        }, env.OPENAI_API_KEY, env.OPENAI_MODEL);
      } catch (err: unknown) {
        request.log.error({ err }, "[AI-FixIssue] Pipeline failed");
        const message = err instanceof Error ? err.message : "AI fix pipeline failed";
        throw app.httpErrors.badRequest(message);
      }
    },
  );


  typed.post(
    "/git/connections/:connectionId/fix-issue/apply",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "git-fix-apply" })],
      schema: {
        tags: ["git-integration"],
        summary: "Open a pull request from a previously generated fix plan",
        params: z.object({ connectionId: z.uuid() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
          plan: z.object({
  summary: z.string(),
  prDescription: z.string(),
  branchName: z.string(),
  baseBranch: z.string(),
  issueNumber: z.number().int(),
  issueTitle: z.string(),
  files: z.array(z.object({ path: z.string(), before: z.string(), after: z.string() })),
}),
        }),
        response: {
          200: z.object({
            prUrl: z.string(),
            prNumber: z.number(),
            branchName: z.string(),
            filesChanged: z.number(),
            summary: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      try {
        return await applyIssueFix(conn, request.body.owner, request.body.repo, request.body.plan as FixIssuePlan);
      } catch (err: unknown) {
        request.log.error({ err }, "[AI-FixIssue] Apply failed");
        throw app.httpErrors.badRequest(err instanceof Error ? err.message : "Failed to open the pull request");
      }
    },
  );


  typed.post(
    "/git/connections/:connectionId/review-pr/generate",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "git-review-pr" })],
      schema: {
        tags: ["git-integration"],
        summary: "Generate review comments for a pull request. Posts nothing.",
        params: z.object({ connectionId: z.uuid() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
          prNumber: z.number().int(),
          prTitle: z.string().min(1),
          prBody: z.string().default(""),
        }),
        response: {
          200: z.object({
            summary: z.string(),
            comments: z.array(z.object({
              path: z.string(),
              line: z.number(),
              body: z.string(),
              severity: z.enum(["critical", "warning", "suggestion", "praise"]),
            })),
            approved: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);

      if (!env.OPENAI_API_KEY) {
        throw app.httpErrors.serviceUnavailable("AI is not configured on this server");
      }

      try {
        return await generatePRReview(conn, {
          owner: request.body.owner,
          repo: request.body.repo,
          prNumber: request.body.prNumber,
          prTitle: request.body.prTitle,
          prBody: request.body.prBody,
        }, env.OPENAI_API_KEY, env.OPENAI_MODEL);
      } catch (err: unknown) {
        request.log.error({ err }, "[AI-ReviewPR] Pipeline failed");
        const message = err instanceof Error ? err.message : "AI review pipeline failed";
        throw app.httpErrors.badRequest(message);
      }
    },
  );


  typed.post(
    "/git/connections/:connectionId/review-pr/post",
    {
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "git-review-post" })],
      schema: {
        tags: ["git-integration"],
        summary: "Post an approved set of review comments to a pull request",
        params: z.object({ connectionId: z.uuid() }),
        body: z.object({
          owner: z.string(),
          repo: z.string(),
          prNumber: z.number().int(),
          summary: z.string(),
          approved: z.boolean(),
          comments: z.array(z.object({
            path: z.string(),
            line: z.number(),
            body: z.string(),
            severity: z.enum(["critical", "warning", "suggestion", "praise"]),
          })),
        }),
        response: { 200: z.object({ reviewUrl: z.string() }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      try {
        return await postPRReview(
          conn, request.body.owner, request.body.repo, request.body.prNumber,
          request.body.summary, request.body.comments, request.body.approved,
        );
      } catch (err: unknown) {
        request.log.error({ err }, "[AI-ReviewPR] Post failed");
        throw app.httpErrors.badRequest(err instanceof Error ? err.message : "Failed to post the review");
      }
    },
  );
}
