import { createDomainErrorClass } from "../../../../shared/supabase/errors.js";

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
/** Page budget when serving a search — keeps provider-side search responsive. */
export const SEARCH_MAX_PAGES = 3;

export interface ListReposOptions {
  /** Maximum pages to walk. Defaults to MAX_REPO_PAGES. Use 1 for a fast first page. */
  maxPages?: number;
  /** Page size requested from the provider. Defaults to REPOS_PER_PAGE. */
  perPage?: number;
  /**
   * Search term. Passed to the provider natively where supported
   * (GitLab `search`, Bitbucket `q=name~`); filtered locally otherwise (GitHub,
   * whose /user/repos endpoint has no search parameter).
   */
  search?: string;
}

/** Case-insensitive match against the repo name and its full path. */
export function matchesRepoSearch(repo: ListedRepo, search?: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return repo.name.toLowerCase().includes(term) || repo.fullName.toLowerCase().includes(term);
}

/**
 * Error raised when an upstream git provider API returns a non-OK response.
 * Extends DomainError so the global handler maps it to the right HTTP status
 * (e.g. a provider 403 → 403 Forbidden) instead of a generic 500 — and the
 * provider's own message (e.g. "requires ... [Project: Read]") reaches the user.
 */
export const ProviderApiError = createDomainErrorClass<
  "unauthorized" | "forbidden" | "not_found" | "too_many_requests" | "service_unavailable" | "bad_request"
>("ProviderApiError");

function statusToDomainCode(status: number) {
  if (status === 401) return "unauthorized" as const;
  if (status === 403) return "forbidden" as const;
  if (status === 404) return "not_found" as const;
  if (status === 429) return "too_many_requests" as const;
  if (status >= 500) return "service_unavailable" as const;
  return "bad_request" as const;
}

/** Pull a human-readable detail out of a provider error body (GitHub/GitLab/Bitbucket shapes). */
function extractProviderDetail(body: string): string {
  try {
    const obj = JSON.parse(body) as Record<string, unknown>;
    const nested = obj.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : null;
    const detail =
      (typeof obj.error_description === "string" && obj.error_description) ||
      (typeof obj.message === "string" && obj.message) ||
      (nested && typeof nested.message === "string" && nested.message) ||
      (typeof obj.error === "string" && obj.error) ||
      "";
    return detail || body;
  } catch {
    return body;
  }
}

function providerApiError(provider: string, status: number, body: string) {
  const detail = extractProviderDetail(body).slice(0, 500);
  return new ProviderApiError(`${provider} API error ${status}: ${detail}`, statusToDomainCode(status));
}

/**
 * Resolve the API base URL for a provider, honoring a custom `endpoint`
 * (self-hosted GitLab, GitHub Enterprise) and falling back to the public host.
 * Canonical source — reused by the provider-specific client modules.
 */
export function baseUrl(provider: GitProvider, endpoint?: string | null): string {
  if (provider === "github") return endpoint || "https://api.github.com";
  if (provider === "gitlab" || provider === "gitlab_self_hosted") return endpoint || "https://gitlab.com";
  return endpoint || "https://api.bitbucket.org";
}

/**
 * Build the auth headers for a provider's REST API. Canonical source — reused
 * by the provider-specific client modules. Note: read paths that need a
 * different `Accept` (e.g. raw file content) spread this and override it.
 */
export function authHeaders(connection: ConnectionLike): Record<string, string> {
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

async function listGitHubRepos(
  origin: string,
  headers: Record<string, string>,
  opts: ListReposOptions = {},
): Promise<ListedRepo[]> {
  const perPage = opts.perPage ?? REPOS_PER_PAGE;
  const maxPages = opts.maxPages ?? MAX_REPO_PAGES;
  const repos: ListedRepo[] = [];
  let nextUrl: string | null =
    `${origin}/user/repos?per_page=${perPage}&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member`;

  for (let page = 0; page < maxPages && nextUrl; page += 1) {
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) throw providerApiError("GitHub", response.status, await readErrorBody(response));
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
      const mapped: ListedRepo = {
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        defaultBranch: repo.default_branch ?? "main",
        private: Boolean(repo.private),
      };
      // GitHub's /user/repos has no search parameter, so filter locally.
      if (matchesRepoSearch(mapped, opts.search)) repos.push(mapped);
    }

    // Enough matches for the caller's page — stop early instead of walking on.
    if (opts.search && repos.length >= perPage) break;
    if (data.length < perPage) break;
    nextUrl = parseGitHubLinkNext(response.headers.get("Link"));
  }

  return dedupeRepos(repos);
}

/** Read a response body for error reporting without throwing. Truncated to keep logs sane. */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    return text ? text.slice(0, 500) : response.statusText;
  } catch {
    return response.statusText;
  }
}

type GitLabProject = {
  name: string;
  path_with_namespace: string;
  web_url?: string;
  default_branch?: string;
  visibility?: string;
};

function mapGitLabProject(origin: string, project: GitLabProject): ListedRepo {
  return {
    name: project.name,
    fullName: project.path_with_namespace,
    url: project.web_url || `${origin}/${project.path_with_namespace}`,
    defaultBranch: project.default_branch ?? "main",
    // Absent visibility (associations endpoint omits it) → treat as private (safer default).
    private: project.visibility ? project.visibility !== "public" : true,
  };
}

type ListAttempt =
  | { ok: true; repos: ListedRepo[] }
  | { ok: false; status: number; body: string };

/**
 * Classic discovery via the projects list. Works for classic PATs and
 * fine-grained tokens that were granted the projects-list permission.
 */
async function listGitLabViaMembership(
  origin: string,
  headers: Record<string, string>,
  opts: ListReposOptions = {},
): Promise<ListAttempt> {
  const perPage = opts.perPage ?? REPOS_PER_PAGE;
  const maxPages = opts.maxPages ?? MAX_REPO_PAGES;
  const repos: ListedRepo[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url =
      `${origin}/api/v4/projects?membership=true&simple=true&per_page=${perPage}` +
      `&page=${page}&order_by=updated_at&archived=false` +
      // GitLab supports server-side search on this endpoint.
      (opts.search ? `&search=${encodeURIComponent(opts.search)}` : "");
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return { ok: false, status: response.status, body: await readErrorBody(response) };
    }
    const data = (await response.json()) as GitLabProject[];
    if (data.length === 0) break;

    for (const project of data) repos.push(mapGitLabProject(origin, project));

    if (!response.headers.get("X-Next-Page")) break;
  }

  return { ok: true, repos };
}

/**
 * Token-scoped discovery via the token's associations. This is the correct
 * discovery path for fine-grained PATs, which cannot always call the
 * projects-list endpoint but can enumerate what the token is authorized for.
 *
 * See: GET /personal_access_tokens/self/associations (GitLab 17.6+).
 */
async function listGitLabViaAssociations(
  origin: string,
  headers: Record<string, string>,
  opts: ListReposOptions = {},
): Promise<ListAttempt> {
  const perPage = opts.perPage ?? REPOS_PER_PAGE;
  const maxPages = opts.maxPages ?? MAX_REPO_PAGES;
  const repos: ListedRepo[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${origin}/api/v4/personal_access_tokens/self/associations?per_page=${perPage}&page=${page}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return { ok: false, status: response.status, body: await readErrorBody(response) };
    }
    const data = (await response.json()) as { projects?: GitLabProject[] };
    const projects = data.projects ?? [];
    if (projects.length === 0) break;

    for (const project of projects) {
      const mapped = mapGitLabProject(origin, project);
      // This endpoint has no search parameter — filter locally.
      if (matchesRepoSearch(mapped, opts.search)) repos.push(mapped);
    }

    if (opts.search && repos.length >= perPage) break;
    if (!response.headers.get("X-Next-Page")) break;
  }

  return { ok: true, repos };
}

async function listGitLabRepos(
  origin: string,
  headers: Record<string, string>,
  opts: ListReposOptions = {},
): Promise<ListedRepo[]> {
  const membership = await listGitLabViaMembership(origin, headers, opts);
  if (membership.ok) return dedupeRepos(membership.repos);

  // Fine-grained tokens often lack permission for the projects-list endpoint
  // (403) even though they can access specific projects. Fall back to the
  // token's associations, which is the discovery path built for such tokens.
  if (membership.status === 403) {
    const associations = await listGitLabViaAssociations(origin, headers, opts);
    if (associations.ok) return dedupeRepos(associations.repos);

    // Both listing endpoints are USER-boundary operations. Fine-grained tokens
    // separate permissions into "Group and project", "User", and "Global"
    // boundaries — granting Project: Read under Group and project is NOT enough
    // to list projects, which requires Project: Read under the User boundary.
    if (associations.status === 403) {
      throw new ProviderApiError(
        `GitLab denied repository listing: ${extractProviderDetail(membership.body)} ` +
          `Repository listing is a user-scoped operation: in your token's permissions, enable ` +
          `"Project: Read" under the User boundary — this is a separate grant from the ` +
          `"Project: Read" in the Group and project section, which only allows reading ` +
          `individual projects. (Alternatively, "Personal Access Token: Read" under the User ` +
          `boundary also enables discovery.)`,
        "forbidden",
      );
    }
  }

  // Surface the provider's own message (e.g. the missing granular permission)
  // as a proper HTTP status instead of an opaque 500.
  throw providerApiError("GitLab", membership.status, membership.body);
}

async function listBitbucketRepos(
  origin: string,
  headers: Record<string, string>,
  opts: ListReposOptions = {},
): Promise<ListedRepo[]> {
  const perPage = opts.perPage ?? REPOS_PER_PAGE;
  const maxPages = opts.maxPages ?? MAX_REPO_PAGES;
  const repos: ListedRepo[] = [];
  let nextUrl: string | null =
    `${origin}/2.0/repositories?role=member&pagelen=${perPage}` +
    // Bitbucket supports server-side filtering via its query language.
    (opts.search ? `&q=${encodeURIComponent(`name~"${opts.search}"`)}` : "");

  for (let page = 0; page < maxPages && nextUrl; page += 1) {
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) throw providerApiError("Bitbucket", response.status, await readErrorBody(response));
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

export async function listRepos(
  connection: ConnectionLike,
  opts: ListReposOptions = {},
): Promise<ListedRepo[]> {
  const headers = authHeaders(connection);
  const origin = baseUrl(connection.provider, connection.endpoint);
  if (connection.provider === "github") {
    return listGitHubRepos(origin, headers, opts);
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    return listGitLabRepos(origin, headers, opts);
  }

  return listBitbucketRepos(origin, headers, opts);
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
  const file = await fetchRepoFileBuffer(connection, ref, path);
  if (!file) return null;
  return file.buffer.toString("utf8");
}

export async function fetchRepoFileBuffer(
  connection: ConnectionLike,
  ref: RepoRef,
  path: string,
): Promise<{ buffer: Buffer } | null> {
  const headers = authHeaders(connection);
  const origin = baseUrl(connection.provider, connection.endpoint);

  if (connection.provider === "github") {
    const response = await fetch(`${origin}/repos/${ref.owner}/${ref.repo}/contents/${path}?ref=${encodeURIComponent(ref.branch)}`, {
      headers: { ...headers, Accept: "application/vnd.github.v3.raw" },
    });
    if (!response.ok) return null;
    return { buffer: Buffer.from(await response.arrayBuffer()) };
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const projectPath = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const filePath = encodeURIComponent(path);
    const response = await fetch(`${origin}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=${encodeURIComponent(ref.branch)}`, { headers });
    if (!response.ok) return null;
    return { buffer: Buffer.from(await response.arrayBuffer()) };
  }

  const response = await fetch(`${origin}/2.0/repositories/${ref.owner}/${ref.repo}/src/${encodeURIComponent(ref.branch)}/${path}`, { headers });
  if (!response.ok) return null;
  return { buffer: Buffer.from(await response.arrayBuffer()) };
}
