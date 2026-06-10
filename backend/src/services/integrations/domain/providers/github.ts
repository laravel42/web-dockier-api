import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";

export const githubProvider: PMProvider = {
  teamLabel: "Organization",
  projectLabel: "Repository",
  async listTeams(config) {
    if (!config.token) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const response = await fetch("https://api.github.com/user/orgs", {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const orgs = (await response.json()) as Array<{ id: number; login: string }>;
    return { teams: orgs.map((org) => ({ id: org.login, name: org.login, key: String(org.id) })), teamLabel: this.teamLabel, projectLabel: this.projectLabel };
  },
  async listTeamProjects(config, teamId) {
    if (!config.token) return { projects: [] };
    const response = await fetch(`https://api.github.com/orgs/${teamId}/repos?per_page=100`, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { projects: [] };
    const repos = (await response.json()) as Array<{ id: number; name: string; full_name: string }>;
    return { projects: repos.map((repo) => ({ id: String(repo.id), name: repo.name, key: repo.full_name })) };
  },
  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    if (!config.token) return { members: [] };
    const response = await fetch(`https://api.github.com/orgs/${teamId}/members?per_page=100`, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { members: [] };
    const members = (await response.json()) as Array<{ id: number; login: string; avatar_url: string }>;
    return { members: members.map((member) => ({ id: String(member.id), name: member.login, avatarUrl: member.avatar_url })) };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.token) throw new Error("GitHub token is required");
    const [owner, repo] = req.projectId.split("/");
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.config.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: req.title,
        body: req.description,
        ...(req.assigneeId ? { assignees: [req.assigneeId] } : {}),
      }),
    });
    if (!response.ok) throw new Error(`GitHub issue create failed (${response.status})`);
    const issue = (await response.json()) as { id: number; number: number; html_url: string };
    return { issueId: String(issue.id), issueKey: `#${issue.number}`, issueUrl: issue.html_url };
  },
};
