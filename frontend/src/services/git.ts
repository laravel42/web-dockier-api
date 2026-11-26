export interface FixPlanFile { path: string; before: string; after: string }
export interface FixPlan {
  summary: string;
  prDescription: string;
  branchName: string;
  baseBranch: string;
  issueNumber: number;
  issueTitle: string;
  files: FixPlanFile[];
  /** Server signature; send the plan back unchanged or apply refuses it. */
  signature: string;
}
export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "critical" | "warning" | "suggestion" | "praise";
}

import { request } from "./request";
import { buildQuery } from "./query";
import type {
  Connection, Repo, TechBadgeInfo, RepoStats, RepoMember, FixResult,
  RepoAnalysisResponse, StackAnalysisResponse, SensitiveDataAnalysis,
  RepoIssue, RepoPullRequest,
} from "../types";

export const gitApi = {
  listConnections: () =>
    request<{ connections: Connection[] }>("/git/connections"),

  addConnection: (data: {
    provider: string;
    personalToken: string;
    label: string;
    repoUrl: string;
    endpoint: string;
  }) =>
    request<Connection>("/git/connections", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteConnection: (connectionId: string) =>
    request<{ success: true }>(`/git/connections/${connectionId}`, { method: "DELETE" }),

  updateConnection: (connectionId: string, data: { label: string; personalToken?: string }) =>
    request<{ success: true }>(`/git/connections/${connectionId}`, { method: "PUT", body: JSON.stringify({ connectionId, ...data }) }),

  /**
   * List or search repos for a connection.
   *
   * Without `search` the backend returns only the first page (fast) — use
   * `search` to reach repos beyond it. `hasMore` signals that more exist.
   */
  listRepos: (
    connectionId: string,
    opts: { refresh?: boolean; search?: string; limit?: number } = {},
  ) =>
    request<{ repos: Repo[]; cached: boolean; hasMore: boolean }>(
      `/git/connections/${connectionId}/repos${buildQuery({
        refresh: opts.refresh ? "true" : undefined,
        search: opts.search?.trim() || undefined,
        limit: opts.limit,
      })}`,
    ),

  listBranches: (connectionId: string, owner: string, repo: string) =>
    request<{ branches: string[] }>(
      `/git/connections/${connectionId}/repo-branches${buildQuery({ owner, repo })}`
    ),


  getRepoStats: (connectionId: string, owner: string, repo: string, branch?: string, projectId?: string) =>
    request<RepoStats>(`/git/connections/${connectionId}/repo-stats${buildQuery({ owner, repo, branch, projectId })}`),

  analyzeRepo: (connectionId: string, owner: string, repo: string, branch?: string, aiType?: string, projectId?: string) =>
    request<RepoAnalysisResponse>(`/git/connections/${connectionId}/repo-analyze${buildQuery({ owner, repo, branch, aiType, projectId })}`),


  getRepoBadges: (repo: string, branch?: string, connectionId?: string) =>
    request<{
      badges: TechBadgeInfo[];
    }>(`/git/repo-badges${buildQuery({ repo, branch, connectionId })}`),

  /**
   * Cache-only badges for a whole page of repos in one call. The single route
   * above analyses on a miss and is capped at 30/min, which a list page of 50
   * blew through; use this for lists and that one for a single known repo.
   * A repo with nothing cached is absent from `results`, not empty in it.
   */
  getRepoBadgesBatch: (repos: Array<{ repo: string; branch?: string }>) =>
    request<{
      results: Array<{ repo: string; branch: string; badges: TechBadgeInfo[] }>;
    }>("/git/repo-badges/batch", { method: "POST", body: JSON.stringify({ repos }) }),

  /**
   * Favicons for a page of repos in one call. The single route below is capped
   * at 30/min, which a list of 50 blew through; use this for lists.
   * A repo absent from `results` has no icon yet — ask again, do not cache it.
   */
  getRepoFaviconsBatch: (
    repos: Array<{
      repo: string;
      branch?: string;
      connectionId?: string;
      rootDirectory?: string;
      webDirectory?: string;
    }>,
  ) =>
    request<{
      results: Array<{ repo: string; branch: string; favicon: string | null; deployId: string | null }>;
    }>("/git/repo-favicons/batch", { method: "POST", body: JSON.stringify({ repos }) }),

  getRecentCommits: (connectionId: string, owner: string, repo: string, branch?: string, limit?: number) =>
    request<{
      commits: Array<{ hash: string; shortHash: string; message: string; author: string; authorAvatar: string; date: string; url: string }>;
    }>(`/git/connections/${connectionId}/recent-commits${buildQuery({ owner, repo, branch, limit })}`),

  getOpenIssues: (connectionId: string, owner: string, repo: string, limit?: number) =>
    request<{ issues: RepoIssue[] }>(`/git/connections/${connectionId}/open-issues${buildQuery({ owner, repo, limit })}`),

  getPullRequests: (connectionId: string, owner: string, repo: string, limit?: number) =>
    request<{ pullRequests: RepoPullRequest[] }>(`/git/connections/${connectionId}/pull-requests${buildQuery({ owner, repo, limit })}`),


  createFixMR: (connectionId: string, data: {
    owner: string; repo: string; branch: string;
    filePath: string; startLine: number; endLine: number;
    ruleId: string; severity: string; message: string; snippet: string;
    aiType?: string; aiConfig?: Record<string, string>;
    assignee?: string; reviewer?: string;
  }) =>
    request<FixResult>(`/git/connections/${connectionId}/create-mr`, {
      method: "POST",
      body: JSON.stringify({ connectionId, ...data }),
    }),

  listRepoMembers: (connectionId: string, owner: string, repo: string) =>
    request<{ members: RepoMember[] }>(
      `/git/connections/${connectionId}/repo-members${buildQuery({ owner, repo })}`
    ),

  getFileContent: (connectionId: string, owner: string, repo: string, branch: string, path: string) =>
    request<{ content: string }>(
      `/git/connections/${connectionId}/file-content${buildQuery({ owner, repo, branch, path })}`
    ),

  summarizeFinding: (severity: string, message: string, filePath: string, snippet?: string) =>
    request<{ title: string; estimateMinutes: number }>("/git/ai/summarize-finding", {
      method: "POST",
      body: JSON.stringify({ severity, message, filePath, snippet }),
    }),

  getStackAnalysis: (connectionId: string, owner: string, repo: string, branch?: string, projectId?: string) =>
    request<StackAnalysisResponse>(`/git/connections/${connectionId}/stack-analysis${buildQuery({ owner, repo, branch, projectId })}`),

  invalidateStackCache: (repo: string, branch?: string) =>
    request<{ success: boolean }>(`/git/stack-cache${buildQuery({ repo, branch })}`, { method: "DELETE" }),

  invalidateStatsCache: (repo: string, branch?: string) =>
    request<{ success: boolean }>(`/git/stats-cache${buildQuery({ repo, branch })}`, { method: "DELETE" }),

  invalidateAnalysisCache: (repo: string, branch?: string) =>
    request<{ success: boolean }>(`/git/analysis-cache${buildQuery({ repo, branch })}`, { method: "DELETE" }),

  createGitIssue: (connectionId: string, owner: string, repo: string, title: string, body: string, assignee?: string) =>
    request<{ issueId: string; issueUrl: string; issueNumber: number }>(`/git/connections/${connectionId}/issues`, {
      method: "POST",
      body: JSON.stringify({ connectionId, owner, repo, title, body, ...(assignee ? { assignee } : {}) }),
    }),

  closeIssue: (connectionId: string, owner: string, repo: string, issueNumber: number) =>
    request<{ success: boolean }>(`/git/connections/${connectionId}/issues/${issueNumber}/close`, {
      method: "PATCH",
      body: JSON.stringify({ owner, repo }),
    }),


  /** Generates a fix and returns it for review. Writes nothing. */
  planFix: (connectionId: string, data: {
    owner: string; repo: string; baseBranch: string;
    issueNumber: number; issueTitle: string; issueBody: string;
  }) =>
    request<FixPlan>(
      `/git/connections/${connectionId}/fix-issue/plan`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  /** Opens the pull request. The only call in this flow that touches the repo. */
  applyFix: (connectionId: string, data: { owner: string; repo: string; plan: FixPlan }) =>
    request<{ prUrl: string; prNumber: number; branchName: string; filesChanged: number; summary: string }>(
      `/git/connections/${connectionId}/fix-issue/apply`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  /** Generates review comments and returns them. Posts nothing. */
  generateReview: (connectionId: string, data: {
    owner: string; repo: string;
    prNumber: number; prTitle: string; prBody: string;
  }) =>
    request<{ summary: string; comments: ReviewComment[]; approved: boolean }>(
      `/git/connections/${connectionId}/review-pr/generate`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  /** Posts the approved subset publicly on the pull request. */
  postReview: (connectionId: string, data: {
    owner: string; repo: string; prNumber: number;
    summary: string; approved: boolean; comments: ReviewComment[];
  }) =>
    request<{ reviewUrl: string }>(
      `/git/connections/${connectionId}/review-pr/post`,
      { method: "POST", body: JSON.stringify(data) },
    ),


  analyzeSensitiveData: (schema: string, projectId?: string) =>
    request<SensitiveDataAnalysis>("/git/analyze-sensitive-data", {
      method: "POST",
      body: JSON.stringify({ schema, projectId }),
    }),
};
