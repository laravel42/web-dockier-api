export type BuildDeployTarget = "ecs" | "ec2" | "s3";

export interface BuildDeployParams {
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
}

export interface StartBuildInput {
  sourceRepo: string;
  sourceRef?: string;
  commitSha?: string;
  imageRepo?: string;
  dockerfilePath?: string;
  buildContext?: string;
  tags?: string[];
  projectId?: string;
  gitConnectionId?: string;
  deployTarget?: BuildDeployTarget;
  providerId?: string;
  deployParams?: BuildDeployParams;
}

export interface Build {
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
}

export interface BuildListItem {
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
}

export interface BuildImage {
  imageUri: string;
  buildId: string;
  commitSha: string;
  status: string;
  createdAt: string;
}

export interface BuildLogs {
  buildId: string;
  logs: string[];
  nextToken?: string;
}

export interface BuildDeployStatus {
  status: string;
  appUrl: string;
  stackName: string;
}
