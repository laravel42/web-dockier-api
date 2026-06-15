import { z } from "zod";

export const buildStatusSchema = z.enum(["pending", "submitted", "in_progress", "succeeded", "failed", "stopped"]);

export type BuildStatus = z.infer<typeof buildStatusSchema>;

export const buildSchema = z.object({
  id: z.string().uuid(),
  codebuildId: z.string(),
  sourceRepo: z.string(),
  sourceRef: z.string(),
  commitSha: z.string(),
  imageUri: z.string(),
  status: buildStatusSchema,
  statusReason: z.string(),
  logsUrl: z.string(),
  tags: z.array(z.string()),
  buildMetadata: z.record(z.string(), z.string()),
  startedAt: z.string(),
  finishedAt: z.string(),
  createdAt: z.string(),
});

export const buildCredentialsSchema = z.object({
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  region: z.string(),
});
