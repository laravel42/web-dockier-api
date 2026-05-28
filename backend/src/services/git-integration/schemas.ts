import { z } from "zod";

export { successResponseSchema } from "../../shared/schemas/responses.js";

export const providerSchema = z.enum(["github", "gitlab", "gitlab_self_hosted", "bitbucket"]);

export const connectionSchema = z.object({
  id: z.string().uuid(),
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
  connectionId: z.string().uuid(),
});
