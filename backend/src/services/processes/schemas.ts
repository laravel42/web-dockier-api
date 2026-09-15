import { z } from "zod";
import type { TableRow } from "../../shared/supabase/types.js";

// ─── Background Processes ───

export const processTypeSchema = z.enum(["queue_worker", "custom"]);
export const processStatusSchema = z.enum(["running", "stopped", "errored"]);

/** Status values accepted by the change-status endpoint (includes 'restart' action). */
export const processStatusInputSchema = z.enum(["running", "stopped", "errored", "restart"]);

export const backgroundProcessSchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  name: z.string(),
  type: processTypeSchema,
  command: z.string(),
  status: processStatusSchema,
  runtime: z.string(),
  runtimeVersion: z.string().nullable(),
  connection: z.string().nullable(),
  numProcesses: z.number().int(),
  queue: z.string().nullable(),
  backoff: z.number().int(),
  sleep: z.number().int(),
  rest: z.number().int(),
  timeout: z.number().int(),
  tries: z.number().int(),
  memory: z.number().int(),
  env: z.string().nullable(),
  force: z.boolean(),
  workingDirectory: z.string().nullable(),
  gracefulShutdown: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createProcessBodySchema = z.object({
  name: z.string().max(200).default(""),
  type: processTypeSchema.default("queue_worker"),
  command: z.string().max(2000).optional(),
  runtime: z.string().max(20).default("node"),
  runtimeVersion: z.string().max(20).optional(),
  connection: z.string().max(200).optional(),
  numProcesses: z.number().int().min(1).max(100).default(1),
  queue: z.string().max(200).optional(),
  backoff: z.number().int().min(0).default(0),
  sleep: z.number().int().min(0).default(3),
  rest: z.number().int().min(0).default(0),
  timeout: z.number().int().min(0).default(60),
  tries: z.number().int().min(0).default(1),
  memory: z.number().int().min(32).default(128),
  env: z.string().max(200).optional(),
  force: z.boolean().default(false),
  workingDirectory: z.string().max(500).optional(),
  gracefulShutdown: z.number().int().min(0).default(15),
});

export const updateProcessBodySchema = createProcessBodySchema.partial();

// ─── Scheduled Jobs ───

export const jobFrequencySchema = z.enum([
  "every_minute",
  "hourly",
  "nightly",
  "weekly",
  "monthly",
  "on_reboot",
  "custom",
]);

export const jobStatusSchema = z.enum(["installed", "paused"]);

export const scheduledJobSchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  name: z.string(),
  command: z.string(),
  user: z.string(),
  frequency: jobFrequencySchema,
  customCron: z.string().nullable(),
  monitorHeartbeat: z.boolean(),
  heartbeatUrl: z.string().nullable(),
  status: jobStatusSchema,
  lastRunAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createJobBodySchema = z.object({
  name: z.string().min(1).max(200),
  command: z.string().min(1).max(2000),
  user: z.string().max(100).default("root"),
  frequency: jobFrequencySchema.default("weekly"),
  customCron: z.string().max(100).optional(),
  monitorHeartbeat: z.boolean().default(false),
});

export const updateJobBodySchema = createJobBodySchema.partial();

// ─── Row Types ───

export type BackgroundProcessRow = TableRow<"background_processes">;

export type ScheduledJobRow = TableRow<"scheduled_jobs">;
