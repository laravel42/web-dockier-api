/**
 * GitLab API Client
 *
 * Typed helpers for GitLab REST API v4 calls used by git-integration routes.
 */

import type { ConnectionLike } from "./provider-client.js";
import { DomainError } from "../../../shared/supabase/errors.js";

export class GitLabApiError extends DomainError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(message, "bad_request");
    this.name = "GitLabApiError";
  }
}

function getBaseUrl(connection: ConnectionLike): string {
  return connection.endpoint || "https://gitlab.com";
}

function getHeaders(connection: ConnectionLike): Record<string, string> {
  return { "PRIVATE-TOKEN": connection.personal_token };
}

export function encodeProjectPath(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
}

function assertOk(response: Response, context: string): void {
  if (!response.ok) {
    throw new GitLabApiError(
      `GitLab API error ${response.status}: ${response.statusText} (${context})`,
      response.status,
      response.statusText,
    );
  }
}

export interface GitLabCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorAvatar: string;
  date: string;
  url: string;
}

export interface GitLabRepoStats {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  language: string;
  totalCommits: number;
}

export interface GitLabContributor {
  name: string;
  avatarUrl: string;
  commits: number;
  profileUrl: string;
}

export async function listCommits(
  connection: ConnectionLike,
  params: { owner: string; repo: string; branch: string; limit: number },
): Promise<GitLabCommit[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const project = encodeProjectPath(params.owner, params.repo);
  const { branch, limit } = params;

  const res = await fetch(
    `${baseUrl}/api/v4/projects/${project}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=${limit}`,
    { headers },
  );
  assertOk(res, `listCommits ${params.owner}/${params.repo}`);

  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((commit) => ({
    hash: String(commit.id ?? ""),
    shortHash: String(commit.short_id ?? "").slice(0, 7) || String(commit.id ?? "").slice(0, 7),
    message: String(commit.title ?? "").split("\n")[0],
    author: String(commit.author_name ?? ""),
    authorAvatar: "",
    date: String(commit.committed_date ?? commit.authored_date ?? ""),
    url: String(commit.web_url ?? ""),
  }));
}

export async function getRepoInfo(
  connection: ConnectionLike,
  params: { owner: string; repo: string },
): Promise<GitLabRepoStats> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const project = encodeProjectPath(params.owner, params.repo);

  const res = await fetch(`${baseUrl}/api/v4/projects/${project}?statistics=true`, { headers });
  assertOk(res, `getRepoInfo ${params.owner}/${params.repo}`);

  const data = (await res.json()) as Record<string, unknown>;
  const statistics = (data.statistics ?? {}) as Record<string, unknown>;

  return {
    stars: Number(data.star_count ?? 0),
    forks: Number(data.forks_count ?? 0),
    openIssues: Number(data.open_issues_count ?? 0),
    watchers: 0,
    language: "",
    totalCommits: Number(statistics.commit_count ?? 0),
  };
}

export async function getLanguages(
  connection: ConnectionLike,
  params: { owner: string; repo: string },
): Promise<Record<string, number>> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const project = encodeProjectPath(params.owner, params.repo);

  const res = await fetch(`${baseUrl}/api/v4/projects/${project}/languages`, { headers });
  if (!res.ok) return {};

  const languageData = (await res.json()) as Record<string, number>;
  return languageData;
}

interface GitLabMember {
  username: string;
  name: string;
  avatar_url: string;
  web_url: string;
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function profileFromNoreplyEmail(email: string, baseUrl: string): string {
  const match = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.gitlab\.com$/i);
  if (!match) return "";
  return `${baseUrl}/${match[1]}`;
}

async function getProjectMembers(
  connection: ConnectionLike,
  owner: string,
  repo: string,
): Promise<GitLabMember[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const project = encodeProjectPath(owner, repo);

  const res = await fetch(`${baseUrl}/api/v4/projects/${project}/members/all?per_page=100`, { headers });
  if (!res.ok) return [];

  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((member) => ({
    username: String(member.username ?? ""),
    name: String(member.name ?? ""),
    avatar_url: String(member.avatar_url ?? ""),
    web_url: String(member.web_url ?? ""),
  }));
}

export async function getContributors(
  connection: ConnectionLike,
  params: { owner: string; repo: string; limit?: number },
): Promise<GitLabContributor[]> {
  const baseUrl = getBaseUrl(connection);
  const headers = getHeaders(connection);
  const project = encodeProjectPath(params.owner, params.repo);
  const limit = params.limit ?? 20;

  const [contribRes, members] = await Promise.all([
    fetch(`${baseUrl}/api/v4/projects/${project}/repository/contributors?per_page=${limit}`, { headers }),
    getProjectMembers(connection, params.owner, params.repo).catch(() => []),
  ]);
  if (!contribRes.ok || contribRes.status === 204) return [];

  const membersByName = new Map<string, GitLabMember>();
  const membersByUsername = new Map<string, GitLabMember>();
  for (const member of members) {
    if (member.name) membersByName.set(normalizeLookupKey(member.name), member);
    if (member.username) membersByUsername.set(normalizeLookupKey(member.username), member);
  }

  const data = (await contribRes.json()) as Array<Record<string, unknown>>;
  return data.slice(0, limit).map((contributor) => {
    const name = String(contributor.name ?? contributor.email ?? "Unknown");
    const email = String(contributor.email ?? "");
    const matchedMember = membersByName.get(normalizeLookupKey(name));
    const emailProfileUrl = profileFromNoreplyEmail(email, baseUrl);
    const emailUsername = emailProfileUrl ? emailProfileUrl.split("/").pop() ?? "" : "";
    const emailMember = emailUsername ? membersByUsername.get(normalizeLookupKey(emailUsername)) : undefined;
    const resolvedMember = matchedMember ?? emailMember;

    const profileUrl = resolvedMember?.web_url
      || emailProfileUrl
      || (resolvedMember?.username ? `${baseUrl}/${resolvedMember.username}` : "");

    return {
      name,
      avatarUrl: resolvedMember?.avatar_url ?? "",
      commits: Number(contributor.commits ?? 0),
      profileUrl,
    };
  });
}
