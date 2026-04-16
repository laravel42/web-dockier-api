export interface Deployment {
  id: string;
  providerId: string;
  projectId: string;
  repo: string;
  branch: string;
  status: string;
  logs: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Provider {
  id: string;
  provider: string;
  label: string;
}

export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
}
