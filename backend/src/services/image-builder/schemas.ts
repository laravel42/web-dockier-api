import { z } from "zod";
import { buildMetadataSchema } from "./domain/deploy-params.js";

export const buildStatusSchema = z.enum(["pending", "submitted", "in_progress", "succeeded", "failed", "stopped"]);

export type BuildStatus = z.infer<typeof buildStatusSchema>;

export const buildSchema = z.object({
  id: z.uuid(),
  codebuildId: z.string(),
  sourceRepo: z.string(),
  sourceRef: z.string(),
  commitSha: z.string(),
  imageUri: z.string(),
  status: buildStatusSchema,
  statusReason: z.string(),
  logsUrl: z.string(),
  tags: z.array(z.string()),
  buildMetadata: buildMetadataSchema,
  startedAt: z.string(),
  finishedAt: z.string(),
  createdAt: z.string(),
});

export const buildCredentialsSchema = z.object({
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  region: z.string(),
});

// ─── Response Schemas ──────────────────────────────────────────────

export const buildLogsResponseSchema = z.object({
  buildId: z.uuid(),
  logs: z.array(z.string()),
  nextToken: z.string().optional(),
});

export const imageRevisionResponseSchema = z.object({
  imageUri: z.string(),
  buildId: z.uuid(),
  commitSha: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

export const deployStatusResponseSchema = z.object({
  status: z.string(),
  appUrl: z.string(),
  stackName: z.string(),
});
