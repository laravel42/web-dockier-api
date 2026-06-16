import { z } from "zod";
import { postDeployCommandSchema } from "../../shared/schemas/post-deploy.js";

export const projectConfigSchema = z.object({
  postDeployCommands: z.array(postDeployCommandSchema).max(20).optional(),
});

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  repository: z.string(),
  branch: z.string(),
  connectionId: z.string(),
  platform: z.string(),
  sourceType: z.string(),
  template: z.string(),
  config: projectConfigSchema,
  lastCommitHash: z.string(),
  createdAt: z.string(),
});
