import type { PMProvider, ListTeamsResponse, CreateIssueRequest, CreateIssueResponse } from "../types";

export const notionProvider: PMProvider = {
  teamLabel: "Database",
  projectLabel: "",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { apiKey } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!apiKey) return empty;

    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { value: "database", property: "object" }, page_size: 50 }),
    });
    if (!res.ok) return empty;

    const data: any = await res.json();
    return {
      teams: (data.results || []).map((db: any) => ({ id: db.id, name: db.title?.[0]?.plain_text || db.id })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { apiKey } = req.config;
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({
        parent: { database_id: req.teamId },
        properties: { title: { title: [{ text: { content: req.title } }] } },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content: req.description } }] },
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Notion API error ${res.status}`);

    const data: any = await res.json();
    return { issueId: data.id, issueKey: data.id, issueUrl: data.url || "" };
  },
};
