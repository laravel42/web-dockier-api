import { z } from "zod";

export const pmIntegrationSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
});

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

const integrationRequestBaseSchema = z.object({
  integrationId: z.uuid().optional(),
  type: z.string().min(1).max(50).optional(),
  config: z.record(z.string().max(100), z.string().max(5000)).optional(),
});

function hasIntegrationCredentials(data: {
  integrationId?: string;
  type?: string;
  config?: Record<string, string>;
}) {
  return !!data.integrationId || !!(data.type && data.config);
}

export const integrationRequestSchema = integrationRequestBaseSchema.refine(hasIntegrationCredentials, {
  message: "Either integrationId or type+config is required",
});

export const integrationWithTeamSchema = integrationRequestBaseSchema
  .extend({ teamId: z.string().max(200) })
  .refine(hasIntegrationCredentials, {
    message: "Either integrationId or type+config is required",
  });

export const integrationCreateTaskSchema = integrationRequestBaseSchema
  .extend({
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional(),
    assigneeId: z.string().max(200).optional(),
  })
  .refine(hasIntegrationCredentials, {
    message: "Either integrationId or type+config is required",
  });

export const integrationCreateIssueSchema = z
  .object({
    integrationId: z.uuid().optional(),
    type: z.string().min(1).max(50).optional(),
    config: z.record(z.string().max(100), z.string().max(5000)).optional(),
    teamId: z.string().max(200),
    projectId: z.string().max(200),
    title: z.string().min(1).max(500),
    description: z.string().max(5000).default(""),
    priority: z.number().optional(),
    estimateMinutes: z.number().optional(),
    assigneeId: z.string().max(200).optional(),
  })
  .refine((data) => data.integrationId || (data.type && data.config), {
    message: "Either integrationId or type+config is required",
  });
