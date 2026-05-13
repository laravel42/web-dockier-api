import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";

const API = "https://api.monday.com/v2";

async function graphql(token: string, query: string): Promise<any> {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return null;
  return res.json();
}

export const mondayProvider: PMProvider = {
  teamLabel: "Workspace",
  projectLabel: "Board",
  async listTeams(config) {
    if (!config.apiKey) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const data = await graphql(config.apiKey, "{ workspaces { id name } }");
    return {
      teams: (data?.data?.workspaces ?? []).map((w: any) => ({ id: String(w.id), name: w.name })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },
  async listTeamProjects(config) {
    if (!config.apiKey) return { projects: [] };
    const data = await graphql(config.apiKey, "{ boards (limit: 100) { id name } }");
    return { projects: (data?.data?.boards ?? []).map((b: any) => ({ id: String(b.id), name: b.name })) };
  },
  async listTeamMembers(config): Promise<{ members: TeamMember[] }> {
    if (!config.apiKey) return { members: [] };
    const data = await graphql(config.apiKey, "{ users { id name email photo_thumb } }");
    return {
      members: (data?.data?.users ?? []).map((u: any) => ({ id: String(u.id), name: u.name, email: u.email, avatarUrl: u.photo_thumb })),
    };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.apiKey) throw new Error("Monday API key is required");
    const mutation = `mutation { create_item(board_id: ${req.projectId}, item_name: ${JSON.stringify(req.title)}) { id } }`;
    const data = await graphql(req.config.apiKey, mutation);
    const id = data?.data?.create_item?.id;
    if (!id) throw new Error("Failed to create Monday item");
    return { issueId: String(id), issueKey: String(id), issueUrl: "" };
  },
};
