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

// Always a stored integration: inline type+config let any project viewer make the
// backend call an arbitrary host (SSRF) and skipped the provider allowlist and `enabled`.
export const integrationRequestSchema = z.object({ integrationId: z.uuid() });
export const integrationWithTeamSchema = integrationRequestSchema.extend({ teamId: z.string().max(200) });
export const integrationCreateIssueSchema = integrationRequestSchema.extend({
  teamId: z.string().max(200),
  projectId: z.string().max(200),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).default(""),
  priority: z.number().int().min(0).max(4).optional(),
  estimateMinutes: z.number().int().positive().optional(),
  assigneeId: z.string().max(200).optional(),
});
// ─── Response Schemas ──────────────────────────────────────────────

export const listIntegrationsResponseSchema = z.object({
  integrations: z.array(pmIntegrationSchema),
});

export const listTeamsResponseSchema = z.object({
  teams: z.array(pmItemSchema),
  teamLabel: z.string(),
  projectLabel: z.string(),
});

export const listTeamProjectsResponseSchema = z.object({
  projects: z.array(pmItemSchema),
});

export const listTeamMembersResponseSchema = z.object({
  members: z.array(teamMemberSchema),
});

export const createIssueResponseSchema = z.object({
  issueId: z.string(),
  issueKey: z.string(),
  issueUrl: z.string(),
});
