import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";
import { fetchJson, fetchWithTimeout } from "../../../../shared/http/fetch.js";

const API = "https://api.clickup.com/api/v2";

export const clickupProvider: PMProvider = {
  teamLabel: "Workspace",
  projectLabel: "List",
  async listTeams(config) {
    if (!config.apiKey) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const data = await fetchJson<{ teams?: Array<{ id: string; name: string }> }>(
      `${API}/team`,
      { headers: { Authorization: config.apiKey } },
    );
    if (!data) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    return { teams: (data.teams ?? []).map((team) => ({ id: team.id, name: team.name })), teamLabel: this.teamLabel, projectLabel: this.projectLabel };
  },
  async listTeamProjects(config, teamId) {
    if (!config.apiKey) return { projects: [] };
    const data = await fetchJson<{ spaces?: Array<{ id: string; name: string }> }>(
      `${API}/team/${teamId}/space`,
      { headers: { Authorization: config.apiKey } },
    );
    if (!data) return { projects: [] };
    return { projects: (data.spaces ?? []).map((space) => ({ id: space.id, name: space.name })) };
  },
  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    if (!config.apiKey) return { members: [] };
    const data = await fetchJson<{ team?: { members?: Array<{ user: { id: number; username: string; email?: string; profilePicture?: string } }> } }>(
      `${API}/team/${teamId}`,
      { headers: { Authorization: config.apiKey } },
    );
    if (!data) return { members: [] };
    return {
      members: (data.team?.members ?? []).map((member) => ({
        id: String(member.user.id),
        name: member.user.username,
        email: member.user.email,
        avatarUrl: member.user.profilePicture,
      })),
    };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.apiKey) throw new Error("ClickUp API key is required");
    const res = await fetchWithTimeout(`${API}/list/${req.projectId}/task`, {
      method: "POST",
      headers: { Authorization: req.config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ name: req.title, description: req.description, assignees: req.assigneeId ? [Number(req.assigneeId)] : [] }),
    });
    if (!res.ok) throw new Error(`ClickUp task create failed (${res.status})`);
    const data = (await res.json()) as { id: string; url?: string };
    return { issueId: data.id, issueKey: data.id, issueUrl: data.url ?? "" };
  },
};
