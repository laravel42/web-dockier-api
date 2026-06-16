import { request } from "./request";
import { buildQuery } from "./query";
import type {
  Connection, Repo, TechBadgeInfo, RepoStats, RepoMember, FixResult,
  RepoAnalysisResponse, StackAnalysisResponse, SensitiveDataAnalysis,
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
    request("/git/connections", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteConnection: (connectionId: string) =>
    request(`/git/connections/${connectionId}`, { method: "DELETE" }),

  updateConnection: (connectionId: string, data: { label: string; personalToken?: string }) =>
    request(`/git/connections/${connectionId}`, { method: "PUT", body: JSON.stringify({ connectionId, ...data }) }),

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

  getRecentCommits: (connectionId: string, owner: string, repo: string, branch?: string, limit?: number) =>
    request<{
      commits: Array<{ hash: string; shortHash: string; message: string; author: string; authorAvatar: string; date: string; url: string }>;
    }>(`/git/connections/${connectionId}/recent-commits${buildQuery({ owner, repo, branch, limit })}`),

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
    request<{ done: boolean }>(`/git/stack-cache${buildQuery({ repo, branch })}`, { method: "DELETE" }),

  invalidateStatsCache: (repo: string, branch?: string) =>
    request<{ done: boolean }>(`/git/stats-cache${buildQuery({ repo, branch })}`, { method: "DELETE" }),

  invalidateAnalysisCache: (repo: string, branch?: string) =>
    request<{ deleted: boolean }>(`/git/analysis-cache${buildQuery({ repo, branch })}`, { method: "DELETE" }),

  createGitIssue: (connectionId: string, owner: string, repo: string, title: string, body: string, assignee?: string) =>
    request<{ issueId: string; issueUrl: string; issueNumber: number }>(`/git/connections/${connectionId}/issues`, {
      method: "POST",
      body: JSON.stringify({ connectionId, owner, repo, title, body, ...(assignee ? { assignee } : {}) }),
    }),

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
