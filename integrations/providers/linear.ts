import type { PMProvider, ListTeamsResponse, ListTeamProjectsResponse, CreateIssueRequest, CreateIssueResponse, TeamMember } from "../types";

export const linearProvider: PMProvider = {
  teamLabel: "Team",
  projectLabel: "Project",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { apiKey } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!apiKey) return empty;

    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ teams { nodes { id name key } } }` }),
    });
    if (!res.ok) return empty;

    const data: any = await res.json();
    const teams = data?.data?.teams?.nodes || [];
    return {
      teams: teams.map((t: any) => ({ id: t.id, name: t.name, key: t.key })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async listTeamProjects(config, teamId): Promise<ListTeamProjectsResponse> {
    const { apiKey } = config;
    if (!apiKey) return { projects: [] };

    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ team(id: "${teamId}") { projects { nodes { id name } } } }` }),
    });
    if (!res.ok) return { projects: [] };

    const data: any = await res.json();
    return {
      projects: (data?.data?.team?.projects?.nodes || []).map((p: any) => ({ id: p.id, name: p.name })),
    };
  },

  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    const { apiKey } = config;
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ team(id: "${teamId}") { members { nodes { id name email avatarUrl } } } }` }),
    });
    if (!res.ok) return { members: [] };

    const data: any = await res.json();
    return {
      members: (data?.data?.team?.members?.nodes || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        avatarUrl: m.avatarUrl,
      })),
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { apiKey } = req.config;
    const priorityField = req.priority ? `priority: ${req.priority},` : "";
    const estimateField = req.estimateMinutes
      ? (() => {
          const m = req.estimateMinutes!;
          const points = m <= 30 ? 1 : m <= 60 ? 2 : m <= 120 ? 3 : m <= 240 ? 5 : 8;
          return `estimate: ${points},`;
        })()
      : "";
    const assigneeField = req.assigneeId ? `assigneeId: "${req.assigneeId}",` : "";

    const mutation = `mutation { issueCreate(input: { teamId: "${req.teamId}", ${req.projectId ? `projectId: "${req.projectId}",` : ""} ${priorityField} ${estimateField} ${assigneeField} title: ${JSON.stringify(req.title)}, description: ${JSON.stringify(req.description)} }) { success issue { id identifier url } } }`;

    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: mutation }),
    });
    if (!res.ok) throw new Error(`Linear API error ${res.status}`);

    const data: any = await res.json();
    if (!data?.data?.issueCreate?.success) {
      throw new Error(data?.errors?.[0]?.message || "Failed to create Linear issue");
    }

    const issue = data.data.issueCreate.issue;
    return { issueId: issue.id, issueKey: issue.identifier, issueUrl: issue.url };
  },
};
