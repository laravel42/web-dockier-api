import { request } from "./request";

export const integrationsApi = {
  listPMTeams: (type: string, config: Record<string, string>) =>
    request<{
      teams: Array<{ id: string; name: string; key?: string }>;
      teamLabel: string;
      projectLabel: string;
    }>("/integrations/pm/teams", {
      method: "POST",
      body: JSON.stringify({ type, config }),
    }),

  listPMTeamProjects: (type: string, config: Record<string, string>, teamId: string) =>
    request<{
      projects: Array<{ id: string; name: string; key?: string }>;
    }>("/integrations/pm/team-projects", {
      method: "POST",
      body: JSON.stringify({ type, config, teamId }),
    }),

  listPMTeamMembers: (type: string, config: Record<string, string>, teamId: string) =>
    request<{
      members: Array<{ id: string; name: string; email?: string; avatarUrl?: string }>;
    }>("/integrations/pm/team-members", {
      method: "POST",
      body: JSON.stringify({ type, config, teamId }),
    }),

  createPMIssue: (data: { type: string; config: Record<string, string>; teamId: string; projectId: string; title: string; description: string; priority?: number; estimateMinutes?: number; assigneeId?: string }) =>
    request<{
      issueId: string;
      issueKey: string;
      issueUrl: string;
    }>("/integrations/pm/issues", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
