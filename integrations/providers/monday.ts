import type { PMProvider, ListTeamsResponse, CreateIssueRequest, CreateIssueResponse } from "../types";

export const mondayProvider: PMProvider = {
  teamLabel: "Board",
  projectLabel: "",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { apiToken } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!apiToken) return empty;

    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { Authorization: apiToken, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ boards(limit:50) { id name } }` }),
    });
    if (!res.ok) return empty;

    const data: any = await res.json();
    return {
      teams: (data?.data?.boards || []).map((b: any) => ({ id: String(b.id), name: b.name })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { apiToken } = req.config;
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { Authorization: apiToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation { create_item(board_id: ${req.teamId}, item_name: ${JSON.stringify(req.title)}) { id } }`,
      }),
    });
    if (!res.ok) throw new Error(`Monday.com API error ${res.status}`);

    const data: any = await res.json();
    const itemId = data?.data?.create_item?.id;
    return { issueId: String(itemId), issueKey: String(itemId), issueUrl: "" };
  },
};
