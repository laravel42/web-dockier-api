export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  createdAt: string;
}

export interface Deploy {
  id: string;
  providerId: string;
  repo: string;
  branch: string;
  status: string;
  appUrl: string;
  deployStrategy: string;
  createdAt: string;
}

export interface Scan {
  id: string;
  projectId: string;
  repo: string;
  branch: string;
  status: string;
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  createdAt: string;
}

export interface Provider {
  id: string;
  provider: string;
  label: string;
}
