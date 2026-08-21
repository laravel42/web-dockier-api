export interface FixPlanFile { path: string; before: string; after: string }
export interface FixPlan {
  summary: string;
  prDescription: string;
  branchName: string;
  baseBranch: string;
  issueNumber: number;
  issueTitle: string;
  files: FixPlanFile[];
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

  listRepos: (connectionId: string, refresh?: boolean) =>
    request<{ repos: Repo[]; cached: boolean }>(`/git/connections/${connectionId}/repos${buildQuery({ refresh: refresh ? "true" : undefined })}`),

  listBranches: (connectionId: string, owner: string, repo: string) =>
    request<{ branches: string[] }>(
      `/git/connections/${connectionId}/repo-branches${buildQuery({ owner, repo })}`
    ),

  getConnectionBranches: (connectionId: string) =>
    request<{ branches: string[] }>(
      `/git/connections/${connectionId}/branches`
    ),

  getRepoStats: (connectionId: string, owner: string, repo: string, branch?: string, projectId?: string) =>
    request<RepoStats>(`/git/connections/${connectionId}/repo-stats${buildQuery({ owner, repo, branch, projectId })}`),

  analyzeRepo: (connectionId: string, owner: string, repo: string, branch?: string, aiType?: string, projectId?: string) =>
    request<RepoAnalysisResponse>(`/git/connections/${connectionId}/repo-analyze${buildQuery({ owner, repo, branch, aiType, projectId })}`),

  getRepoTree: (connectionId: string, owner: string, repo: string, branch?: string) =>
    request<{
      files: Array<{ path: string; type: string; size: number }>;
    }>(`/git/connections/${connectionId}/repo-tree${buildQuery({ owner, repo, branch })}`),

  getRepoBadges: (repo: string, branch?: string, connectionId?: string) =>
    request<{
      badges: TechBadgeInfo[];
    }>(`/git/repo-badges${buildQuery({ repo, branch, connectionId })}`),

  getRepoFavicon: (
    repo: string,
    branch?: string,
    connectionId?: string,
    rootDirectory?: string,
    webDirectory?: string,
  ) =>
    request<{ favicon: string | null; deployId: string | null }>(
      `/git/repo-favicon${buildQuery({ repo, branch, connectionId, rootDirectory, webDirectory })}`,
    ),

  getRecentCommits: (connectionId: string, owner: string, repo: string, branch?: string, limit?: number) =>
    request<{
      commits: Array<{ hash: string; shortHash: string; message: string; author: string; authorAvatar: string; date: string; url: string }>;
    }>(`/git/connections/${connectionId}/recent-commits${buildQuery({ owner, repo, branch, limit })}`),

  getOpenIssues: (connectionId: string, owner: string, repo: string, limit?: number) =>
    request<{ issues: RepoIssue[] }>(`/git/connections/${connectionId}/open-issues${buildQuery({ owner, repo, limit })}`),

  getPullRequests: (connectionId: string, owner: string, repo: string, limit?: number) =>
    request<{ pullRequests: RepoPullRequest[] }>(`/git/connections/${connectionId}/pull-requests${buildQuery({ owner, repo, limit })}`),

  pullOrigin: (connectionId: string, owner: string, repo: string, branch: string, currentHash?: string) =>
    request<{ log: string[] }>(`/git/connections/${connectionId}/pull`, {
      method: "POST",
      body: JSON.stringify({ connectionId, owner, repo, branch, currentHash }),
    }),

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

  createBranch: (connectionId: string, owner: string, repo: string, branchName: string, baseBranch?: string) =>
    request<{ ref: string; sha: string }>(`/git/connections/${connectionId}/branches`, {
      method: "POST",
      body: JSON.stringify({ owner, repo, branchName, ...(baseBranch ? { baseBranch } : {}) }),
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

  getSensitiveData: (connectionId: string, owner: string, repo: string, branch?: string) =>
    request<{ sensitiveData: Array<{ entity: string; field: string; sensitivity: "personal" | "sensitive" | "secret"; reason: string }> }>(
      `/git/connections/${connectionId}/sensitive-data${buildQuery({ owner, repo, branch })}`
    ),

  analyzeSensitiveData: (schema: string, projectId?: string) =>
    request<SensitiveDataAnalysis>("/git/analyze-sensitive-data", {
      method: "POST",
      body: JSON.stringify({ schema, projectId }),
    }),
};
