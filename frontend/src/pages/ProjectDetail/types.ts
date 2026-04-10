export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
  createdAt: string;
}

export interface RepoStats {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  language: string;
  languages: Record<string, number>;
  lastCommitDate: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  lastCommitHash: string;
  totalCommits: number;
  contributors: number;
  topContributors: Array<{ name: string; avatarUrl: string; commits: number; profileUrl: string }>;
}

export interface DeployInfo {
  id: string;
  providerId: string;
  repo: string;
  branch: string;
  status: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: string;
  createdAt: string;
}

export interface ProviderInfo {
  id: string;
  provider: string;
  label: string;
}
