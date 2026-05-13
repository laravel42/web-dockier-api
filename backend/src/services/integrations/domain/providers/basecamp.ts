import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";

export const basecampProvider: PMProvider = {
  teamLabel: "Account",
  projectLabel: "Project",
  async listTeams(config) {
    if (!config.apiKey || !config.accountId) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    return {
      teams: [{ id: config.accountId, name: `Basecamp ${config.accountId}` }],
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },
  async listTeamProjects(config, teamId) {
    if (!config.apiKey) return { projects: [] };
    const res = await fetch(`https://3.basecampapi.com/${teamId}/projects.json`, {
      headers: { Authorization: `Bearer ${config.apiKey}`, "User-Agent": "Dockier" },
    });
    if (!res.ok) return { projects: [] };
    const projects = (await res.json()) as Array<{ id: number; name: string }>;
    return { projects: projects.map((project) => ({ id: String(project.id), name: project.name })) };
  },
  async listTeamMembers(): Promise<{ members: TeamMember[] }> {
    return { members: [] };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.apiKey || !req.config.accountId) throw new Error("Basecamp API key and accountId are required");
    if (!req.projectId) throw new Error("Basecamp projectId (bucket id) is required");
    const baseUrl = `https://3.basecampapi.com/${req.config.accountId}`;
    const headers = {
      Authorization: `Bearer ${req.config.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Dockier",
    };

    const listsRes = await fetch(`${baseUrl}/buckets/${req.projectId}/todolists.json`, { headers });
    if (!listsRes.ok) throw new Error(`Basecamp todolist lookup failed (${listsRes.status})`);
    const lists = (await listsRes.json()) as Array<{ id: number; name: string }>;

    let listId = lists.find((list) => /dockier|triage|security/i.test(list.name))?.id;
    if (!listId) {
      const createList = await fetch(`${baseUrl}/buckets/${req.projectId}/todolists.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Dockier Triage" }),
      });
      if (!createList.ok) throw new Error(`Basecamp todolist creation failed (${createList.status})`);
      const created = (await createList.json()) as { id: number };
      listId = created.id;
    }

    const todoRes = await fetch(`${baseUrl}/buckets/${req.projectId}/todolists/${listId}/todos.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: req.title,
        description: req.description || "",
        assignee_ids: req.assigneeId ? [Number(req.assigneeId)] : undefined,
      }),
    });
    if (!todoRes.ok) throw new Error(`Basecamp todo creation failed (${todoRes.status})`);
    const createdTodo = (await todoRes.json()) as { id: number; app_url?: string };
    return {
      issueId: String(createdTodo.id),
      issueKey: String(createdTodo.id),
      issueUrl: createdTodo.app_url || `${baseUrl}/buckets/${req.projectId}/todos/${createdTodo.id}`,
    };
  },
};
