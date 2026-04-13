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

export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
  platform?: string;
}

export interface TechBadgeInfo {
  name: string;
  category: string;
  confidence: number;
}
