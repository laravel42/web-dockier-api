import { z } from "zod";

export const pmItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string().optional(),
});

export const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export const integrationRequestSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.string(), z.string()),
});

export const integrationWithTeamSchema = integrationRequestSchema.extend({
  teamId: z.string(),
});

export const integrationCreateTaskSchema = integrationRequestSchema.extend({
  title: z.string(),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
});

export const integrationCreateIssueSchema = integrationRequestSchema.extend({
  teamId: z.string(),
  projectId: z.string(),
  title: z.string().min(1),
  description: z.string().default(""),
  priority: z.number().optional(),
  estimateMinutes: z.number().optional(),
  assigneeId: z.string().optional(),
});
