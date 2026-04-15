import type { PMProvider, ListTeamsResponse, CreateIssueRequest, CreateIssueResponse, TeamMember } from "../types";

export const githubProvider: PMProvider = {
  teamLabel: "Repository",
  projectLabel: "",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { token } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!token) return empty;

    const res = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return empty;

    const data = await res.json();
    return {
      teams: (data as any[]).map((r: any) => ({ id: String(r.id), name: r.full_name, key: r.full_name })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async listTeamMembers(config, repoId): Promise<{ members: TeamMember[] }> {
    const { token } = config;

    // Resolve repo full_name from ID
    const repoRes = await fetch(`https://api.github.com/repositories/${repoId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!repoRes.ok) return { members: [] };

    const repo: any = await repoRes.json();
    const res = await fetch(`https://api.github.com/repos/${repo.full_name}/collaborators?per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { members: [] };

    const data = (await res.json()) as any[];
    return {
      members: data.map((u: any) => ({ id: u.login, name: u.login, avatarUrl: u.avatar_url })),
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { token } = req.config;

    // teamId is the numeric repo id — resolve to full_name
    const repoRes = await fetch(`https://api.github.com/repositories/${req.teamId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!repoRes.ok) throw new Error("Could not resolve GitHub repository");

    const repoData: any = await repoRes.json();
    const fullName = repoData.full_name;

    const res = await fetch(`https://api.github.com/repos/${fullName}/issues`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: req.title,
        body: req.description,
        labels: ["security"],
        ...(req.assigneeId ? { assignees: [req.assigneeId] } : {}),
      }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(err?.message || `GitHub API error ${res.status}`);
    }

    const data: any = await res.json();
    return { issueId: String(data.id), issueKey: `#${data.number}`, issueUrl: data.html_url };
  },
};
