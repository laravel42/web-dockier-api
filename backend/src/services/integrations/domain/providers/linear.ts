import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";
import { IntegrationsError } from "../errors.js";
import { providerJson } from "./utils.js";

/**
 * Every caller value goes in `variables`, never into the query text: the ids come
 * from the request body, and a quote in one closed the string and let a caller
 * add fields (or whole mutations) run with the tenant's Linear API key.
 */
async function linearGraphql<T>(apiKey: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const body = await providerJson<{ data?: T; errors?: Array<{ message?: string }> }>("Linear", "https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!body.data) throw new IntegrationsError(`Linear: ${body.errors?.[0]?.message || "empty response"}`, "bad_request");
  return body.data;
}

function estimatePoints(minutes: number): number {
  return minutes <= 30 ? 1 : minutes <= 60 ? 2 : minutes <= 120 ? 3 : minutes <= 240 ? 5 : 8;
}

export const linearProvider: PMProvider = {
  teamLabel: "Team",
  projectLabel: "Project",
  async listTeams(config) {
    if (!config.apiKey) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const data = await linearGraphql<{ teams?: { nodes?: Array<{ id: string; name: string; key: string }> } }>(
      config.apiKey,
      "query { teams { nodes { id name key } } }",
    );
    const teams = data.teams?.nodes ?? [];
    return { teams: teams.map((team) => ({ id: team.id, name: team.name, key: team.key })), teamLabel: this.teamLabel, projectLabel: this.projectLabel };
  },
  async listTeamProjects(config, teamId) {
    if (!config.apiKey) return { projects: [] };
    const data = await linearGraphql<{ team?: { projects?: { nodes?: Array<{ id: string; name: string }> } } }>(
      config.apiKey,
      "query($teamId: String!) { team(id: $teamId) { projects { nodes { id name } } } }",
      { teamId },
    );
    return { projects: (data.team?.projects?.nodes ?? []).map((project) => ({ id: project.id, name: project.name })) };
  },
  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    if (!config.apiKey) return { members: [] };
    const data = await linearGraphql<{ team?: { members?: { nodes?: Array<{ id: string; name: string; email?: string; avatarUrl?: string }> } } }>(
      config.apiKey,
      "query($teamId: String!) { team(id: $teamId) { members { nodes { id name email avatarUrl } } } }",
      { teamId },
    );
    return { members: (data.team?.members?.nodes ?? []).map((member) => ({ id: member.id, name: member.name, email: member.email, avatarUrl: member.avatarUrl })) };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.apiKey) throw new IntegrationsError("Linear API key is required", "bad_request");
    const input: Record<string, unknown> = { teamId: req.teamId, title: req.title, description: req.description };
    if (req.projectId) input.projectId = req.projectId;
    if (req.priority) input.priority = req.priority;
    if (req.estimateMinutes) input.estimate = estimatePoints(req.estimateMinutes);
    if (req.assigneeId) input.assigneeId = req.assigneeId;
    const data = await linearGraphql<{ issueCreate?: { success?: boolean; issue?: { id: string; identifier: string; url: string } } }>(
      req.config.apiKey,
      "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
      { input },
    );
    const issue = data.issueCreate?.issue;
    if (!data.issueCreate?.success || !issue) throw new IntegrationsError("Linear did not create the issue", "service_unavailable");
    return { issueId: issue.id, issueKey: issue.identifier, issueUrl: issue.url };
  },
};
