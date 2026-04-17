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
