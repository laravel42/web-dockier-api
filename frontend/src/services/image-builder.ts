import { request } from "./request";
import { buildQuery } from "./query";

export const imageBuilderApi = {
  startBuild: (data: {
    sourceRepo: string;
    sourceRef?: string;
    commitSha?: string;
    imageRepo?: string;
    dockerfilePath?: string;
    buildContext?: string;
    tags?: string[];
    projectId?: string;
    gitConnectionId?: string;
    deployTarget?: "ecs" | "ec2" | "s3";
    providerId?: string;
    deployParams?: {
      appName?: string;
      containerPort?: number;
      cpu?: string;
      memory?: string;
      desiredCount?: number;
      maxCount?: number;
      minInstances?: number;
      maxInstances?: number;
      instanceType?: string;
      vpcId?: string;
      subnetIds?: string[];
      envVars?: Array<{ name: string; value: string }>;
      selfHostedServices?: string[];
      techStack?: string[];
      useRepoDockerfile?: boolean;
    };
  }) =>
    request<{
      id: string;
      codebuildId: string;
      userId: string;
      projectId: string;
      sourceRepo: string;
      sourceRef: string;
      commitSha: string;
      dockerfilePath: string;
      buildContext: string;
      imageRepo: string;
      imageUri: string;
      cacheRepoUri: string;
      status: string;
      statusReason: string;
      logsUrl: string;
      tags: string[];
      buildMetadata: Record<string, string>;
      startedAt: string;
      finishedAt: string;
      createdAt: string;
      updatedAt: string;
    }>("/image-builder/builds", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getBuild: (buildId: string) =>
    request<{
      id: string;
      codebuildId: string;
      sourceRepo: string;
      sourceRef: string;
      commitSha: string;
      imageUri: string;
      status: string;
      statusReason: string;
      logsUrl: string;
      tags: string[];
      buildMetadata: Record<string, string>;
      startedAt: string;
      finishedAt: string;
      createdAt: string;
    }>(`/image-builder/builds/${buildId}`),

  listBuilds: (params?: { sourceRepo?: string; status?: string; limit?: number; offset?: number }) =>
    request<{
      builds: Array<{
        id: string;
        codebuildId: string;
        sourceRepo: string;
        sourceRef: string;
        commitSha: string;
        imageUri: string;
        status: string;
        statusReason: string;
        logsUrl: string;
        tags: string[];
        startedAt: string;
        finishedAt: string;
        createdAt: string;
      }>;
      pagination: { total: number; limit: number; offset: number };
    }>(`/image-builder/builds${buildQuery(params)}`),

  getImageForRevision: (revision: string) =>
    request<{
      imageUri: string;
      buildId: string;
      commitSha: string;
      status: string;
      createdAt: string;
    }>(`/image-builder/images/${encodeURIComponent(revision)}`),

  cancelBuild: (buildId: string) =>
    request<{
      id: string;
      status: string;
      statusReason: string;
    }>(`/image-builder/builds/${buildId}/cancel`, { method: "POST" }),

  getBuildLogs: (buildId: string, nextToken?: string) =>
    request<{
      buildId: string;
      logs: string[];
      nextToken?: string;
    }>(`/image-builder/builds/${buildId}/logs${buildQuery({ nextToken })}`),

  getDeployStatus: (buildId: string) =>
    request<{
      status: string;
      appUrl: string;
      stackName: string;
    }>(`/image-builder/builds/${buildId}/deploy-status`),

  runPostDeploy: (buildId: string, commands: Array<{ command: string; enabled: boolean; continueOnFailure: boolean }>) =>
    request<{
      success: boolean;
      output: string[];
    }>(`/image-builder/builds/${buildId}/run-post-deploy`, {
      method: "POST",
      body: JSON.stringify({ commands }),
    }),
};
