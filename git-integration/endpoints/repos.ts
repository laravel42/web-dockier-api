import { api, APIError } from "encore.dev/api";
import { db, type GitRepo } from "../shared";
import { throwProviderError, parseRepoUrl } from "../helpers";

export const listRepos = api(
  { method: "GET", path: "/git/connections/:connectionId/repos", auth: true },
  async (params: { connectionId: string; refresh?: boolean }): Promise<{ repos: GitRepo[]; cached: boolean }> => {
    const conn = await db.queryRow<{ provider: string; personal_token: string; endpoint: string }>`
      SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");

    // Check cache (unless refresh requested)
    if (!params.refresh) {
      try {
        const cached = await db.queryRow<{ repos: string }>`
          SELECT repos FROM repo_cache WHERE connection_id = ${params.connectionId}`;
        if (cached) {
          const repos = typeof cached.repos === "string" ? JSON.parse(cached.repos) : cached.repos;
          return { repos: repos as GitRepo[], cached: true };
        }
      } catch {}
    }

    const repos: GitRepo[] = [];
    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, { headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" } });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitHub");
      for (const r of data) {
        if (r.archived) continue;
        repos.push({ name: r.name, fullName: r.full_name, url: r.html_url, defaultBranch: r.default_branch, private: r.private });
      }
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const res = await fetch(`${baseUrl}/api/v4/projects?membership=true&simple=true&per_page=100&order_by=updated_at&archived=false`, { headers: { "PRIVATE-TOKEN": conn.personal_token } });
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitLab");
      for (const r of data) {
        if (r.marked_for_deletion_at || r.marked_for_deletion_on) continue;
        repos.push({ name: r.name, fullName: r.path_with_namespace, url: r.web_url, defaultBranch: r.default_branch || "main", private: r.visibility === "private" });
      }
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories?role=member&pagelen=100`, { headers: { Authorization: `Bearer ${conn.personal_token}` } });
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      const data = (await res.json()) as { values?: Array<any> };
      for (const r of data.values || []) repos.push({ name: r.name, fullName: r.full_name, url: r.links.html.href, defaultBranch: r.mainbranch?.name || "main", private: r.is_private });
    }

    // Cache the result
    try {
      await db.exec`
        INSERT INTO repo_cache (connection_id, repos, created_at)
        VALUES (${params.connectionId}, ${JSON.stringify(repos)}::jsonb, NOW())
        ON CONFLICT (connection_id) DO UPDATE SET repos = ${JSON.stringify(repos)}::jsonb, created_at = NOW()`;
    } catch {}

    return { repos, cached: false };
  }
);

export const listBranches = api(
  { method: "GET", path: "/git/connections/:connectionId/repo-branches", auth: true },
  async (params: { connectionId: string; owner: string; repo: string }): Promise<{ branches: string[] }> => {
    const conn = await db.queryRow<{ provider: string; personal_token: string; endpoint: string }>`
      SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");
    const branches: string[] = [];
    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" };
      const res = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/branches?per_page=100`, { headers });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitHub");
      for (const b of data) branches.push(b.name);
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/branches?per_page=100`, { headers: { "PRIVATE-TOKEN": conn.personal_token } });
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitLab");
      for (const b of data) branches.push(b.name);
    }
    return { branches };
  }
);

export const getConnectionBranches = api(
  { method: "GET", path: "/git/connections/:connectionId/branches", auth: true },
  async (params: { connectionId: string }): Promise<{ branches: string[] }> => {
    const conn = await db.queryRow<{ provider: string; personal_token: string; repo_url: string; endpoint: string }>`
      SELECT provider, personal_token, repo_url, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");
    if (!conn.repo_url) throw APIError.failedPrecondition("No repo URL configured");
    const parsed = parseRepoUrl(conn.repo_url);
    if (!parsed) throw APIError.invalidArgument("Could not parse owner/repo from URL");
    const branches: string[] = [];
    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${parsed.owner}/${parsed.repo}/branches?per_page=100`, { headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" } });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitHub");
      for (const b of data) branches.push(b.name);
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const gitlabBase = conn.endpoint || (conn.provider === "gitlab_self_hosted" ? parsed.baseUrl : "https://gitlab.com");
      const projectPath = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
      const res = await fetch(`${gitlabBase}/api/v4/projects/${projectPath}/repository/branches?per_page=100`, { headers: { "PRIVATE-TOKEN": conn.personal_token } });
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitLab");
      for (const b of data) branches.push(b.name);
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories/${parsed.owner}/${parsed.repo}/refs/branches?pagelen=100`, { headers: { Authorization: `Bearer ${conn.personal_token}` } });
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      const data = (await res.json()) as { values?: Array<{ name: string }> };
      for (const b of data.values || []) branches.push(b.name);
    }
    return { branches };
  }
);

interface RepoFile { path: string; type: "file" | "dir"; size: number; }

export const getRepoTree = api(
  { method: "GET", path: "/git/connections/:connectionId/repo-tree", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string }): Promise<{ files: RepoFile[] }> => {
    const conn = await db.queryRow<{ provider: string; personal_token: string; endpoint: string }>`
      SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");
    const branch = params.branch || "main";
    const files: RepoFile[] = [];
    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" } });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = await res.json() as any;
      for (const item of data.tree || []) { if (item.type === "blob") files.push({ path: item.path, type: "file", size: item.size || 0 }); }
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      let page = 1;
      while (page <= 20) {
        const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=100&page=${page}`, { headers: { "PRIVATE-TOKEN": conn.personal_token } });
        if (!res.ok) { if (page === 1) throwProviderError("GitLab", res.status, res.statusText); break; }
        const data = await res.json() as any[];
        if (!Array.isArray(data) || data.length === 0) break;
        for (const item of data) { if (item.type === "blob") files.push({ path: item.path, type: "file", size: 0 }); }
        const nextPage = res.headers.get("x-next-page");
        if (!nextPage || nextPage === "" || data.length < 100) break;
        page++;
      }
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/src/${encodeURIComponent(branch)}/?pagelen=100&max_depth=10`, { headers: { Authorization: `Bearer ${conn.personal_token}` } });
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      const data = await res.json() as any;
      for (const item of data.values || []) { if (item.type === "commit_file") files.push({ path: item.path, type: "file", size: item.size || 0 }); }
    }
    return { files };
  }
);

export const getFileContent = api(
  { method: "GET", path: "/git/connections/:connectionId/file-content", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch: string; path: string }): Promise<{ content: string }> => {
    const conn = await db.queryRow<{ provider: string; personal_token: string; endpoint: string }>`
      SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");
    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/contents/${params.path}?ref=${encodeURIComponent(params.branch)}`, { headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3.raw" } });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      return { content: await res.text() };
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      const filePath = encodeURIComponent(params.path);
      const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=${encodeURIComponent(params.branch)}`, { headers: { "PRIVATE-TOKEN": conn.personal_token } });
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      return { content: await res.text() };
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/src/${encodeURIComponent(params.branch)}/${params.path}`, { headers: { Authorization: `Bearer ${conn.personal_token}` } });
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      return { content: await res.text() };
    }
    throw APIError.unimplemented("File content not supported for this provider");
  }
);

// ─── List Repo Members (for assignee/reviewer selection) ───

export const listRepoMembers = api(
  { method: "GET", path: "/git/connections/:connectionId/repo-members", auth: true },
  async (params: { connectionId: string; owner: string; repo: string }): Promise<{ members: Array<{ id: string; username: string; name: string; avatarUrl: string }> }> => {
    const conn = await db.queryRow<{ provider: string; personal_token: string; endpoint: string }>`
      SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");
    const members: Array<{ id: string; username: string; name: string; avatarUrl: string }> = [];
    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/collaborators?per_page=100`, {
        headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" },
      });
      if (res.ok) {
        const data = await res.json() as Array<{ id: number; login: string; avatar_url: string }>;
        for (const u of data) members.push({ id: u.login, username: u.login, name: u.login, avatarUrl: u.avatar_url });
      }
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/members/all?per_page=100`, {
        headers: { "PRIVATE-TOKEN": conn.personal_token },
      });
      if (res.ok) {
        const data = await res.json() as Array<{ id: number; username: string; name: string; avatar_url: string }>;
        for (const u of data) members.push({ id: String(u.id), username: u.username, name: u.name || u.username, avatarUrl: u.avatar_url });
      }
    }
    return { members };
  }
);
