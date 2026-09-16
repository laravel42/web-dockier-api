import { z } from "zod";

export { successResponseSchema } from "../../shared/schemas/responses.js";

export const providerSchema = z.enum(["github", "gitlab", "gitlab_self_hosted", "bitbucket"]);

export const connectionSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  label: z.string(),
  repoUrl: z.string(),
  endpoint: z.string(),
  createdAt: z.string(),
});

export const listConnectionsResponseSchema = z.object({
  connections: z.array(connectionSchema),
});

export const connectionIdParamsSchema = z.object({
  connectionId: z.uuid(),
});

/**
 * A generated AI fix plan for a Git issue.
 *
 * Shared between the `fix-issue/plan` response (what the model produced) and the
 * `fix-issue/apply` request body (the plan the client hands back to open the PR),
 * so the two endpoints stay in lockstep.
 */
export const fixIssuePlanSchema = z.object({
  summary: z.string(),
  prDescription: z.string(),
  branchName: z.string(),
  baseBranch: z.string(),
  issueNumber: z.number().int(),
  issueTitle: z.string(),
  files: z.array(z.object({ path: z.string(), before: z.string(), after: z.string() })),
});
