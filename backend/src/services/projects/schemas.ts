import { z } from "zod";
import { postDeployCommandSchema } from "../../shared/schemas/post-deploy.js";

export const projectConfigSchema = z.object({
  postDeployCommands: z.array(postDeployCommandSchema).max(20).optional(),
  overviewBlocks: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const projectSchema = z.object({
  id: z.uuid(),
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
