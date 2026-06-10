import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

export const notionProvider: PMProvider = {
  teamLabel: "Workspace",
  projectLabel: "Database",
  async listTeams(config) {
    if (!config.apiKey) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    return {
      teams: [{ id: "workspace", name: "Notion Workspace" }],
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },
  async listTeamProjects(config) {
    if (!config.apiKey) return { projects: [] };
    const res = await fetch(`${API}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { value: "database", property: "object" } }),
    });
    if (!res.ok) return { projects: [] };
    const data = (await res.json()) as { results?: Array<{ id: string; title?: Array<{ plain_text?: string }> }> };
    return { projects: (data.results ?? []).map((database) => ({ id: database.id, name: database.title?.[0]?.plain_text || "Untitled" })) };
  },
  async listTeamMembers(): Promise<{ members: TeamMember[] }> {
    return { members: [] };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.apiKey) throw new Error("Notion API key is required");
    const res = await fetch(`${API}/pages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${req.config.apiKey}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({
        parent: { database_id: req.projectId },
        properties: {
          Name: {
            title: [{ text: { content: req.title } }],
          },
        },
        children: req.description
          ? [
              {
                object: "block",
                type: "paragraph",
                paragraph: { rich_text: [{ type: "text", text: { content: req.description } }] },
              },
            ]
          : undefined,
      }),
    });
    if (!res.ok) throw new Error(`Notion page create failed (${res.status})`);
    const data = (await res.json()) as { id: string; url?: string };
    return { issueId: data.id, issueKey: data.id, issueUrl: data.url ?? "" };
  },
};
