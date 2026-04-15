import type { PMProvider, ListTeamsResponse, ListTeamProjectsResponse, CreateIssueRequest, CreateIssueResponse, TeamMember } from "../types";

export const clickupProvider: PMProvider = {
  teamLabel: "Workspace",
  projectLabel: "Space",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { apiKey } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!apiKey) return empty;

    const res = await fetch("https://api.clickup.com/api/v2/team", {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) return empty;

    const data: any = await res.json();
    return {
      teams: (data.teams || []).map((t: any) => ({ id: String(t.id), name: t.name })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async listTeamProjects(config, teamId): Promise<ListTeamProjectsResponse> {
    const { apiKey } = config;
    if (!apiKey) return { projects: [] };

    const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) return { projects: [] };

    const data: any = await res.json();
    return {
      projects: (data.spaces || []).map((s: any) => ({ id: String(s.id), name: s.name })),
    };
  },

  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    const { apiKey } = config;
    const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) return { members: [] };

    const data: any = await res.json();
    return {
      members: (data.team?.members || []).map((m: any) => ({
        id: String(m.user.id),
        name: m.user.username || m.user.email,
        email: m.user.email,
        avatarUrl: m.user.profilePicture,
      })),
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { apiKey } = req.config;
    const listId = req.projectId || req.teamId;
    const taskBody: Record<string, unknown> = { name: req.title, description: req.description };
    if (req.estimateMinutes) taskBody.time_estimate = req.estimateMinutes * 60 * 1000;

    const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(taskBody),
    });
    if (!res.ok) throw new Error(`ClickUp API error ${res.status}`);

    const data: any = await res.json();
    return { issueId: data.id, issueKey: data.id, issueUrl: data.url || "" };
  },
};
