import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";
import { fetchJson, fetchWithTimeout } from "../../../../shared/http/fetch.js";

const API = "https://app.asana.com/api/1.0";

export const asanaProvider: PMProvider = {
  teamLabel: "Workspace",
  projectLabel: "Project",
  async listTeams(config) {
    if (!config.apiKey) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const data = await fetchJson<{ data?: Array<{ gid: string; name: string }> }>(
      `${API}/workspaces`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    );
    if (!data) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    return { teams: (data.data ?? []).map((w) => ({ id: w.gid, name: w.name })), teamLabel: this.teamLabel, projectLabel: this.projectLabel };
  },
  async listTeamProjects(config, teamId) {
    if (!config.apiKey) return { projects: [] };
    const data = await fetchJson<{ data?: Array<{ gid: string; name: string }> }>(
      `${API}/workspaces/${teamId}/projects`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    );
    if (!data) return { projects: [] };
    return { projects: (data.data ?? []).map((p) => ({ id: p.gid, name: p.name })) };
  },
  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    if (!config.apiKey) return { members: [] };
    const data = await fetchJson<{ data?: Array<{ gid: string; name: string; email?: string }> }>(
      `${API}/workspaces/${teamId}/users`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    );
    if (!data) return { members: [] };
    return { members: (data.data ?? []).map((u) => ({ id: u.gid, name: u.name, email: u.email })) };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.apiKey) throw new Error("Asana API key is required");
    const res = await fetchWithTimeout(`${API}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${req.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { name: req.title, notes: req.description, projects: [req.projectId], assignee: req.assigneeId || undefined } }),
    });
    if (!res.ok) throw new Error(`Asana task create failed (${res.status})`);
    const data = (await res.json()) as { data?: { gid: string; permalink_url?: string } };
    return { issueId: data.data?.gid ?? "", issueKey: data.data?.gid ?? "", issueUrl: data.data?.permalink_url ?? "" };
  },
};
