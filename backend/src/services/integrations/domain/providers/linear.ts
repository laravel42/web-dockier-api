import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";

async function linearGraphql<T>(apiKey: string, query: string): Promise<T | null> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

export const linearProvider: PMProvider = {
  teamLabel: "Team",
  projectLabel: "Project",
  async listTeams(config) {
    if (!config.apiKey) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const data = await linearGraphql<{ data?: { teams?: { nodes?: Array<{ id: string; name: string; key: string }> } } }>(
      config.apiKey,
      "{ teams { nodes { id name key } } }",
    );
    const teams = data?.data?.teams?.nodes ?? [];
    return { teams: teams.map((team) => ({ id: team.id, name: team.name, key: team.key })), teamLabel: this.teamLabel, projectLabel: this.projectLabel };
  },
  async listTeamProjects(config, teamId) {
    if (!config.apiKey) return { projects: [] };
    const data = await linearGraphql<{ data?: { team?: { projects?: { nodes?: Array<{ id: string; name: string }> } } } }>(
      config.apiKey,
      `{ team(id: "${teamId}") { projects { nodes { id name } } } }`,
    );
    return { projects: (data?.data?.team?.projects?.nodes ?? []).map((project) => ({ id: project.id, name: project.name })) };
  },
  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    if (!config.apiKey) return { members: [] };
    const data = await linearGraphql<{ data?: { team?: { members?: { nodes?: Array<{ id: string; name: string; email?: string; avatarUrl?: string }> } } } }>(
      config.apiKey,
      `{ team(id: "${teamId}") { members { nodes { id name email avatarUrl } } } }`,
    );
    return { members: (data?.data?.team?.members?.nodes ?? []).map((member) => ({ id: member.id, name: member.name, email: member.email, avatarUrl: member.avatarUrl })) };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.apiKey) throw new Error("Linear API key is required");
    const priorityField = req.priority ? `priority: ${req.priority},` : "";
    const estimateField = req.estimateMinutes
      ? (() => {
          const minutes = req.estimateMinutes!;
          const points = minutes <= 30 ? 1 : minutes <= 60 ? 2 : minutes <= 120 ? 3 : minutes <= 240 ? 5 : 8;
          return `estimate: ${points},`;
        })()
      : "";
    const assigneeField = req.assigneeId ? `assigneeId: "${req.assigneeId}",` : "";
    const mutation = `mutation { issueCreate(input: { teamId: "${req.teamId}", ${req.projectId ? `projectId: "${req.projectId}",` : ""} ${priorityField} ${estimateField} ${assigneeField} title: ${JSON.stringify(req.title)}, description: ${JSON.stringify(req.description)} }) { success issue { id identifier url } } }`;
    const data = await linearGraphql<{ data?: { issueCreate?: { success?: boolean; issue?: { id: string; identifier: string; url: string } } }; errors?: Array<{ message?: string }> }>(
      req.config.apiKey,
      mutation,
    );
    if (!data?.data?.issueCreate?.success || !data.data.issueCreate.issue) throw new Error(data?.errors?.[0]?.message || "Failed to create Linear issue");
    return {
      issueId: data.data.issueCreate.issue.id,
      issueKey: data.data.issueCreate.issue.identifier,
      issueUrl: data.data.issueCreate.issue.url,
    };
  },
};
