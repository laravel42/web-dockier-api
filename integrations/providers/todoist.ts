import type { PMProvider, ListTeamsResponse, CreateIssueRequest, CreateIssueResponse } from "../types";

export const todoistProvider: PMProvider = {
  teamLabel: "Project",
  projectLabel: "",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { apiToken } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!apiToken) return empty;

    const res = await fetch("https://api.todoist.com/rest/v2/projects", {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!res.ok) return empty;

    const data = await res.json();
    return {
      teams: (data as any[]).map((p: any) => ({ id: String(p.id), name: p.name })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { apiToken } = req.config;
    const res = await fetch("https://api.todoist.com/rest/v2/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: req.title, description: req.description, project_id: req.teamId }),
    });
    if (!res.ok) throw new Error(`Todoist API error ${res.status}`);

    const data: any = await res.json();
    return { issueId: String(data.id), issueKey: String(data.id), issueUrl: data.url || "" };
  },
};
