import { request } from "./request";
import { buildQuery } from "./query";
import type {
  Build,
  BuildListItem,
  BuildImage,
  BuildLogs,
  BuildDeployStatus,
  StartBuildInput,
} from "../types";

export const imageBuilderApi = {
  startBuild: (data: StartBuildInput) =>
    request<Build>("/image-builder/builds", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getBuild: (buildId: string) =>
    request<Build>(`/image-builder/builds/${buildId}`),

  listBuilds: (params?: { sourceRepo?: string; status?: string; limit?: number; offset?: number }) =>
    request<{
      builds: BuildListItem[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/image-builder/builds${buildQuery(params)}`),

  getImageForRevision: (revision: string) =>
    request<BuildImage>(`/image-builder/images/${encodeURIComponent(revision)}`),

  cancelBuild: (buildId: string) =>
    request<{ id: string; status: string; statusReason: string }>(
      `/image-builder/builds/${buildId}/cancel`,
      { method: "POST" },
    ),

  getBuildLogs: (buildId: string, nextToken?: string) =>
    request<BuildLogs>(`/image-builder/builds/${buildId}/logs${buildQuery({ nextToken })}`),

  getDeployStatus: (buildId: string) =>
    request<BuildDeployStatus>(`/image-builder/builds/${buildId}/deploy-status`),

  runPostDeploy: (buildId: string, commands: Array<{ command: string; enabled: boolean; continueOnFailure: boolean }>) =>
    request<{ success: boolean; output: string[] }>(
      `/image-builder/builds/${buildId}/run-post-deploy`,
      { method: "POST", body: JSON.stringify({ commands }) },
    ),
};
