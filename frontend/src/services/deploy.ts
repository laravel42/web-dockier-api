import { request } from "./request";
import type { Deployment, Provider } from "../types";

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
    request("/deploy/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteProvider: (providerId: string) =>
    request(`/deploy/providers/${providerId}`, { method: "DELETE" }),

  updateProvider: (providerId: string, data: { label?: string; apiSecret?: string }) =>
    request(`/deploy/providers/${providerId}`, { method: "PUT", body: JSON.stringify(data) }),

  listDeployments: (providerId?: string) =>
    request<{ deployments: Deployment[] }>(
      `/deploy/deployments${providerId ? `?providerId=${providerId}` : ""}`
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
    skipPipeline?: boolean;
    templateId?: string;
    envVars?: Array<{ name: string; value: string }>;
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
    request<{ ok: boolean }>(`/deploy/deployments/${deploymentId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  destroyDeployment: (deploymentId: string) =>
    request<{ success: boolean; message: string }>(`/deploy/deployments/${deploymentId}/destroy`, {
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
    aiAnalysis?: Record<string, any>;
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
