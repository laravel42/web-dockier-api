import { z } from "zod";

export const channelTypeSchema = z.enum(["email", "slack", "webhook", "in_app"]);

export const channelSchema = z.object({
  id: z.string().uuid(),
  type: channelTypeSchema,
  config: z.record(z.string(), z.string()),
  enabled: z.boolean(),
  createdAt: z.string(),
});

export const notificationSchema = z.object({
  id: z.string().uuid(),
  channel: z.string(),
  title: z.string(),
  message: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
});
