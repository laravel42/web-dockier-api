import { z } from "zod";

export const channelTypeSchema = z.enum(["email", "slack", "webhook", "in_app"]);

export const channelSchema = z.object({
  id: z.uuid(),
  type: channelTypeSchema,
  config: z.record(z.string(), z.string()),
  enabled: z.boolean(),
  createdAt: z.string(),
});

export const notificationDeployMetadataSchema = z.object({
  kind: z.literal("deploy"),
  repo: z.string(),
  branch: z.string(),
  commit: z.string().optional(),
  appUrl: z.string().optional(),
  deployId: z.uuid().optional(),
});

export const notificationScanMetadataSchema = z.object({
  kind: z.literal("scan"),
  repo: z.string(),
  branch: z.string(),
  commit: z.string().optional(),
  projectId: z.uuid().optional(),
  scanId: z.uuid().optional(),
  summary: z.object({
    errors: z.number(),
    warnings: z.number(),
    infos: z.number(),
    totalFindings: z.number().optional(),
  }),
});

export const notificationMetadataSchema = z.discriminatedUnion("kind", [
  notificationDeployMetadataSchema,
  notificationScanMetadataSchema,
]);

export type NotificationMetadata = z.infer<typeof notificationMetadataSchema>;

export const notificationSchema = z.object({
  id: z.uuid(),
  channel: z.string(),
  title: z.string(),
  message: z.string(),
  metadata: notificationMetadataSchema.nullable().optional(),
  read: z.boolean(),
  createdAt: z.string(),
});

// ─── Response Schemas ──────────────────────────────────────────────

import { paginationMetaSchema } from "../../shared/schemas/responses.js";

export const listChannelsResponseSchema = z.object({
  channels: z.array(channelSchema),
});

export const sendNotificationResponseSchema = z.object({
  sent: z.number().int().nonnegative(),
});

export const listNotificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  pagination: paginationMetaSchema,
});
