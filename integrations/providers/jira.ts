import type { PMProvider, ListTeamsResponse, CreateIssueRequest, CreateIssueResponse, TeamMember } from "../types";

export const jiraProvider: PMProvider = {
  teamLabel: "Project",
  projectLabel: "",

  async listTeams(config): Promise<ListTeamsResponse> {
    const { host, email, apiToken } = config;
    const empty: ListTeamsResponse = { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    if (!host || !email || !apiToken) return empty;

    const base = host.replace(/\/+$/, "");
    const res = await fetch(`${base}/rest/api/3/project?maxResults=50&orderBy=name`, {
      headers: { Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`, Accept: "application/json" },
    });
    if (!res.ok) return empty;

    const data = await res.json();
    return {
      teams: (data as any[]).map((p: any) => ({ id: p.id, name: p.name, key: p.key })),
      teamLabel: this.teamLabel,
      projectLabel: this.projectLabel,
    };
  },

  async listTeamMembers(config, projectId): Promise<{ members: TeamMember[] }> {
    const { host, email, apiToken } = config;
    const base = host.replace(/\/+$/, "");
    const res = await fetch(`${base}/rest/api/3/user/assignable/search?project=${projectId}&maxResults=50`, {
      headers: { Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`, Accept: "application/json" },
    });
    if (!res.ok) return { members: [] };

    const data = (await res.json()) as any[];
    return {
      members: data.map((u: any) => ({
        id: u.accountId,
        name: u.displayName,
        email: u.emailAddress,
        avatarUrl: u.avatarUrls?.["24x24"],
      })),
    };
  },

  async createIssue(req): Promise<CreateIssueResponse> {
    const { host, email, apiToken } = req.config;
    const base = host.replace(/\/+$/, "");

    const fields: Record<string, unknown> = {
      project: { id: req.teamId },
      summary: req.title,
      description: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text: req.description }] }],
      },
      issuetype: { name: "Task" },
    };
    if (req.estimateMinutes) fields.timetracking = { originalEstimate: `${req.estimateMinutes}m` };
    if (req.assigneeId) fields.assignee = { accountId: req.assigneeId };

    const res = await fetch(`${base}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(err?.errorMessages?.[0] || err?.errors?.summary || `Jira API error ${res.status}`);
    }

    const data: any = await res.json();
    return { issueId: data.id, issueKey: data.key, issueUrl: `${base}/browse/${data.key}` };
  },
};
