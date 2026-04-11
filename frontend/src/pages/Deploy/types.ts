export interface Deployment {
  id: string;
  providerId: string;
  repo: string;
  branch: string;
  status: string;
  logs: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId?: string;
  platform?: string;
}
