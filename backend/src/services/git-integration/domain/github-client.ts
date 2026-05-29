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

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function getBaseUrl(connection: ConnectionLike): string {
  return connection.endpoint || "https://api.github.com";
}

function getHeaders(connection: ConnectionLike): Record<string, string> {
  return {
    Authorization: `Bearer ${connection.personal_token}`,
    Accept: "application/vnd.github.v3+json",
  };
}

async function assertOk(response: Response, context: string): Promise<void> {
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
  authorAvatar: string;
  date: string;
  url: string;
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
}

export interface GitHubCollaborator {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
}

export interface GitHubIssueResult {
  issueId: string;
  issueUrl: string;
  issueNumber: number;
}

// ─── Client Methods ──────────────────────────────────────────────────────────

/**
 * List recent commits for a branch.
 */
export async function listCommits(
  connection: ConnectionLike,
  params: { owner: string; repo: string; branch: string; limit: number },
): Promise<GitHubCommit[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, branch, limit } = params;

  const res = await fetch(
    `${baseUrl}/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`,
    { headers },
  );
  assertOk(res, `listCommits ${owner}/${repo}`);

  const data = (await res.json()) as any[];
  return data.map((c) => ({
    hash: c.sha ?? "",
    shortHash: c.sha?.substring(0, 7) ?? "",
    message: c.commit?.message?.split("\n")[0] ?? "",
    author: c.commit?.author?.name ?? c.author?.login ?? "",
    authorAvatar: c.author?.avatar_url ?? "",
    date: c.commit?.committer?.date ?? "",
    url: c.html_url ?? "",
  }));
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
  await assertOk(res, `getRepoInfo ${owner}/${repo}`);

  const data = (await res.json()) as any;
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
 * Get repository contributors.
 */
export async function getContributors(
  connection: ConnectionLike,
  params: { owner: string; repo: string; limit?: number },
): Promise<GitHubContributor[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const { owner, repo, limit = 20 } = params;

  const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/contributors?per_page=${limit}`, { headers });
  if (!res.ok) return [];

  const data = (await res.json()) as any[];
  return data.map((contributor) => ({
    name: contributor.login,
    avatarUrl: contributor.avatar_url ?? "",
    commits: contributor.contributions ?? 0,
    profileUrl: contributor.html_url ?? "",
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
  await assertOk(res, `createIssue ${owner}/${repo}`);

  const data = (await res.json()) as any;
  return {
    issueId: String(data.id),
    issueUrl: data.html_url,
    issueNumber: data.number,
  };
}
