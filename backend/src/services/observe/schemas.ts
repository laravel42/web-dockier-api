import { z } from "zod";

// ─── Heartbeats ───

export const heartbeatFrequencySchema = z.enum([
  "every_minute",
  "every_5_minutes",
  "every_10_minutes",
  "every_15_minutes",
  "every_30_minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "custom",
]);

export const heartbeatGracePeriodSchema = z.enum([
  "after_1_minute",
  "after_5_minutes",
  "after_10_minutes",
  "after_15_minutes",
  "after_30_minutes",
  "after_1_hour",
]);

export const heartbeatStatusSchema = z.enum(["healthy", "missed", "waiting"]);

export const heartbeatSchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  name: z.string(),
  frequency: heartbeatFrequencySchema,
  gracePeriod: heartbeatGracePeriodSchema,
  status: heartbeatStatusSchema,
  lastPingedAt: z.string().nullable(),
  pingUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type HeartbeatRow = {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  frequency: string;
  grace_period: string;
  status: string;
  last_pinged_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Activity ───

export const activityEventTypeSchema = z.enum([
  "deploy_started",
  "deploy_completed",
  "deploy_failed",
  "command_run",
  "config_changed",
  "env_updated",
  "heartbeat_missed",
  "heartbeat_recovered",
  "log_cleared",
  "project_updated",
  "domain_added",
  "domain_removed",
  "security_rule_added",
  "security_rule_removed",
]);

export const activitySchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  userId: z.string().nullable(),
  actorName: z.string().nullable(),
  eventType: activityEventTypeSchema,
  description: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});

export type ActivityRow = {
  id: string;
  organization_id: string;
  project_id: string;
  user_id: string | null;
  event_type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// ─── Logs ───

export const logTypeSchema = z.enum(["site", "nginx_access", "nginx_error"]);

export const logEntrySchema = z.object({
  type: logTypeSchema,
  content: z.string(),
  size: z.number(),
  lastModified: z.string().nullable(),
});
