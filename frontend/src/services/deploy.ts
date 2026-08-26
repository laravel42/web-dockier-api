import { request } from "./request";
import { buildQuery } from "./query";
import type { Deployment, Provider, PaginationMeta } from "../types";

export interface DockerfilePreviewResult {
  /** Whether the AI review actually ran (key + flag on, generated source). */
  aiEnabled: boolean;
  /** Whether the Dockerfile was Dockier-generated or taken from the repo. */
  source: "generated" | "repo";
  /** Rule-based Dockerfile (or the repo's own when source is "repo"). */
  mechanicalDockerfile: string;
  /** Effective Dockerfile after optional review; equals mechanical when not revised. */
  finalDockerfile: string;
  revised: boolean;
  changes: Array<{ what: string; why: string }>;
  /** Present when the review was skipped or a revision rejected. */
  skipReason?: string;
  runtime: string;
  framework: string;
}

export const deployApi = {
  listProviders: () =>
    request<{
      providers: Array<Provider & { createdAt: string }>;
    }>("/deploy/providers"),

  addProvider: (data: {
    provider: string;
    label: string;
    apiKey: string;
    apiSecret: string;
    region?: string;
  }) =>
    request<{ id: string; provider: string; label: string }>("/deploy/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteProvider: (providerId: string) =>
    request<{ success: true }>(`/deploy/providers/${providerId}`, { method: "DELETE" }),

  updateProvider: (providerId: string, data: { label?: string; apiSecret?: string }) =>
    request<{ success: true }>(`/deploy/providers/${providerId}`, { method: "PUT", body: JSON.stringify(data) }),

  listDeployments: (params?: {
    providerId?: string;
    projectId?: string;
    limit?: number;
    offset?: number;
  }) =>
    request<{ deployments: Deployment[]; pagination: PaginationMeta }>(
      `/deploy/deployments${buildQuery(params)}`,
    ),

  createDeployment: (data: {
    providerId: string;
    gitConnectionId: string;
    projectId?: string;
    repo: string;
    branch: string;
    tofuScript?: string;
    techStack?: string[];
    primaryLanguage?: string;
    registryUrl?: string;
    deployStrategy?: string;
    buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
    useRepoDockerfile?: boolean;
    skipPipeline?: boolean;
    templateId?: string;
    services?: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
  }) =>
    request<{
      id: string;
      providerId: string;
      repo: string;
      branch: string;
      status: string;
      logs: string;
      appUrl: string;
    }>("/deploy/deployments", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateDeployment: (deploymentId: string, data: {
    status?: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
    logs?: string;
    appUrl?: string;
  }) =>
    request<{ success: boolean }>(`/deploy/deployments/${deploymentId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  cancelDeployment: (deploymentId: string) =>
    request<Deployment>(`/deploy/deployments/${deploymentId}/cancel`, {
      method: "POST",
    }),

  redeployLatest: (deploymentId: string) =>
    request<Deployment>(`/deploy/deployments/${deploymentId}/redeploy`, {
      method: "POST",
    }),

  rollbackToDeployment: (deploymentId: string) =>
    request<Deployment>(`/deploy/deployments/${deploymentId}/rollback`, {
      method: "POST",
    }),

  getDeployment: (deploymentId: string) =>
    request<Deployment & { updatedAt: string }>(`/deploy/deployments/${deploymentId}`),

  generateTofu: (data: {
    providerId: string;
    repo: string;
    branch: string;
    techStack: string[];
    primaryLanguage: string;
    hasDocker: boolean;
    appName?: string;
    region?: string;
    deployStrategy?: "vps" | "managed" | "static";
    useDocker?: boolean;
    dockerImage?: string;
    instanceType?: string;
    services?: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
    aiAnalysis?: Record<string, unknown>;
    templateId?: string;
  }) =>
    request<{
      script: string;
      provider: string;
      region: string;
      appName: string;
      estimatedResources: string[];
    }>("/deploy/tofu/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  previewDockerfile: (data: {
    gitConnectionId: string;
    repo: string;
    branch: string;
    projectId?: string;
    useRepoDockerfile?: boolean;
  }) =>
    request<DockerfilePreviewResult>("/deploy/dockerfile/preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // SSH Keys
  listSshKeys: () =>
    request<{ keys: Array<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }> }>("/deploy/ssh-keys"),

  addSshKey: (data: { label: string; publicKey: string }) =>
    request<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }>("/deploy/ssh-keys", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteSshKey: (keyId: string) =>
    request<{ success: boolean }>(`/deploy/ssh-keys/${keyId}`, { method: "DELETE" }),
};
