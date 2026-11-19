import type { CreateIssueResponse, PMProvider, TeamMember } from "../types.js";
import { IntegrationsError } from "../errors.js";
import { basicAuth, normalizeBaseUrl, providerJson } from "./utils.js";

export const jiraProvider: PMProvider = {
  teamLabel: "Project",
  projectLabel: "",
  async listTeams(config) {
    if (!config.host || !config.email || !config.apiToken) return { teams: [], teamLabel: this.teamLabel, projectLabel: this.projectLabel };
    const baseUrl = normalizeBaseUrl(config.host);
    const projects = await providerJson<Array<{ id: string; name: string; key: string }>>(
      "Jira",
      `${baseUrl}/rest/api/3/project?maxResults=50&orderBy=name`,
      { headers: { Authorization: basicAuth(config.email, config.apiToken), Accept: "application/json" } },
    );
    return { teams: projects.map((project) => ({ id: project.id, name: project.name, key: project.key })), teamLabel: this.teamLabel, projectLabel: this.projectLabel };
  },
  async listTeamMembers(config, teamId): Promise<{ members: TeamMember[] }> {
    if (!config.host || !config.email || !config.apiToken) return { members: [] };
    const baseUrl = normalizeBaseUrl(config.host);
    const members = await providerJson<Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrls?: Record<string, string> }>>(
      "Jira",
      `${baseUrl}/rest/api/3/user/assignable/search?project=${encodeURIComponent(teamId)}&maxResults=50`,
      { headers: { Authorization: basicAuth(config.email, config.apiToken), Accept: "application/json" } },
    );
    return { members: members.map((member) => ({ id: member.accountId, name: member.displayName, email: member.emailAddress, avatarUrl: member.avatarUrls?.["24x24"] })) };
  },
  async createIssue(req): Promise<CreateIssueResponse> {
    if (!req.config.host || !req.config.email || !req.config.apiToken) {
      throw new IntegrationsError("Jira host, email and API token are required", "bad_request");
    }
    const baseUrl = normalizeBaseUrl(req.config.host);
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
    const issue = await providerJson<{ id: string; key: string }>("Jira", `${baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(req.config.email, req.config.apiToken),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    return { issueId: issue.id, issueKey: issue.key, issueUrl: `${baseUrl}/browse/${issue.key}` };
  },
};
