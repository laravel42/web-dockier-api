/**
 * Git Push Webhook Route
 *
 * Receives push events from GitHub, GitLab, and Bitbucket.
 * Matches the push to projects with Push-to-Deploy enabled
 * and triggers new deployments automatically.
 *
 * Authentication: HMAC signature verification (same as AWS pipeline webhook)
 * OR a project-specific deploy token for simpler setups.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireWebhookSignature } from "../../../shared/http/security.js";
import { handleGitPushEvent, type GitPushEvent } from "../domain/push-to-deploy.js";
import { logger } from "../../../shared/logger.js";

export async function registerGitPushWebhookRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  /**
   * GitHub-style push webhook.
   *
   * GitHub sends: { ref: "refs/heads/main", repository: { full_name: "owner/repo" }, after: "sha" }
   * GitLab sends: { ref: "refs/heads/main", project: { path_with_namespace: "owner/repo" }, after: "sha" }
   * Bitbucket sends: { push: { changes: [{ new: { name: "main" } }] }, repository: { full_name: "owner/repo" } }
   *
   * This endpoint normalizes all three formats.
   */
  typed.post(
    "/deploy/webhook/git-push",
    {
      preHandler: requireWebhookSignature,
      schema: {
        tags: ["deploy"],
        summary: "Receive git push events for auto-deploy",
        body: z.object({}).passthrough(),
        response: { 200: z.object({ success: z.boolean(), triggered: z.number() }) },
      },
    },
    async (request) => {
      const body = request.body as Record<string, unknown>;

      const event = parseGitPushEvent(body);
      if (!event) {
        logger.debug({ body: Object.keys(body) }, "[git-push-webhook] Could not parse push event — ignoring");
        return { success: true, triggered: 0 };
      }

      const result = await handleGitPushEvent(event);
      return { success: true, triggered: result.triggered };
    },
  );

  /**
   * Project-specific deploy hook (token-based, no HMAC required).
   *
   * Simpler alternative for setups where configuring HMAC secrets on the
   * Git provider is cumbersome. The token is a short prefix of the project ID
   * (not cryptographically strong but sufficient for triggering a deploy).
   */
  typed.post(
    "/projects/:projectId/deploy/hook",
    {
      schema: {
        tags: ["deploy"],
        summary: "Trigger deploy via project-specific hook URL",
        params: z.object({ projectId: z.uuid() }),
        querystring: z.object({ token: z.string().min(1) }),
        response: { 200: z.object({ success: z.boolean(), message: z.string() }) },
      },
    },
    async (request) => {
      const { projectId } = request.params;
      const { token } = request.query;

      // Validate token matches the expected prefix
      const expectedToken = projectId.slice(0, 8);
      if (token !== expectedToken) {
        return { success: false, message: "Invalid deploy token" };
      }

      // Fetch project to get repo + branch info
      const { data: project, error } = await (await import("../../../shared/supabase/client.js")).supabaseAdmin
        .from("projects")
        .select("id, organization_id, repository, branch, connection_id, settings")
        .eq("id", projectId)
        .maybeSingle();

      if (error || !project) {
        return { success: false, message: "Project not found" };
      }

      // Check pushToDeploy is enabled
      const settings = project.settings as Record<string, unknown> | null;
      if (!settings?.pushToDeploy) {
        return { success: false, message: "Push to deploy is not enabled for this project" };
      }

      const result = await handleGitPushEvent({
        repository: project.repository,
        branch: project.branch,
      });

      return {
        success: result.triggered > 0,
        message: result.triggered > 0 ? "Deploy triggered" : "No deployment configuration found",
      };
    },
  );
}

// ─── Git Provider Payload Parsers ──────────────────────────────────

/**
 * Normalize push event payloads from GitHub, GitLab, and Bitbucket
 * into a common GitPushEvent shape.
 */
function parseGitPushEvent(body: Record<string, unknown>): GitPushEvent | null {
  // GitHub: { ref: "refs/heads/main", repository: { full_name }, after }
  if (body.ref && typeof body.ref === "string" && body.repository) {
    const repo = body.repository as Record<string, unknown>;
    const fullName = (repo.full_name as string) ?? "";
    const ref = body.ref as string;

    // Only process branch pushes, not tag pushes
    if (!ref.startsWith("refs/heads/")) return null;

    const branch = ref.replace("refs/heads/", "");
    return {
      repository: fullName,
      branch,
      commitSha: (body.after as string) ?? undefined,
      provider: "github",
    };
  }

  // GitLab: { ref: "refs/heads/main", project: { path_with_namespace }, after }
  if (body.ref && typeof body.ref === "string" && body.project) {
    const project = body.project as Record<string, unknown>;
    const fullName = (project.path_with_namespace as string) ?? "";
    const ref = body.ref as string;

    if (!ref.startsWith("refs/heads/")) return null;

    const branch = ref.replace("refs/heads/", "");
    return {
      repository: fullName,
      branch,
      commitSha: (body.after as string) ?? undefined,
      provider: "gitlab",
    };
  }

  // Bitbucket: { push: { changes: [{ new: { type: "branch", name } }] }, repository: { full_name } }
  if (body.push && body.repository) {
    const push = body.push as { changes?: Array<{ new?: { type?: string; name?: string; target?: { hash?: string } } }> };
    const repo = body.repository as Record<string, unknown>;
    const fullName = (repo.full_name as string) ?? "";

    const branchChange = push.changes?.find((c) => c.new?.type === "branch");
    if (!branchChange?.new?.name) return null;

    return {
      repository: fullName,
      branch: branchChange.new.name,
      commitSha: branchChange.new.target?.hash,
      provider: "bitbucket",
    };
  }

  return null;
}
