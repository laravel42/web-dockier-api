import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";
import { normalizeBaseUrl } from "./utils.js";

export const gitlabProvider: PMProvider = {
  teamLabel: "Group",
  projectLabel: "Project",
  async listTeams(config) {
    const baseUrl = normalizeBaseUrl(config.host || "https://gitlab.com");
    if (!config.apiToken) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const response = await fetch(`${baseUrl}/api/v4/groups?per_page=100`, { headers: { "PRIVATE-TOKEN": config.apiToken } });
    if (!response.ok) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const groups = (await response.json()) as Array<{ id: number; name: string; full_path: string }>;
    return { teams: groups.map((group) => ({ id: String(group.id), name: group.name, key: group.full_path })), teamLabel: this.teamLabel, projectLabel: this.projectLabel };
  },
  async listTeamProjects(config, teamId) {
    const baseUrl = normalizeBaseUrl(config.host || "https://gitlab.com");
    if (!config.apiToken) return { projects: [] };
    const response = await fetch(`${baseUrl}/api/v4/groups/${encodeURIComponent(teamId)}/projects?per_page=100`, { headers: { "PRIVATE-TOKEN": config.apiToken } });
    if (!response.ok) return { projects: [] };
    const projects = (await response.json()) as Array<{ id: number; name: string; path_with_namespace: string }>;
    return { projects: projects.map((project) => ({ id: String(project.id), name: project.name, key: project.path_with_namespace })) };
  },
  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    const baseUrl = normalizeBaseUrl(config.host || "https://gitlab.com");
    if (!config.apiToken) return { members: [] };
    const response = await fetch(`${baseUrl}/api/v4/groups/${encodeURIComponent(teamId)}/members?per_page=100`, { headers: { "PRIVATE-TOKEN": config.apiToken } });
    if (!response.ok) return { members: [] };
    const members = (await response.json()) as Array<{ id: number; name: string; username: string; avatar_url?: string }>;
    return { members: members.map((member) => ({ id: String(member.id), name: member.name || member.username, avatarUrl: member.avatar_url })) };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    const baseUrl = normalizeBaseUrl(req.config.host || "https://gitlab.com");
    if (!req.config.apiToken) throw new Error("GitLab token is required");
    const response = await fetch(`${baseUrl}/api/v4/projects/${encodeURIComponent(req.projectId)}/issues`, {
      method: "POST",
      headers: { "PRIVATE-TOKEN": req.config.apiToken, "Content-Type": "application/json" },
      body: JSON.stringify({ title: req.title, description: req.description }),
    });
    if (!response.ok) throw new Error(`GitLab issue create failed (${response.status})`);
    const issue = (await response.json()) as { id: number; iid: number; web_url: string };
    return { issueId: String(issue.id), issueKey: `#${issue.iid}`, issueUrl: issue.web_url };
  },
};
