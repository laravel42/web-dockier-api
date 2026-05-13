export type ServiceEntry = {
  type: string;
  name: string;
  mode: "vps" | "managed";
};

export type ProviderRow = {
  id: string;
  provider: string;
  label: string;
  region: string | null;
  created_at: string;
};

export type DeploymentRow = {
  id: string;
  provider_id: string | null;
  git_connection_id: string | null;
  project_id: string | null;
  repo: string;
  branch: string;
  status: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
  logs: string | null;
  app_url: string | null;
  commit_hash: string | null;
  docker_image: string | null;
  deploy_strategy: string | null;
  created_at: string;
  updated_at: string;
};
