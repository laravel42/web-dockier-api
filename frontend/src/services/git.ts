import { request } from "./request";
import type { Connection, Repo, TechBadgeInfo, RepoStats, RepoMember, FixResult } from "../types";

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

  updateConnection: (connectionId: string, data: { label: string }) =>
    request(`/git/connections/${connectionId}`, { method: "PUT", body: JSON.stringify({ connectionId, ...data }) }),

  listRepos: (connectionId: string) =>
    request<{ repos: Repo[] }>(`/git/connections/${connectionId}/repos`),

  listBranches: (connectionId: string, owner: string, repo: string) =>
    request<{ branches: string[] }>(
      `/git/connections/${connectionId}/repo-branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    ),

  getConnectionBranches: (connectionId: string) =>
    request<{ branches: string[] }>(
      `/git/connections/${connectionId}/branches`
    ),

  getRepoStats: (connectionId: string, owner: string, repo: string, branch?: string) =>
    request<RepoStats>(`/git/connections/${connectionId}/repo-stats?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`),

  analyzeRepo: (connectionId: string, owner: string, repo: string, branch?: string, aiType?: string, aiApiKey?: string) =>
    request<{
      techStack: TechBadgeInfo[];
      deployOptions: Array<{
        provider: string;
        type: string;
        description: string;
        pros: string[];
        cons: string[];
        estimatedMonthlyCost: string;
        bestFor: string;
      }>;
      detectedServices: Array<{
        type: string;
        name: string;
        provider: string;
        confidence: number;
        configFile?: string;
      }>;
      repoSize: number;
      primaryLanguage: string;
      hasDocker: boolean;
      hasCi: boolean;
      aiAnalysis?: {
        runtime: string;
        runtimeVersion: string;
        framework: string;
        frameworkVersion: string;
        phpExtensions?: string[];
        nodeVersion?: string;
        buildCommand: string;
        startCommand: string;
        port: number;
        needsScheduler: boolean;
        needsQueueWorker: boolean;
        needsWebsockets: boolean;
        envVars: string[];
        postDeployCommands: string[];
        nginxConfig: "php-fpm" | "reverse-proxy" | "static";
        summary: string;
        deployOptions?: Array<{
          provider: string;
          type: string;
          description: string;
          pros: string[];
          cons: string[];
          estimatedMonthlyCost: string;
          bestFor: string;
        }>;
      };
    }>(`/git/connections/${connectionId}/repo-analyze?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}${aiType ? `&aiType=${encodeURIComponent(aiType)}` : ""}${aiApiKey ? `&aiApiKey=${encodeURIComponent(aiApiKey)}` : ""}`),

  getRepoTree: (connectionId: string, owner: string, repo: string, branch?: string) =>
    request<{
      files: Array<{ path: string; type: string; size: number }>;
    }>(`/git/connections/${connectionId}/repo-tree?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`),

  getRepoBadges: (repo: string, branch?: string) =>
    request<{
      badges: TechBadgeInfo[];
    }>(`/git/repo-badges?repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`),

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
      `/git/connections/${connectionId}/repo-members?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    ),

  getFileContent: (connectionId: string, owner: string, repo: string, branch: string, path: string) =>
    request<{ content: string }>(
      `/git/connections/${connectionId}/file-content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`
    ),

  listBedrockModels: () =>
    request<{ models: Array<{ id: string; name: string }> }>("/git/bedrock/models"),

  summarizeFinding: (severity: string, message: string, filePath: string, snippet?: string, model?: string) =>
    request<{ title: string; estimateMinutes: number }>("/git/ai/summarize-finding", {
      method: "POST",
      body: JSON.stringify({ severity, message, filePath, snippet, model }),
    }),
};
