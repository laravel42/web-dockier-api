export type ProjectSourceType = "repository" | "template";

export interface ProjectConfig {
  overviewBlocks?: Record<string, unknown>[];
}

export interface ProjectSettings {
  color?: string;
  avatar?: string;
  notes?: string;
  frameworkVersion?: string;
  rootDirectory?: string;
  webDirectory?: string;
  deployScript?: string;
  [key: string]: unknown;
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
  settings?: ProjectSettings;
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
