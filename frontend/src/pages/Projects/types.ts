export interface Connection {
  id: string;
  provider: string;
  label: string;
  repoUrl: string;
  createdAt: string;
}

export interface Repo {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
}

export type ProjectSourceType = "repository" | "template";

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultRepo: string;
  defaultBranch: string;
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
}

export interface TechBadgeInfo {
  name: string;
  category: string;
  confidence: number;
}
