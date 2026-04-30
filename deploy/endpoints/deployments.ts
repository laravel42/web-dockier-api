import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, deployTopic, type Deployment, type DeploymentRow, rowToDeployment } from "../shared";

export const createDeployment = api(
  { expose: true, method: "POST", path: "/deploy/deployments", auth: true },
  async (params: {
    providerId: string;
    gitConnectionId: string;
    projectId?: string;
    repo: string;
    branch: string;
    tofuScript?: string;
    techStack?: string[];
    primaryLanguage?: string;
    registryUrl?: string;
    deployStrategy?: string;
    buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
    skipPipeline?: boolean;
    templateId?: string;
    envVars?: Array<{ name: string; value: string }>;
    services?: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
  }): Promise<Deployment> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const script = params.tofuScript || "";

    await db.exec`
      INSERT INTO deployments (id, app_id, provider_id, git_connection_id, project_id, repo, branch, status, logs, tofu_script, deploy_strategy, created_at, updated_at)
      VALUES (${id}, ${authData.appId}, ${params.providerId}, ${params.gitConnectionId},
              ${params.projectId || ""}, ${params.repo}, ${params.branch}, 'pending', '', ${script}, ${params.deployStrategy || "managed"}, NOW(), NOW())`;

    if (!params.skipPipeline) {
      await deployTopic.publish({
        deploymentId: id,
        appId: authData.appId,
        providerId: params.providerId,
        gitConnectionId: params.gitConnectionId,
        projectId: params.projectId || "",
        repo: params.repo,
        branch: params.branch,
        tofuScript: script,
        techStack: params.techStack || [],
        primaryLanguage: params.primaryLanguage || "",
        registryUrl: params.registryUrl || "",
        deployStrategy: params.deployStrategy || "managed",
        buildMethod: params.buildMethod || "dockerfile",
        templateId: params.templateId || undefined,
        envVars: params.envVars || undefined,
        services: params.services || undefined,
      });
    }

    return {
      id, providerId: params.providerId,
      gitConnectionId: params.gitConnectionId, projectId: params.projectId || "",
      repo: params.repo,
      branch: params.branch, status: "pending", logs: "", appUrl: "",
      commitHash: "", dockerImage: "", deployStrategy: params.deployStrategy || "managed",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
);

export const listDeployments = api(
  { expose: true, method: "GET", path: "/deploy/deployments", auth: true },
  async (params: { providerId?: string }): Promise<{ deployments: Deployment[] }> => {
    const authData = getAuthData()!;
    const rows = params.providerId
      ? db.query<DeploymentRow>`SELECT * FROM deployments WHERE app_id = ${authData.appId} AND provider_id = ${params.providerId} ORDER BY created_at DESC LIMIT 50`
      : db.query<DeploymentRow>`SELECT * FROM deployments WHERE app_id = ${authData.appId} ORDER BY created_at DESC LIMIT 50`;

    const deployments: Deployment[] = [];
    for await (const row of rows) {
      deployments.push(rowToDeployment(row));
    }
    return { deployments };
  }
);

export const getDeployment = api(
  { expose: true, method: "GET", path: "/deploy/deployments/:deploymentId", auth: true },
  async (params: { deploymentId: string }): Promise<Deployment> => {
    const row = await db.queryRow<DeploymentRow>`SELECT * FROM deployments WHERE id = ${params.deploymentId}`;
    if (!row) throw APIError.notFound("Deployment not found");
    return rowToDeployment(row);
  }
);

export const updateDeployment = api(
  { expose: true, method: "PUT", path: "/deploy/deployments/:deploymentId", auth: true },
  async (params: {
    deploymentId: string;
    status?: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
    logs?: string;
    appUrl?: string;
  }): Promise<{ ok: boolean }> => {
    // Build a single update to avoid multiple round-trips and ensure atomicity
    const sets: string[] = [];
    const values: any[] = [];
    if (params.status) { sets.push("status"); values.push(params.status); }
    if (params.logs) { sets.push("logs"); values.push(params.logs); }
    if (params.appUrl) { sets.push("app_url"); values.push(params.appUrl); }
    if (sets.length === 0) return { ok: true };

    // Since Encore's SQL template tags don't support dynamic column lists,
    // we handle each combination but in a single query
    if (params.status && params.logs && params.appUrl) {
      await db.exec`UPDATE deployments SET status = ${params.status}, logs = ${params.logs}, app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.status && params.logs) {
      await db.exec`UPDATE deployments SET status = ${params.status}, logs = ${params.logs}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.status && params.appUrl) {
      await db.exec`UPDATE deployments SET status = ${params.status}, app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.logs && params.appUrl) {
      await db.exec`UPDATE deployments SET logs = ${params.logs}, app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.status) {
      await db.exec`UPDATE deployments SET status = ${params.status}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.logs) {
      await db.exec`UPDATE deployments SET logs = ${params.logs}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.appUrl) {
      await db.exec`UPDATE deployments SET app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    }
    return { ok: true };
  }
);

export const destroyDeployment = api(
  { expose: true, method: "POST", path: "/deploy/deployments/:deploymentId/destroy", auth: true },
  async (params: { deploymentId: string }): Promise<{ success: boolean; message: string }> => {
    const authData = getAuthData()!;
    const row = await db.queryRow<{
      id: string; app_id: string; provider_id: string; repo: string; deploy_strategy: string; docker_image: string;
    }>`SELECT id, app_id, provider_id, repo, deploy_strategy, docker_image FROM deployments WHERE id = ${params.deploymentId}`;
    if (!row) throw APIError.notFound("Deployment not found");
    if (row.app_id !== authData.appId) throw APIError.permissionDenied("Not your deployment");

    const providerRow = await db.queryRow<{
      provider: string; region: string; api_key: string; api_secret: string;
    }>`SELECT provider, region, api_key, api_secret FROM server_providers WHERE id = ${row.provider_id}`;
    if (!providerRow) throw APIError.notFound("Provider not found");

    const { destroy } = await import("../processor/destroy");
    return destroy({
      deploymentId: params.deploymentId,
      providerRow,
      deploymentRow: { repo: row.repo, deploy_strategy: row.deploy_strategy, docker_image: row.docker_image },
    });
  }
);
