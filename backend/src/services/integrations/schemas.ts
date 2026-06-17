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
  type: z.string().min(1).optional(),
  config: z.record(z.string(), z.string()).optional(),
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
  .extend({ teamId: z.string() })
  .refine(hasIntegrationCredentials, {
    message: "Either integrationId or type+config is required",
  });

export const integrationCreateTaskSchema = integrationRequestBaseSchema
  .extend({
    title: z.string(),
    description: z.string().optional(),
    assigneeId: z.string().optional(),
  })
  .refine(hasIntegrationCredentials, {
    message: "Either integrationId or type+config is required",
  });

export const integrationCreateIssueSchema = z
  .object({
    integrationId: z.uuid().optional(),
    type: z.string().min(1).optional(),
    config: z.record(z.string(), z.string()).optional(),
    teamId: z.string(),
    projectId: z.string(),
    title: z.string().min(1),
    description: z.string().default(""),
    priority: z.number().optional(),
    estimateMinutes: z.number().optional(),
    assigneeId: z.string().optional(),
  })
  .refine((data) => data.integrationId || (data.type && data.config), {
    message: "Either integrationId or type+config is required",
  });
