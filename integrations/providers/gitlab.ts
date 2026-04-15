import type { PMProvider, ListTeamsResponse, CreateIssueRequest, CreateIssueResponse, TeamMember } from "../types";

export const gitlabProvider: PMProvider = {
  teamLabel: "Project",
  projectLabel: "",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { host, token } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!token) return empty;

    const base = (host || "https://gitlab.com").replace(/\/+$/, "");
    const res = await fetch(`${base}/api/v4/projects?membership=true&per_page=100&order_by=updated_at`, {
      headers: { "PRIVATE-TOKEN": token },
    });
    if (!res.ok) return empty;

    const data = await res.json();
    return {
      teams: (data as any[]).map((p: any) => ({ id: String(p.id), name: p.path_with_namespace, key: p.path_with_namespace })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async listTeamMembers(config, projectId): Promise<{ members: TeamMember[] }> {
    const { host, token } = config;
    const base = (host || "https://gitlab.com").replace(/\/+$/, "");
    const res = await fetch(`${base}/api/v4/projects/${encodeURIComponent(projectId)}/members/all?per_page=100`, {
      headers: { "PRIVATE-TOKEN": token },
    });
    if (!res.ok) return { members: [] };

    const data = (await res.json()) as any[];
    return {
      members: data.map((u: any) => ({
        id: String(u.id),
        name: u.name || u.username,
        email: "",
        avatarUrl: u.avatar_url,
      })),
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { host, token } = req.config;
    const base = (host || "https://gitlab.com").replace(/\/+$/, "");
    const projectId = encodeURIComponent(req.teamId);

    const issueBody: Record<string, unknown> = { title: req.title, description: req.description, labels: "security" };
    if (req.assigneeId) issueBody.assignee_ids = [Number(req.assigneeId)];

    const res = await fetch(`${base}/api/v4/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
      body: JSON.stringify(issueBody),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(err?.message || err?.error || `GitLab API error ${res.status}`);
    }

    const data: any = await res.json();

    // Set time estimate if supported
    if (req.estimateMinutes) {
      try {
        await fetch(`${base}/api/v4/projects/${projectId}/issues/${data.iid}/time_estimate`, {
          method: "POST",
          headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
          body: JSON.stringify({ duration: `${req.estimateMinutes}m` }),
        });
      } catch {
        /* non-critical */
      }
    }

    return { issueId: String(data.id), issueKey: `#${data.iid}`, issueUrl: data.web_url };
  },
};
