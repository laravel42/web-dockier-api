import type { DeploymentRow, DeploymentStatus, ProviderRow } from "../types.js";

export function rowToProvider(row: Pick<ProviderRow, "id" | "provider" | "label" | "region" | "created_at">) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    region: row.region ?? "",
    createdAt: row.created_at,
  };
}

export function rowToDeployment(row: DeploymentRow) {
  return {
    id: row.id,
    providerId: row.provider_id ?? "",
    gitConnectionId: row.git_connection_id ?? "",
    projectId: row.project_id ?? "",
    projectName: "",
    repo: row.repo,
    branch: row.branch,
    status: row.status as DeploymentStatus,
    logs: row.logs ?? "",
    appUrl: row.app_url ?? "",
    commitHash: row.commit_hash ?? "",
    dockerImage: row.docker_image ?? "",
    deployStrategy: row.deploy_strategy ?? "managed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
