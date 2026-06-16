export type ProjectSourceType = "repository" | "template";

export interface PostDeployCommand {
  command: string;
  enabled: boolean;
  continueOnFailure: boolean;
  timeout?: number;
}

export interface ProjectConfig {
  postDeployCommands?: PostDeployCommand[];
}

export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
  platform?: string;
  sourceType?: ProjectSourceType;
  template?: string;
  config?: ProjectConfig;
  lastCommitHash?: string;
  createdAt: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultRepo: string;
  defaultBranch: string;
}
