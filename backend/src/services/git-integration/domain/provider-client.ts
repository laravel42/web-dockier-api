export type GitProvider = string;

export type RepoRef = { owner: string; repo: string; branch: string };

export type ConnectionLike = {
  provider: GitProvider;
  personal_token: string;
  endpoint?: string | null;
};

function baseUrl(provider: GitProvider, endpoint?: string | null): string {
  if (provider === "github") return endpoint || "https://api.github.com";
  if (provider === "gitlab" || provider === "gitlab_self_hosted") return endpoint || "https://gitlab.com";
  return endpoint || "https://api.bitbucket.org";
}

function authHeaders(connection: ConnectionLike): Record<string, string> {
  if (connection.provider === "github") {
    return { Authorization: `Bearer ${connection.personal_token}`, Accept: "application/vnd.github.v3+json" };
  }
  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    return { "PRIVATE-TOKEN": connection.personal_token };
  }
  return { Authorization: `Bearer ${connection.personal_token}` };
}

export async function listRepos(connection: ConnectionLike) {
  const headers = authHeaders(connection);
  const origin = baseUrl(connection.provider, connection.endpoint);
  if (connection.provider === "github") {
    const response = await fetch(`${origin}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, { headers });
    if (!response.ok) throw new Error(`GitHub API error ${response.status}`);
    const data = (await response.json()) as Array<any>;
    return data
      .filter((repo) => !repo.archived)
      .map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        defaultBranch: repo.default_branch ?? "main",
        private: Boolean(repo.private),
      }));
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const response = await fetch(`${origin}/api/v4/projects?membership=true&simple=true&per_page=100&order_by=updated_at&archived=false`, { headers });
    if (!response.ok) throw new Error(`GitLab API error ${response.status}`);
    const data = (await response.json()) as Array<any>;
    return data.map((repo) => ({
      name: repo.name,
      fullName: repo.path_with_namespace,
      url: repo.web_url,
      defaultBranch: repo.default_branch ?? "main",
      private: repo.visibility === "private",
    }));
  }

  const response = await fetch(`${origin}/2.0/repositories?role=member&pagelen=100`, { headers });
  if (!response.ok) throw new Error(`Bitbucket API error ${response.status}`);
  const data = (await response.json()) as { values?: Array<any> };
  return (data.values ?? []).map((repo) => ({
    name: repo.name,
    fullName: repo.full_name,
    url: repo.links?.html?.href ?? "",
    defaultBranch: repo.mainbranch?.name ?? "main",
    private: Boolean(repo.is_private),
  }));
}

export async function listBranches(connection: ConnectionLike, ref: RepoRef): Promise<string[]> {
  const headers = authHeaders(connection);
  const origin = baseUrl(connection.provider, connection.endpoint);

  if (connection.provider === "github") {
    const response = await fetch(`${origin}/repos/${ref.owner}/${ref.repo}/branches?per_page=100`, { headers });
    if (!response.ok) throw new Error(`GitHub API error ${response.status}`);
    return ((await response.json()) as Array<{ name: string }>).map((row) => row.name);
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const projectPath = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const response = await fetch(`${origin}/api/v4/projects/${projectPath}/repository/branches?per_page=100`, { headers });
    if (!response.ok) throw new Error(`GitLab API error ${response.status}`);
    return ((await response.json()) as Array<{ name: string }>).map((row) => row.name);
  }

  const response = await fetch(`${origin}/2.0/repositories/${ref.owner}/${ref.repo}/refs/branches?pagelen=100`, { headers });
  if (!response.ok) throw new Error(`Bitbucket API error ${response.status}`);
  const data = (await response.json()) as { values?: Array<{ name: string }> };
  return (data.values ?? []).map((row) => row.name);
}

export async function getRepoFileTree(connection: ConnectionLike, ref: RepoRef): Promise<string[]> {
  const headers = authHeaders(connection);
  const origin = baseUrl(connection.provider, connection.endpoint);

  if (connection.provider === "github") {
    const response = await fetch(`${origin}/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(ref.branch)}?recursive=1`, { headers });
    if (!response.ok) throw new Error(`GitHub API error ${response.status}`);
    const data = (await response.json()) as { tree?: Array<{ path: string; type: string }> };
    return (data.tree ?? []).filter((entry) => entry.type === "blob").map((entry) => entry.path);
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const projectPath = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const files: string[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const response = await fetch(
        `${origin}/api/v4/projects/${projectPath}/repository/tree?ref=${encodeURIComponent(ref.branch)}&recursive=true&per_page=100&page=${page}`,
        { headers },
      );
      if (!response.ok) break;
      const data = (await response.json()) as Array<{ path: string; type: string }>;
      if (data.length === 0) break;
      for (const entry of data) {
        if (entry.type === "blob") files.push(entry.path);
      }
      if (data.length < 100) break;
    }
    return files;
  }

  const response = await fetch(`${origin}/2.0/repositories/${ref.owner}/${ref.repo}/src/${encodeURIComponent(ref.branch)}/?pagelen=100`, { headers });
  if (!response.ok) throw new Error(`Bitbucket API error ${response.status}`);
  const data = (await response.json()) as { values?: Array<{ path: string; type: string }> };
  return (data.values ?? []).filter((entry) => entry.type === "commit_file").map((entry) => entry.path);
}

export async function fetchRepoFile(connection: ConnectionLike, ref: RepoRef, path: string): Promise<string | null> {
  const headers = authHeaders(connection);
  const origin = baseUrl(connection.provider, connection.endpoint);

  if (connection.provider === "github") {
    const response = await fetch(`${origin}/repos/${ref.owner}/${ref.repo}/contents/${path}?ref=${encodeURIComponent(ref.branch)}`, {
      headers: { ...headers, Accept: "application/vnd.github.v3.raw" },
    });
    if (!response.ok) return null;
    return await response.text();
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const projectPath = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const filePath = encodeURIComponent(path);
    const response = await fetch(`${origin}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=${encodeURIComponent(ref.branch)}`, { headers });
    if (!response.ok) return null;
    return await response.text();
  }

  const response = await fetch(`${origin}/2.0/repositories/${ref.owner}/${ref.repo}/src/${encodeURIComponent(ref.branch)}/${path}`, { headers });
  if (!response.ok) return null;
  return await response.text();
}
