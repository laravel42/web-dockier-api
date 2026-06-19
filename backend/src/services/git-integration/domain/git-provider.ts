/**
 * Unified Git Provider Client
 *
 * Provides a single interface for repository operations that previously required
 * inline `provider === "github" / "gitlab"` branching in the route handlers.
 *
 * Each provider adapter implements the capabilities it supports. Operations a
 * provider does not support return safe empty results (commits/members/stats),
 * and unsupported issue creation is signalled by omitting `createIssue` so the
 * route can respond with HTTP 501.
 *
 * The low-level HTTP calls still live in `github-client.ts` / `gitlab-client.ts`;
 * this module composes them behind one interface.
 */

import type { ConnectionLike } from "./provider-client.js";
import {
  listCommits as ghListCommits,
  getRepoInfo as ghGetRepoInfo,
  getLanguages as ghGetLanguages,
  getContributors as ghGetContributors,
  getCollaborators as ghGetCollaborators,
  listIssues as ghListIssues,
  listPullRequests as ghListPullRequests,
  createIssue as ghCreateIssue,
  closeIssue as ghCloseIssue,
  createBranch as ghCreateBranch,
} from "./github-client.js";
import {
  listCommits as glListCommits,
  getRepoInfo as glGetRepoInfo,
  getLanguages as glGetLanguages,
  getContributors as glGetContributors,
  listIssues as glListIssues,
  listPullRequests as glListPullRequests,
} from "./gitlab-client.js";

// ─── Canonical cross-provider shapes ───────────────────────────────────────────

export interface RepoCommit {
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

export type RepoContributor = {
  name: string;
  avatarUrl: string;
  commits: number;
  profileUrl: string;
  additions: number;
  deletions: number;
};

export interface RepoMember {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
}

export type RepoStats = {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  language: string;
  languages: Record<string, number>;
  lastCommitDate: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  lastCommitHash: string;
  totalCommits: number;
  contributors: number;
  topContributors: RepoContributor[];
};

export interface RepoIssue {
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

export interface RepoPullRequest {
  number: number;
  title: string;
  url: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
  draft: boolean;
}

export interface ListQuery {
  owner: string;
  repo: string;
  limit: number;
}

export interface IssueInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  assignee?: string;
}

export interface IssueResult {
  issueId: string;
  issueUrl: string;
  issueNumber: number;
}

export interface CommitQuery {
  owner: string;
  repo: string;
  branch: string;
  limit: number;
  includeStats?: boolean;
}

export interface RepoQuery {
  owner: string;
  repo: string;
  branch: string;
}

export interface MemberQuery {
  owner: string;
  repo: string;
}

export interface GitProviderClient {
  /** Recent commits for a branch. Returns [] for providers without commit support. */
  listCommits(query: CommitQuery): Promise<RepoCommit[]>;
  /** Aggregated repository stats. Returns placeholder zeros for unsupported providers. */
  getRepoStats(query: RepoQuery): Promise<RepoStats>;
  /** Repository members/collaborators. Returns [] for providers without member support. */
  listMembers(query: MemberQuery): Promise<RepoMember[]>;
  /** Open issues. Returns [] for providers without issue support. */
  listIssues(query: ListQuery): Promise<RepoIssue[]>;
  /** Open pull/merge requests. Returns [] for providers without PR support. */
  listPullRequests(query: ListQuery): Promise<RepoPullRequest[]>;
  /** Present only on providers that support issue creation. */
  createIssue?(input: IssueInput): Promise<IssueResult>;
  /** Close an issue. Present only on providers that support issue management. */
  closeIssue?(params: { owner: string; repo: string; issueNumber: number }): Promise<void>;
  /** Create a branch from a base branch. Present only on providers that support branch creation. */
  createBranch?(params: { owner: string; repo: string; branchName: string; baseBranch?: string }): Promise<{ ref: string; sha: string }>;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function emptyStats(): RepoStats {
  return {
    stars: 0,
    forks: 0,
    openIssues: 0,
    watchers: 0,
    language: "",
    languages: {},
    lastCommitDate: "",
    lastCommitMessage: "",
    lastCommitAuthor: "",
    lastCommitHash: "",
    totalCommits: 0,
    contributors: 0,
    topContributors: [],
  };
}

function primaryLanguage(languages: Record<string, number>): string {
  const entries = Object.entries(languages);
  if (entries.length === 0) return "";
  return entries.sort(([, a], [, b]) => b - a)[0][0];
}

function applyLatestCommit(stats: RepoStats, commits: RepoCommit[]): void {
  if (commits.length === 0) return;
  const latest = commits[0];
  stats.lastCommitDate = latest.date;
  stats.lastCommitMessage = latest.message;
  stats.lastCommitAuthor = latest.author;
  stats.lastCommitHash = latest.hash;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

class GitHubProvider implements GitProviderClient {
  constructor(private readonly conn: ConnectionLike) {}

  listCommits(query: CommitQuery): Promise<RepoCommit[]> {
    return ghListCommits(this.conn, query);
  }

  async getRepoStats(query: RepoQuery): Promise<RepoStats> {
    const { owner, repo, branch } = query;
    const [repoInfo, commits, contributors, languages] = await Promise.all([
      ghGetRepoInfo(this.conn, { owner, repo }),
      ghListCommits(this.conn, { owner, repo, branch, limit: 20 }).catch(() => [] as RepoCommit[]),
      ghGetContributors(this.conn, { owner, repo, limit: 20 }),
      ghGetLanguages(this.conn, { owner, repo }),
    ]);

    const stats = emptyStats();
    stats.stars = repoInfo.stars;
    stats.forks = repoInfo.forks;
    stats.openIssues = repoInfo.openIssues;
    stats.watchers = repoInfo.watchers;
    stats.language = repoInfo.language;
    stats.languages = languages;
    applyLatestCommit(stats, commits);
    if (commits.length > 0) stats.totalCommits = commits.length;
    stats.contributors = contributors.length;
    stats.topContributors = contributors;
    return stats;
  }

  listMembers(query: MemberQuery): Promise<RepoMember[]> {
    return ghGetCollaborators(this.conn, query);
  }

  listIssues(query: ListQuery): Promise<RepoIssue[]> {
    return ghListIssues(this.conn, query);
  }

  listPullRequests(query: ListQuery): Promise<RepoPullRequest[]> {
    return ghListPullRequests(this.conn, query);
  }

  createIssue(input: IssueInput): Promise<IssueResult> {
    return ghCreateIssue(this.conn, input);
  }

  closeIssue(params: { owner: string; repo: string; issueNumber: number }): Promise<void> {
    return ghCloseIssue(this.conn, params);
  }

  createBranch(params: { owner: string; repo: string; branchName: string; baseBranch?: string }): Promise<{ ref: string; sha: string }> {
    return ghCreateBranch(this.conn, params);
  }
}

class GitLabProvider implements GitProviderClient {
  constructor(private readonly conn: ConnectionLike) {}

  listCommits(query: CommitQuery): Promise<RepoCommit[]> {
    return glListCommits(this.conn, query);
  }

  async getRepoStats(query: RepoQuery): Promise<RepoStats> {
    const { owner, repo, branch } = query;
    const [repoInfo, commits, contributors, languages] = await Promise.all([
      glGetRepoInfo(this.conn, { owner, repo }),
      glListCommits(this.conn, { owner, repo, branch, limit: 20 }).catch(() => [] as RepoCommit[]),
      glGetContributors(this.conn, { owner, repo, limit: 20 }),
      glGetLanguages(this.conn, { owner, repo }),
    ]);

    const stats = emptyStats();
    stats.stars = repoInfo.stars;
    stats.forks = repoInfo.forks;
    stats.openIssues = repoInfo.openIssues;
    stats.watchers = repoInfo.watchers;
    stats.language = primaryLanguage(languages);
    stats.languages = languages;
    stats.totalCommits = repoInfo.totalCommits;
    applyLatestCommit(stats, commits);
    stats.contributors = contributors.length;
    stats.topContributors = contributors;
    return stats;
  }

  // GitLab member listing is not yet wired through; preserve the previous
  // empty-result behavior until it is implemented end-to-end.
  async listMembers(): Promise<RepoMember[]> {
    return [];
  }

  listIssues(query: ListQuery): Promise<RepoIssue[]> {
    return glListIssues(this.conn, query);
  }

  listPullRequests(query: ListQuery): Promise<RepoPullRequest[]> {
    return glListPullRequests(this.conn, query);
  }
}

/**
 * Fallback for providers without a dedicated client (e.g. Bitbucket).
 * Returns safe empty results so callers don't need provider checks.
 */
class UnsupportedProvider implements GitProviderClient {
  async listCommits(): Promise<RepoCommit[]> {
    return [];
  }

  async getRepoStats(): Promise<RepoStats> {
    return emptyStats();
  }

  async listMembers(): Promise<RepoMember[]> {
    return [];
  }

  async listIssues(): Promise<RepoIssue[]> {
    return [];
  }

  async listPullRequests(): Promise<RepoPullRequest[]> {
    return [];
  }
}

/**
 * Resolve the provider client for a connection. Centralizes the only
 * provider-name branching that route handlers should ever need.
 */
export function getGitProvider(connection: ConnectionLike): GitProviderClient {
  if (connection.provider === "github") return new GitHubProvider(connection);
  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    return new GitLabProvider(connection);
  }
  return new UnsupportedProvider();
}
