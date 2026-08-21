import { request } from "./request";
import type { PMIntegration } from "../types";

export const integrationsApi = {
  listPMIntegrations: () =>
    request<{ integrations: PMIntegration[] }>("/integrations/pm"),

  createPMIntegration: (data: {
    provider: string;
    name: string;
    config: Record<string, string>;
    enabled?: boolean;
  }) =>
    request<PMIntegration>("/integrations/pm", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updatePMIntegration: (
    integrationId: string,
    data: { name?: string; config?: Record<string, string>; enabled?: boolean },
  ) =>
    request<PMIntegration>(`/integrations/pm/${integrationId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deletePMIntegration: (integrationId: string) =>
    request<{ success: true }>(`/integrations/pm/${integrationId}`, { method: "DELETE" }),

  listPMTeams: (integrationId: string) =>
    request<{
      teams: Array<{ id: string; name: string; key?: string }>;
      teamLabel: string;
      projectLabel: string;
    }>("/integrations/pm/teams", {
      method: "POST",
      body: JSON.stringify({ integrationId }),
    }),

  listPMTeamProjects: (integrationId: string, teamId: string) =>
    request<{
      projects: Array<{ id: string; name: string; key?: string }>;
    }>("/integrations/pm/team-projects", {
      method: "POST",
      body: JSON.stringify({ integrationId, teamId }),
    }),

  listPMTeamMembers: (integrationId: string, teamId: string) =>
    request<{
      members: Array<{ id: string; name: string; email?: string; avatarUrl?: string }>;
    }>("/integrations/pm/team-members", {
      method: "POST",
      body: JSON.stringify({ integrationId, teamId }),
    }),

  createPMIssue: (data: {
    integrationId: string;
    teamId: string;
    projectId: string;
    title: string;
    description: string;
    priority?: number;
    estimateMinutes?: number;
    assigneeId?: string;
  }) =>
    request<{
      issueId: string;
      issueKey: string;
      issueUrl: string;
    }>("/integrations/pm/issues", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
