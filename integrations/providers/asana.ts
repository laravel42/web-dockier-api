import type { PMProvider, ListTeamsResponse, ListTeamProjectsResponse, CreateIssueRequest, CreateIssueResponse, TeamMember } from "../types";

export const asanaProvider: PMProvider = {
  teamLabel: "Workspace",
  projectLabel: "Project",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { accessToken } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!accessToken) return empty;

    const res = await fetch("https://app.asana.com/api/1.0/workspaces?limit=50&opt_fields=name,gid", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return empty;

    const data: any = await res.json();
    return {
      teams: (data.data || []).map((w: any) => ({ id: w.gid, name: w.name })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async listTeamProjects(config, workspaceId): Promise<ListTeamProjectsResponse> {
    const { accessToken } = config;
    if (!accessToken) return { projects: [] };

    const res = await fetch(`https://app.asana.com/api/1.0/projects?workspace=${workspaceId}&limit=50&opt_fields=name,gid`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { projects: [] };

    const data: any = await res.json();
    return {
      projects: (data.data || []).map((p: any) => ({ id: p.gid, name: p.name })),
    };
  },

  async listTeamMembers(config, workspaceId): Promise<{ members: TeamMember[] }> {
    const { accessToken } = config;
    const res = await fetch(`https://app.asana.com/api/1.0/workspaces/${workspaceId}/users?opt_fields=name,email,photo.image_21x21`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { members: [] };

    const data: any = await res.json();
    return {
      members: (data.data || []).map((u: any) => ({
        id: u.gid,
        name: u.name,
        email: u.email,
        avatarUrl: u.photo?.image_21x21,
      })),
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { accessToken } = req.config;
    const body: any = { data: { name: req.title, notes: req.description } };
    if (req.projectId) body.data.projects = [req.projectId];
    else body.data.workspace = req.teamId;

    const res = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Asana API error ${res.status}`);

    const data: any = await res.json();
    const task = data.data;
    return {
      issueId: task.gid,
      issueKey: task.gid,
      issueUrl: `https://app.asana.com/0/${req.projectId || "0"}/${task.gid}`,
    };
  },
};
