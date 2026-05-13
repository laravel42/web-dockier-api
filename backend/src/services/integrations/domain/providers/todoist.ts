import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";

const API = "https://api.todoist.com/rest/v2";

export const todoistProvider: PMProvider = {
  teamLabel: "Workspace",
  projectLabel: "Project",
  async listTeams(config) {
    if (!config.apiKey) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    return { teams: [{ id: "todoist", name: "Todoist" }], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
  },
  async listTeamProjects(config) {
    if (!config.apiKey) return { projects: [] };
    const res = await fetch(`${API}/projects`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
    if (!res.ok) return { projects: [] };
    const projects = (await res.json()) as Array<{ id: string; name: string }>;
    return { projects: projects.map((project) => ({ id: String(project.id), name: project.name })) };
  },
  async listTeamMembers(): Promise<{ members: TeamMember[] }> {
    return { members: [] };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.apiKey) throw new Error("Todoist API key is required");
    const res = await fetch(`${API}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${req.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: req.title, description: req.description, project_id: req.projectId || undefined }),
    });
    if (!res.ok) throw new Error(`Todoist task create failed (${res.status})`);
    const task = (await res.json()) as { id: string; url?: string };
    return { issueId: String(task.id), issueKey: String(task.id), issueUrl: task.url ?? "" };
  },
};
