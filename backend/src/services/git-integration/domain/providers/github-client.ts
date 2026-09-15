/**
 * GitHub API Client
 *
 * Centralizes all raw GitHub REST API calls behind typed methods.
 * Handles authentication headers, base URL resolution (for GitHub Enterprise),
 * and consistent error handling.
 *
 * Used by git-integration routes for operations not covered by provider-client.ts
 * (which handles cross-provider abstractions like listRepos, listBranches, etc.).
 */

import type { ConnectionLike } from "./provider-client.js";
import { authHeaders, baseUrl } from "./provider-client.js";
import { DomainError } from "../../../../shared/supabase/errors.js";

export class GitHubApiError extends DomainError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(message, "bad_request");
    this.name = "GitHubApiError";
  }
}

function getBaseUrl(connection: ConnectionLike): string {
  return baseUrl(connection.provider, connection.endpoint);
}

function getHeaders(connection: ConnectionLike): Record<string, string> {
  return authHeaders(connection);
}

function assertOk(response: Response, context: string): void {
  if (!response.ok) {
    throw new GitHubApiError(
      `GitHub API error ${response.status}: ${response.statusText} (${context})`,
      response.status,
      response.statusText,
    );
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GitHubCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorLogin: string;
  authorAvatar: string;
  date: string;
  url: string;
  additions: number;
  deletions: number;
}

export interface GitHubRepoStats {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  language: string;
}

export interface GitHubContributor {
  name: string;
  avatarUrl: string;
  commits: number;
  profileUrl: string;
  additions: number;
  deletions: number;
}

export interface GitHubCollaborator {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
  comments: number;
  labels: Array<{ name: string; color: string }>;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
  draft: boolean;
}

export interface GitHubIssueResult {
  issueId: string;
  issueUrl: string;
  issueNumber: number;
}

interface GitHubCommitApiItem {
  sha?: string;
  html_url?: string;
  author?: { login?: string; avatar_url?: string };
  commit?: { message?: string; author?: { name?: string }; committer?: { date?: string } };
}

interface GitHubRepoInfoApiItem {
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  subscribers_count?: number;
  language?: string;
}

interface GitHubContributorApiItem {
  login?: string;
  avatar_url?: string;
  contributions?: number;
  html_url?: string;
}

interface GitHubContributorStatsApiItem {
  total?: number;
  weeks?: Array<{ a?: number; d?: number; c?: number }>;
  author?: { login?: string; avatar_url?: string; html_url?: string };
}

interface GitHubIssueApiItem {
  id?: string | number;
  html_url?: string;
  number?: number;
}

// ─── Client Methods ──────────────────────────────────────────────────────────

/**
 * Fetch per-commit line stats (additions/deletions). The commits list endpoint
 * omits these, so each commit must be fetched individually.
 */
async function getCommitStats(
  baseUrl: string,
  headers: Record<string, string>,
  owner: string,
  repo: string,
  sha: string,
): Promise<{ additions: number; deletions: number }> {
  try {
    const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/commits/${sha}`, { headers });
    if (!res.ok) return { additions: 0, deletions: 0 };
    const data = (await res.json()) as { stats?: { additions?: number; deletions?: number } };
    return { additions: data.stats?.additions ?? 0, deletions: data.stats?.deletions ?? 0 };
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

/**
 * List recent commits for a branch. When `includeStats` is set, each commit's
 * line additions/deletions are fetched (one extra request per commit).
 */
export async function listCommits(
  connection: ConnectionLike,
  params: { owner: string; repo: string; branch: string; limit: number; includeStats?: boolean },
): Promise<GitHubCommit[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, branch, limit, includeStats } = params;

  const res = await fetch(
    `${baseUrl}/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`,
    { headers },
  );
  assertOk(res, `listCommits ${owner}/${repo}`);

  const data = (await res.json()) as GitHubCommitApiItem[];
  const commits = data.map((c) => ({
    hash: c.sha ?? "",
    shortHash: c.sha?.substring(0, 7) ?? "",
    message: c.commit?.message?.split("\n")[0] ?? "",
    author: c.commit?.author?.name ?? c.author?.login ?? "",
    authorLogin: c.author?.login ?? "",
    authorAvatar: c.author?.avatar_url ?? "",
    date: c.commit?.committer?.date ?? "",
    url: c.html_url ?? "",
    additions: 0,
    deletions: 0,
  }));

  if (includeStats) {
    await Promise.all(
      commits.map(async (commit) => {
        if (!commit.hash) return;
        const stats = await getCommitStats(baseUrl, headers, owner, repo, commit.hash);
        commit.additions = stats.additions;
        commit.deletions = stats.deletions;
      }),
    );
  }

  return commits;
}

/**
 * Get repository metadata (stars, forks, issues, watchers, language).
 */
export async function getRepoInfo(
  connection: ConnectionLike,
  params: { owner: string; repo: string },
): Promise<GitHubRepoStats> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo } = params;

  const res = await fetch(`${baseUrl}/repos/${owner}/${repo}`, { headers });
  assertOk(res, `getRepoInfo ${owner}/${repo}`);

  const data = (await res.json()) as GitHubRepoInfoApiItem;
  return {
    stars: data.stargazers_count ?? 0,
    forks: data.forks_count ?? 0,
    openIssues: data.open_issues_count ?? 0,
    watchers: data.subscribers_count ?? 0,
    language: data.language ?? "",
  };
}

/**
 * Get repository language breakdown (percentages).
 */
export async function getLanguages(
  connection: ConnectionLike,
  params: { owner: string; repo: string },
): Promise<Record<string, number>> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo } = params;

  const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/languages`, { headers });
  if (!res.ok) return {};

  const languageData = (await res.json()) as Record<string, number>;
  const total = Object.values(languageData).reduce((sum, value) => sum + value, 0);
  if (total === 0) return {};

  return Object.fromEntries(
    Object.entries(languageData).map(([key, value]) => [key, Math.round((value / total) * 1000) / 10]),
  );
}

/**
 * Fetch per-contributor stats (commits + lines added/deleted) from the
 * `stats/contributors` endpoint. GitHub computes these asynchronously and may
 * respond with 202 while generating; we retry briefly, then signal the caller
 * to fall back by returning `null`.
 */
async function getContributorStats(
  baseUrl: string,
  headers: Record<string, string>,
  owner: string,
  repo: string,
  host: string,
): Promise<GitHubContributor[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/stats/contributors`, { headers });
    if (res.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (!res.ok || res.status === 204) return null;

    const data = (await res.json()) as GitHubContributorStatsApiItem[];
    if (!Array.isArray(data) || data.length === 0) return null;

    return data
      .map((item) => {
        const login = String(item.author?.login ?? "");
        let additions = 0;
        let deletions = 0;
        for (const week of item.weeks ?? []) {
          additions += week.a ?? 0;
          deletions += week.d ?? 0;
        }
        return {
          name: login,
          avatarUrl: item.author?.avatar_url ?? "",
          commits: item.total ?? 0,
          profileUrl: item.author?.html_url ?? (login ? `${host}/${login}` : ""),
          additions,
          deletions,
        };
      })
      .filter((contributor) => contributor.name);
  }
  return null;
}

/**
 * Get repository contributors. Prefers the richer `stats/contributors` data
 * (includes lines added/deleted); falls back to the basic contributors list.
 */
export async function getContributors(
  connection: ConnectionLike,
  params: { owner: string; repo: string; limit?: number },
): Promise<GitHubContributor[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, limit = 20 } = params;
  const host = baseUrl.replace(/\/api\.github\.com$/, "https://github.com");

  const stats = await getContributorStats(baseUrl, headers, owner, repo, host);
  if (stats) {
    return stats.sort((a, b) => b.commits - a.commits).slice(0, limit);
  }

  const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/contributors?per_page=${limit}`, { headers });
  if (!res.ok || res.status === 204) return [];

  const data = (await res.json()) as GitHubContributorApiItem[];
  return data.map((contributor) => {
    const login = String(contributor.login ?? "");
    return {
      name: login,
      avatarUrl: contributor.avatar_url ?? "",
      commits: contributor.contributions ?? 0,
      profileUrl: contributor.html_url ?? (login ? `${host}/${login}` : ""),
      additions: 0,
      deletions: 0,
    };
  });
}

interface GitHubIssueListApiItem {
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  created_at?: string;
  comments?: number;
  draft?: boolean;
  pull_request?: unknown;
  user?: { login?: string; avatar_url?: string };
  labels?: Array<{ name?: string; color?: string }>;
}

/**
 * List open issues for a repository. The GitHub issues endpoint also returns
 * pull requests, so entries with a `pull_request` field are filtered out.
 */
export async function listIssues(
  connection: ConnectionLike,
  params: { owner: string; repo: string; limit?: number },
): Promise<GitHubIssue[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, limit = 10 } = params;

  const res = await fetch(
    `${baseUrl}/repos/${owner}/${repo}/issues?state=open&per_page=${limit}&sort=created&direction=desc`,
    { headers },
  );
  if (!res.ok) return [];

  const data = (await res.json()) as GitHubIssueListApiItem[];
  return data
    .filter((item) => !item.pull_request)
    .map((item) => ({
      number: item.number ?? 0,
      title: item.title ?? "",
      body: item.body ?? "",
      url: item.html_url ?? "",
      author: item.user?.login ?? "",
      authorAvatar: item.user?.avatar_url ?? "",
      createdAt: item.created_at ?? "",
      comments: item.comments ?? 0,
      labels: (item.labels ?? []).map((label) => ({
        name: label.name ?? "",
        color: label.color ? `#${label.color}` : "",
      })),
    }));
}

/**
 * List open pull requests for a repository.
 */
export async function listPullRequests(
  connection: ConnectionLike,
  params: { owner: string; repo: string; limit?: number },
): Promise<GitHubPullRequest[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, limit = 10 } = params;

  const res = await fetch(
    `${baseUrl}/repos/${owner}/${repo}/pulls?state=open&per_page=${limit}&sort=created&direction=desc`,
    { headers },
  );
  if (!res.ok) return [];

  const data = (await res.json()) as GitHubIssueListApiItem[];
  return data.map((item) => ({
    number: item.number ?? 0,
    title: item.title ?? "",
    body: item.body ?? "",
    url: item.html_url ?? "",
    author: item.user?.login ?? "",
    authorAvatar: item.user?.avatar_url ?? "",
    createdAt: item.created_at ?? "",
    draft: item.draft ?? false,
  }));
}

/**
 * List repository collaborators.
 */
export async function getCollaborators(
  connection: ConnectionLike,
  params: { owner: string; repo: string },
): Promise<GitHubCollaborator[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo } = params;

  const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/collaborators?per_page=100`, { headers });
  if (!res.ok) return [];

  const data = (await res.json()) as Array<{ id: number; login: string; avatar_url: string }>;
  return data.map((member) => ({
    id: member.login,
    username: member.login,
    name: member.login,
    avatarUrl: member.avatar_url,
  }));
}

/**
 * Create a GitHub issue.
 */
export async function createIssue(
  connection: ConnectionLike,
  params: { owner: string; repo: string; title: string; body: string; assignee?: string },
): Promise<GitHubIssueResult> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, title, body, assignee } = params;

  const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      body,
      ...(assignee ? { assignees: [assignee] } : {}),
    }),
  });
  assertOk(res, `createIssue ${owner}/${repo}`);

  const data = (await res.json()) as GitHubIssueApiItem;
  return {
    issueId: String(data.id),
    issueUrl: data.html_url ?? "",
    issueNumber: data.number ?? 0,
  };
}

/**
 * Close a GitHub issue by setting its state to "closed".
 */
export async function closeIssue(
  connection: ConnectionLike,
  params: { owner: string; repo: string; issueNumber: number },
): Promise<void> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, issueNumber } = params;

  const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ state: "closed" }),
  });
  assertOk(res, `closeIssue ${owner}/${repo}#${issueNumber}`);
}

/**
 * Create a branch from a given base (defaults to the repo's default branch HEAD).
 */
export async function createBranch(
  connection: ConnectionLike,
  params: { owner: string; repo: string; branchName: string; baseBranch?: string },
): Promise<{ ref: string; sha: string }> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, branchName, baseBranch } = params;

  // Get the SHA of the base branch (default: main)
  const base = baseBranch || "main";
  const refRes = await fetch(`${baseUrl}/repos/${owner}/${repo}/git/ref/heads/${base}`, {
    headers,
  });
  assertOk(refRes, `getBranchRef ${owner}/${repo}:${base}`);
  const refData = (await refRes.json()) as { object: { sha: string } };
  const sha = refData.object.sha;

  // Create the new branch
  const createRes = await fetch(`${baseUrl}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha,
    }),
  });
  assertOk(createRes, `createBranch ${owner}/${repo}:${branchName}`);
  const createData = (await createRes.json()) as { ref: string; object: { sha: string } };
  return { ref: createData.ref, sha: createData.object.sha };
}
