export interface Connection {
  id: string;
  provider: string;
  label: string;
  repoUrl: string;
  endpoint: string;
  createdAt: string;
}

export interface Repo {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
}

export interface TechBadgeInfo {
  name: string;
  category: string;
  confidence: number;
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

export interface RepoMember {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
}

export interface FixResult {
  mrUrl: string;
  mrId: string;
  mrTitle: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorAvatar?: string;
  date: string;
  url?: string;
}
