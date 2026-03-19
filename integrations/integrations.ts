import { api } from "encore.dev/api";

// ─── Types ───

interface PMItem {
  id: string;
  name: string;
  key?: string;
}

interface ListTeamsRequest {
  type: string;
  config: Record<string, string>;
}

interface ListTeamsResponse {
  teams: PMItem[];
  teamLabel: string; // "Project", "Team", "Workspace", "Space", "Board", etc.
  projectLabel: string; // label for the sub-level, empty if flat
}

interface ListTeamProjectsRequest {
  type: string;
  config: Record<string, string>;
  teamId: string;
}

interface ListTeamProjectsResponse {
  projects: PMItem[];
}

interface CreateIssueRequest {
  type: string;
  config: Record<string, string>;
  teamId: string;
  projectId: string;
  title: string;
  description: string;
}

interface CreateIssueResponse {
  issueId: string;
  issueKey: string;
  issueUrl: string;
}

// ─── List teams / top-level containers ───

export const listPMTeams = api(
  { expose: true, method: "POST", path: "/integrations/pm/teams" },
  async (req: ListTeamsRequest): Promise<ListTeamsResponse> => {
    switch (req.type) {
      case "jira": return fetchJiraProjects(req.config);
      case "linear": return fetchLinearTeams(req.config);
      case "asana": return fetchAsanaWorkspaces(req.config);
      case "clickup": return fetchClickUpTeams(req.config);
      case "todoist": return fetchTodoistProjects(req.config);
      case "monday": return fetchMondayBoards(req.config);
      case "notion": return fetchNotionDatabases(req.config);
      case "basecamp": return fetchBasecampProjects(req.config);
      case "github": return fetchGitHubRepos(req.config);
      case "gitlab": return fetchGitLabProjects(req.config);
      default: return { teams: [], teamLabel: "Project", projectLabel: "" };
    }
  }
);

// ─── List projects within a team ───

export const listPMTeamProjects = api(
  { expose: true, method: "POST", path: "/integrations/pm/team-projects" },
  async (req: ListTeamProjectsRequest): Promise<ListTeamProjectsResponse> => {
    switch (req.type) {
      case "linear": return fetchLinearTeamProjects(req.config, req.teamId);
      case "asana": return fetchAsanaWorkspaceProjects(req.config, req.teamId);
      case "clickup": return fetchClickUpSpaces(req.config, req.teamId);
      default: return { projects: [] };
    }
  }
);

// ─── Create issue ───

export const createPMIssue = api(
  { expose: true, method: "POST", path: "/integrations/pm/issues" },
  async (req: CreateIssueRequest): Promise<CreateIssueResponse> => {
    switch (req.type) {
      case "jira": return createJiraIssue(req);
      case "linear": return createLinearIssue(req);
      case "asana": return createAsanaTask(req);
      case "clickup": return createClickUpTask(req);
      case "todoist": return createTodoistTask(req);
      case "monday": return createMondayItem(req);
      case "notion": return createNotionPage(req);
      case "basecamp": return createBasecampTodo(req);
      case "github": return createGitHubIssue(req);
      case "gitlab": return createGitLabIssue(req);
      default: throw new Error(`Unsupported integration type: ${req.type}`);
    }
  }
);

// ═══════════════════════════════════════════
// Team / top-level fetchers
// ═══════════════════════════════════════════

async function fetchJiraProjects(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { host, email, apiToken } = config;
  if (!host || !email || !apiToken) return { teams: [], teamLabel: "Project", projectLabel: "" };
  const base = host.replace(/\/+$/, "");
  const res = await fetch(`${base}/rest/api/3/project?maxResults=50&orderBy=name`, {
    headers: { Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`, Accept: "application/json" },
  });
  if (!res.ok) return { teams: [], teamLabel: "Project", projectLabel: "" };
  const data = await res.json();
  return {
    teams: (data as any[]).map((p: any) => ({ id: p.id, name: p.name, key: p.key })),
    teamLabel: "Project",
    projectLabel: "",
  };
}

async function fetchLinearTeams(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { apiKey } = config;
  if (!apiKey) return { teams: [], teamLabel: "Team", projectLabel: "Project" };
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ teams { nodes { id name key } } }` }),
  });
  if (!res.ok) return { teams: [], teamLabel: "Team", projectLabel: "Project" };
  const data: any = await res.json();
  const teams = data?.data?.teams?.nodes || [];
  return {
    teams: teams.map((t: any) => ({ id: t.id, name: t.name, key: t.key })),
    teamLabel: "Team",
    projectLabel: "Project",
  };
}

async function fetchAsanaWorkspaces(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { accessToken } = config;
  if (!accessToken) return { teams: [], teamLabel: "Workspace", projectLabel: "Project" };
  const res = await fetch("https://app.asana.com/api/1.0/workspaces?limit=50&opt_fields=name,gid", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { teams: [], teamLabel: "Workspace", projectLabel: "Project" };
  const data: any = await res.json();
  return {
    teams: (data.data || []).map((w: any) => ({ id: w.gid, name: w.name })),
    teamLabel: "Workspace",
    projectLabel: "Project",
  };
}

async function fetchClickUpTeams(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { apiKey } = config;
  if (!apiKey) return { teams: [], teamLabel: "Workspace", projectLabel: "Space" };
  const res = await fetch("https://api.clickup.com/api/v2/team", {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return { teams: [], teamLabel: "Workspace", projectLabel: "Space" };
  const data: any = await res.json();
  return {
    teams: (data.teams || []).map((t: any) => ({ id: String(t.id), name: t.name })),
    teamLabel: "Workspace",
    projectLabel: "Space",
  };
}

async function fetchTodoistProjects(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { apiToken } = config;
  if (!apiToken) return { teams: [], teamLabel: "Project", projectLabel: "" };
  const res = await fetch("https://api.todoist.com/rest/v2/projects", {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) return { teams: [], teamLabel: "Project", projectLabel: "" };
  const data = await res.json();
  return {
    teams: (data as any[]).map((p: any) => ({ id: String(p.id), name: p.name })),
    teamLabel: "Project",
    projectLabel: "",
  };
}

async function fetchMondayBoards(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { apiToken } = config;
  if (!apiToken) return { teams: [], teamLabel: "Board", projectLabel: "" };
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { Authorization: apiToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ boards(limit:50) { id name } }` }),
  });
  if (!res.ok) return { teams: [], teamLabel: "Board", projectLabel: "" };
  const data: any = await res.json();
  return {
    teams: (data?.data?.boards || []).map((b: any) => ({ id: String(b.id), name: b.name })),
    teamLabel: "Board",
    projectLabel: "",
  };
}

async function fetchNotionDatabases(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { apiKey } = config;
  if (!apiKey) return { teams: [], teamLabel: "Database", projectLabel: "" };
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({ filter: { value: "database", property: "object" }, page_size: 50 }),
  });
  if (!res.ok) return { teams: [], teamLabel: "Database", projectLabel: "" };
  const data: any = await res.json();
  return {
    teams: (data.results || []).map((db: any) => ({ id: db.id, name: db.title?.[0]?.plain_text || db.id })),
    teamLabel: "Database",
    projectLabel: "",
  };
}

async function fetchBasecampProjects(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { accountId, accessToken } = config;
  if (!accountId || !accessToken) return { teams: [], teamLabel: "Project", projectLabel: "" };
  const res = await fetch(`https://3.basecampapi.com/${accountId}/projects.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!res.ok) return { teams: [], teamLabel: "Project", projectLabel: "" };
  const data = await res.json();
  return {
    teams: (data as any[]).map((p: any) => ({ id: String(p.id), name: p.name })),
    teamLabel: "Project",
    projectLabel: "",
  };
}

// ═══════════════════════════════════════════
// Sub-project fetchers (for two-level tools)
// ═══════════════════════════════════════════

async function fetchLinearTeamProjects(config: Record<string, string>, teamId: string): Promise<ListTeamProjectsResponse> {
  const { apiKey } = config;
  if (!apiKey) return { projects: [] };
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ team(id: "${teamId}") { projects { nodes { id name } } } }` }),
  });
  if (!res.ok) return { projects: [] };
  const data: any = await res.json();
  return {
    projects: (data?.data?.team?.projects?.nodes || []).map((p: any) => ({ id: p.id, name: p.name })),
  };
}

async function fetchAsanaWorkspaceProjects(config: Record<string, string>, workspaceId: string): Promise<ListTeamProjectsResponse> {
  const { accessToken } = config;
  if (!accessToken) return { projects: [] };
  const res = await fetch(`https://app.asana.com/api/1.0/projects?workspace=${workspaceId}&limit=50&opt_fields=name,gid`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { projects: [] };
  const data: any = await res.json();
  return {
    projects: (data.data || []).map((p: any) => ({ id: p.gid, name: p.name })),
  };
}

async function fetchClickUpSpaces(config: Record<string, string>, teamId: string): Promise<ListTeamProjectsResponse> {
  const { apiKey } = config;
  if (!apiKey) return { projects: [] };
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return { projects: [] };
  const data: any = await res.json();
  return {
    projects: (data.spaces || []).map((s: any) => ({ id: String(s.id), name: s.name })),
  };
}

// ═══════════════════════════════════════════
// Issue creation
// ═══════════════════════════════════════════

async function createJiraIssue(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { host, email, apiToken } = req.config;
  const base = host.replace(/\/+$/, "");
  const res = await fetch(`${base}/rest/api/3/issue`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      fields: {
        project: { id: req.teamId },
        summary: req.title,
        description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: req.description }] }] },
        issuetype: { name: "Task" },
      },
    }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err?.errorMessages?.[0] || err?.errors?.summary || `Jira API error ${res.status}`);
  }
  const data: any = await res.json();
  return { issueId: data.id, issueKey: data.key, issueUrl: `${base}/browse/${data.key}` };
}

async function createLinearIssue(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { apiKey } = req.config;
  const mutation = `mutation { issueCreate(input: { teamId: "${req.teamId}", ${req.projectId ? `projectId: "${req.projectId}",` : ""} title: ${JSON.stringify(req.title)}, description: ${JSON.stringify(req.description)} }) { success issue { id identifier url } } }`;
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: mutation }),
  });
  if (!res.ok) throw new Error(`Linear API error ${res.status}`);
  const data: any = await res.json();
  if (!data?.data?.issueCreate?.success) throw new Error(data?.errors?.[0]?.message || "Failed to create Linear issue");
  const issue = data.data.issueCreate.issue;
  return { issueId: issue.id, issueKey: issue.identifier, issueUrl: issue.url };
}

async function createAsanaTask(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { accessToken } = req.config;
  const body: any = { data: { name: req.title, notes: req.description } };
  if (req.projectId) body.data.projects = [req.projectId];
  else body.data.workspace = req.teamId;
  const res = await fetch("https://app.asana.com/api/1.0/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Asana API error ${res.status}`);
  const data: any = await res.json();
  const task = data.data;
  return { issueId: task.gid, issueKey: task.gid, issueUrl: `https://app.asana.com/0/${req.projectId || "0"}/${task.gid}` };
}

async function createClickUpTask(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { apiKey } = req.config;
  // ClickUp needs a list ID. Use the project (space) to find the first list.
  const listId = req.projectId || req.teamId;
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ name: req.title, description: req.description }),
  });
  if (!res.ok) throw new Error(`ClickUp API error ${res.status}`);
  const data: any = await res.json();
  return { issueId: data.id, issueKey: data.id, issueUrl: data.url || "" };
}

async function createTodoistTask(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { apiToken } = req.config;
  const res = await fetch("https://api.todoist.com/rest/v2/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: req.title, description: req.description, project_id: req.teamId }),
  });
  if (!res.ok) throw new Error(`Todoist API error ${res.status}`);
  const data: any = await res.json();
  return { issueId: String(data.id), issueKey: String(data.id), issueUrl: data.url || "" };
}

async function createMondayItem(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { apiToken } = req.config;
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { Authorization: apiToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `mutation { create_item(board_id: ${req.teamId}, item_name: ${JSON.stringify(req.title)}) { id } }` }),
  });
  if (!res.ok) throw new Error(`Monday.com API error ${res.status}`);
  const data: any = await res.json();
  const itemId = data?.data?.create_item?.id;
  return { issueId: String(itemId), issueKey: String(itemId), issueUrl: "" };
}

async function createNotionPage(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { apiKey } = req.config;
  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({
      parent: { database_id: req.teamId },
      properties: { title: { title: [{ text: { content: req.title } }] } },
      children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: req.description } }] } }],
    }),
  });
  if (!res.ok) throw new Error(`Notion API error ${res.status}`);
  const data: any = await res.json();
  return { issueId: data.id, issueKey: data.id, issueUrl: data.url || "" };
}

async function createBasecampTodo(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { accountId, accessToken } = req.config;
  // First find the todoset for the project
  const projRes = await fetch(`https://3.basecampapi.com/${accountId}/projects/${req.teamId}.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!projRes.ok) throw new Error(`Basecamp API error ${projRes.status}`);
  const projData: any = await projRes.json();
  const todoset = (projData.dock || []).find((d: any) => d.name === "todoset");
  if (!todoset) throw new Error("No todoset found in Basecamp project");
  // Create a todolist first, then a todo
  const listRes = await fetch(`${todoset.url}/todolists.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Security Findings", description: "Issues from Opengrep scan" }),
  });
  // If list creation fails, try to find existing
  let todolistUrl = "";
  if (listRes.ok) {
    const listData: any = await listRes.json();
    todolistUrl = listData.todos_url;
  }
  if (!todolistUrl) throw new Error("Failed to create/find Basecamp todolist");
  const todoRes = await fetch(todolistUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: req.title, description: req.description }),
  });
  if (!todoRes.ok) throw new Error(`Basecamp todo creation failed ${todoRes.status}`);
  const todoData: any = await todoRes.json();
  return { issueId: String(todoData.id), issueKey: String(todoData.id), issueUrl: todoData.app_url || "" };
}

// ═══════════════════════════════════════════
// GitHub
// ═══════════════════════════════════════════

async function fetchGitHubRepos(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { token } = config;
  if (!token) return { teams: [], teamLabel: "Repository", projectLabel: "" };
  const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return { teams: [], teamLabel: "Repository", projectLabel: "" };
  const data = await res.json();
  return {
    teams: (data as any[]).map((r: any) => ({ id: String(r.id), name: r.full_name, key: r.full_name })),
    teamLabel: "Repository",
    projectLabel: "",
  };
}

async function createGitHubIssue(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { token } = req.config;
  // teamId holds the repo full_name via the key field
  const team = req.teamId;
  // We stored full_name in key, but teamId is the numeric id. We need the full_name.
  // The frontend sends teamId which is the id. We need to resolve it or use a workaround.
  // Actually let's fetch the repo by id to get full_name
  let fullName = "";
  const repoRes = await fetch(`https://api.github.com/repositories/${team}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (repoRes.ok) {
    const repoData: any = await repoRes.json();
    fullName = repoData.full_name;
  }
  if (!fullName) throw new Error("Could not resolve GitHub repository");
  const res = await fetch(`https://api.github.com/repos/${fullName}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ title: req.title, body: req.description, labels: ["security"] }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err?.message || `GitHub API error ${res.status}`);
  }
  const data: any = await res.json();
  return { issueId: String(data.id), issueKey: `#${data.number}`, issueUrl: data.html_url };
}

// ═══════════════════════════════════════════
// GitLab
// ═══════════════════════════════════════════

async function fetchGitLabProjects(config: Record<string, string>): Promise<ListTeamsResponse> {
  const { host, token } = config;
  if (!token) return { teams: [], teamLabel: "Project", projectLabel: "" };
  const base = (host || "https://gitlab.com").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v4/projects?membership=true&per_page=100&order_by=updated_at`, {
    headers: { "PRIVATE-TOKEN": token },
  });
  if (!res.ok) return { teams: [], teamLabel: "Project", projectLabel: "" };
  const data = await res.json();
  return {
    teams: (data as any[]).map((p: any) => ({ id: String(p.id), name: p.path_with_namespace, key: p.path_with_namespace })),
    teamLabel: "Project",
    projectLabel: "",
  };
}

async function createGitLabIssue(req: CreateIssueRequest): Promise<CreateIssueResponse> {
  const { host, token } = req.config;
  const base = (host || "https://gitlab.com").replace(/\/+$/, "");
  const projectId = encodeURIComponent(req.teamId);
  const res = await fetch(`${base}/api/v4/projects/${projectId}/issues`, {
    method: "POST",
    headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
    body: JSON.stringify({ title: req.title, description: req.description, labels: "security" }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err?.message || err?.error || `GitLab API error ${res.status}`);
  }
  const data: any = await res.json();
  return { issueId: String(data.id), issueKey: `#${data.iid}`, issueUrl: data.web_url };
}
