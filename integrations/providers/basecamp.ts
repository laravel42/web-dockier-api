import type { PMProvider, ListTeamsResponse, CreateIssueRequest, CreateIssueResponse } from "../types";

export const basecampProvider: PMProvider = {
  teamLabel: "Project",
  projectLabel: "",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { accountId, accessToken } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!accountId || !accessToken) return empty;

    const res = await fetch(`https://3.basecampapi.com/${accountId}/projects.json`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
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
    const { accountId, accessToken } = req.config;

    // First find the todoset for the project
    const projRes = await fetch(`https://3.basecampapi.com/${accountId}/projects/${req.teamId}.json`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    if (!projRes.ok) throw new Error(`Basecamp API error ${projRes.status}`);

    const projData: any = await projRes.json();
    const todoset = (projData.dock || []).find((d: any) => d.name === "todoset");
    if (!todoset) throw new Error("No todoset found in Basecamp project");

    // Create a todolist first, then a todo
    const listRes = await fetch(`${todoset.url}/todolists.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Security Findings", description: "Issues from Opengrep scan" }),
    });

    let todolistUrl = "";
    if (listRes.ok) {
      const listData: any = await listRes.json();
      todolistUrl = listData.todos_url;
    }
    if (!todolistUrl) throw new Error("Failed to create/find Basecamp todolist");

    const todoRes = await fetch(todolistUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: req.title, description: req.description }),
    });
    if (!todoRes.ok) throw new Error(`Basecamp todo creation failed ${todoRes.status}`);

    const todoData: any = await todoRes.json();
    return { issueId: String(todoData.id), issueKey: String(todoData.id), issueUrl: todoData.app_url || "" };
  },
};
