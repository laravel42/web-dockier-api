export type GitProvider = string;

export type RepoRef = { owner: string; repo: string; branch: string };

export type ConnectionLike = {
  provider: GitProvider;
  personal_token: string;
  endpoint?: string | null;
};

export type ListedRepo = {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
};

const MAX_REPO_PAGES = 10;
const REPOS_PER_PAGE = 100;

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

/** Parse GitHub Link header and return the URL for rel="next", if present. */
export function parseGitHubLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function dedupeRepos(repos: ListedRepo[]): ListedRepo[] {
  const byFullName = new Map<string, ListedRepo>();
  for (const repo of repos) {
    byFullName.set(repo.fullName, repo);
  }
  return [...byFullName.values()];
}

async function listGitHubRepos(origin: string, headers: Record<string, string>): Promise<ListedRepo[]> {
  const repos: ListedRepo[] = [];
  let nextUrl: string | null =
    `${origin}/user/repos?per_page=${REPOS_PER_PAGE}&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member`;

  for (let page = 0; page < MAX_REPO_PAGES && nextUrl; page += 1) {
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) throw new Error(`GitHub API error ${response.status}`);
    const data = (await response.json()) as Array<{
      archived?: boolean;
      name: string;
      full_name: string;
      html_url: string;
      default_branch?: string;
      private?: boolean;
    }>;

    for (const repo of data) {
      if (repo.archived) continue;
      repos.push({
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        defaultBranch: repo.default_branch ?? "main",
        private: Boolean(repo.private),
      });
    }

    if (data.length < REPOS_PER_PAGE) break;
    nextUrl = parseGitHubLinkNext(response.headers.get("Link"));
  }

  return dedupeRepos(repos);
}

async function listGitLabRepos(origin: string, headers: Record<string, string>): Promise<ListedRepo[]> {
  const repos: ListedRepo[] = [];

  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const url =
      `${origin}/api/v4/projects?membership=true&simple=true&per_page=${REPOS_PER_PAGE}` +
      `&page=${page}&order_by=updated_at&archived=false`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`GitLab API error ${response.status}`);
    const data = (await response.json()) as Array<{
      name: string;
      path_with_namespace: string;
      web_url: string;
      default_branch?: string;
      visibility?: string;
    }>;
    if (data.length === 0) break;

    for (const repo of data) {
      repos.push({
        name: repo.name,
        fullName: repo.path_with_namespace,
        url: repo.web_url,
        defaultBranch: repo.default_branch ?? "main",
        private: repo.visibility === "private",
      });
    }

    const nextPage = response.headers.get("X-Next-Page");
    if (!nextPage) break;
  }

  return dedupeRepos(repos);
}

async function listBitbucketRepos(origin: string, headers: Record<string, string>): Promise<ListedRepo[]> {
  const repos: ListedRepo[] = [];
  let nextUrl: string | null = `${origin}/2.0/repositories?role=member&pagelen=${REPOS_PER_PAGE}`;

  for (let page = 0; page < MAX_REPO_PAGES && nextUrl; page += 1) {
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) throw new Error(`Bitbucket API error ${response.status}`);
    const data = (await response.json()) as {
      values?: Array<{
        name: string;
        full_name: string;
        links?: { html?: { href?: string } };
        mainbranch?: { name?: string };
        is_private?: boolean;
      }>;
      next?: string;
    };

    for (const repo of data.values ?? []) {
      repos.push({
        name: repo.name,
        fullName: repo.full_name,
        url: repo.links?.html?.href ?? "",
        defaultBranch: repo.mainbranch?.name ?? "main",
        private: Boolean(repo.is_private),
      });
    }

    nextUrl = data.next ?? null;
  }

  return dedupeRepos(repos);
}

export async function listRepos(connection: ConnectionLike): Promise<ListedRepo[]> {
  const headers = authHeaders(connection);
  const origin = baseUrl(connection.provider, connection.endpoint);
  if (connection.provider === "github") {
    return listGitHubRepos(origin, headers);
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    return listGitLabRepos(origin, headers);
  }

  return listBitbucketRepos(origin, headers);
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
