export type DeploymentStatus = "pending" | "building" | "deploying" | "success" | "failed" | "destroyed" | "cancelled";

export type DeployStrategy = "vps" | "managed" | "static";

export interface Deployment {
  id: string;
  providerId: string;
  projectId: string;
  repo: string;
  branch: string;
  status: DeploymentStatus;
  logs: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: DeployStrategy;
  createdAt: string;
  updatedAt?: string;
}
