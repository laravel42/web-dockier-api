/**
 * Git connection CRUD and repo/branch listing routes.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth.js";
import { connectionIdParamsSchema, connectionSchema, listConnectionsResponseSchema, providerSchema, successResponseSchema } from "../schemas.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { requireInternalToken } from "../../../shared/security.js";
import { tenantRateLimit } from "../../../shared/rate-limit.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import {
  getConnection,
  createConnection,
  listConnections,
  deleteConnection,
  updateConnection,
  parseRepoUrl,
} from "../domain/connections.js";
import { listBranches, listRepos } from "../domain/providers/provider-client.js";
import { parseJsonField, writeRepoListCache } from "../domain/cache.js";
import { requireConnection } from "./shared.js";

export async function registerConnectionRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;
  const log = app.log;

  typed.post(
    "/git/connections",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["git-integration"],
        summary: "Add git connection",
        body: z.object({
          provider: providerSchema,
          personalToken: z.string().min(1).max(500),
          label: z.string().min(1).max(100),
          repoUrl: z.string().max(500).default(""),
          endpoint: z.string().max(500).default(""),
        }),
        response: { 200: connectionSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
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
      const auth = getAuth(request);
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
      const auth = getAuth(request);
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
        body: z.object({ label: z.string().min(1).max(100), personalToken: z.string().max(500).optional() }),
        response: { 200: connectionSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
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
      preHandler: [app.requirePermission(PERMISSIONS.CREDENTIAL_VIEW), tenantRateLimit({ max: 20, windowMs: 60_000, prefix: "git-repos" })],
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
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);

      const REPO_CACHE_TTL_MS = 10 * 60 * 1000;

      if (!request.query.refresh) {
        const cached = await db
          .from("repo_cache")
          .select("repos, created_at")
          .eq("connection_id", request.params.connectionId)
          .maybeSingle();
        if (cached.data?.repos) {
          const cachedAt = cached.data.created_at ? new Date(cached.data.created_at).getTime() : 0;
          const isFresh = cachedAt > 0 && Date.now() - cachedAt < REPO_CACHE_TTL_MS;
          if (isFresh) {
            return {
              repos: parseJsonField<Array<{ name: string; fullName: string; url: string; defaultBranch: string; private: boolean }>>(cached.data.repos)!,
              cached: true,
            };
          }
        }
      }

      const repos = await listRepos(conn);

      await writeRepoListCache(request.params.connectionId, auth.tenantId, repos, log);
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
        params: z.object({ connectionId: z.uuid() }),
        querystring: z.object({ owner: z.string().max(200), repo: z.string().max(200) }),
        response: { 200: z.object({ branches: z.array(z.string()) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
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
        params: z.object({ connectionId: z.uuid() }),
        response: { 200: z.object({ branches: z.array(z.string()) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const conn = await requireConnection(request.params.connectionId, auth.tenantId);
      if (!conn.repo_url) throw app.httpErrors.preconditionFailed("No repo URL configured");
      const parsed = parseRepoUrl(conn.repo_url);
      if (!parsed) throw app.httpErrors.badRequest("Could not parse owner/repo from URL");
      const branches = await listBranches(conn, { owner: parsed.owner, repo: parsed.repo, branch: "main" });
      return { branches };
    },
  );
}
