import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, deployTopic, type Deployment } from "../shared";

export const createDeployment = api(
  { method: "POST", path: "/deploy/deployments", auth: true },
  async (params: {
    providerId: string;
    gitConnectionId: string;
    repo: string;
    branch: string;
    tofuScript?: string;
    techStack?: string[];
    primaryLanguage?: string;
    registryUrl?: string;
    deployStrategy?: string;
    buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
    skipPipeline?: boolean;
  }): Promise<Deployment> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const script = params.tofuScript || "";

    await db.exec`
      INSERT INTO deployments (id, app_id, provider_id, git_connection_id, repo, branch, status, logs, tofu_script, deploy_strategy, created_at, updated_at)
      VALUES (${id}, ${authData.appId}, ${params.providerId}, ${params.gitConnectionId},
              ${params.repo}, ${params.branch}, 'pending', '', ${script}, ${params.deployStrategy || "managed"}, NOW(), NOW())`;

    if (!params.skipPipeline) {
      await deployTopic.publish({
        deploymentId: id,
        appId: authData.appId,
        providerId: params.providerId,
        gitConnectionId: params.gitConnectionId,
        repo: params.repo,
        branch: params.branch,
        tofuScript: script,
        techStack: params.techStack || [],
        primaryLanguage: params.primaryLanguage || "",
        registryUrl: params.registryUrl || "",
        deployStrategy: params.deployStrategy || "managed",
        buildMethod: params.buildMethod || "dockerfile",
      });
    }

    return {
      id, providerId: params.providerId,
      gitConnectionId: params.gitConnectionId, repo: params.repo,
      branch: params.branch, status: "pending", logs: "", appUrl: "",
      commitHash: "", dockerImage: "", deployStrategy: params.deployStrategy || "managed",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
);

export const listDeployments = api(
  { method: "GET", path: "/deploy/deployments", auth: true },
  async (params: { providerId?: string }): Promise<{ deployments: Deployment[] }> => {
    const authData = getAuthData()!;
    const rows = params.providerId
      ? db.query<{
          id: string; provider_id: string; git_connection_id: string;
          repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
        }>`SELECT * FROM deployments WHERE app_id = ${authData.appId} AND provider_id = ${params.providerId} ORDER BY created_at DESC LIMIT 50`
      : db.query<{
          id: string; provider_id: string; git_connection_id: string;
          repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
        }>`SELECT * FROM deployments WHERE app_id = ${authData.appId} ORDER BY created_at DESC LIMIT 50`;

    const deployments: Deployment[] = [];
    for await (const row of rows) {
      deployments.push({
        id: row.id, providerId: row.provider_id,
        gitConnectionId: row.git_connection_id, repo: row.repo, branch: row.branch,
        status: row.status as Deployment["status"], logs: row.logs, appUrl: row.app_url,
        commitHash: row.commit_hash, dockerImage: row.docker_image,
        deployStrategy: row.deploy_strategy || "managed",
        createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      });
    }
    return { deployments };
  }
);

export const getDeployment = api(
  { method: "GET", path: "/deploy/deployments/:deploymentId", auth: true },
  async (params: { deploymentId: string }): Promise<Deployment> => {
    const row = await db.queryRow<{
      id: string; provider_id: string; git_connection_id: string;
      repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
    }>`SELECT * FROM deployments WHERE id = ${params.deploymentId}`;
    if (!row) throw APIError.notFound("Deployment not found");
    return {
      id: row.id, providerId: row.provider_id,
      gitConnectionId: row.git_connection_id, repo: row.repo, branch: row.branch,
      status: row.status as Deployment["status"], logs: row.logs, appUrl: row.app_url,
      commitHash: row.commit_hash, dockerImage: row.docker_image,
      deployStrategy: row.deploy_strategy || "managed",
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
  }
);

export const updateDeployment = api(
  { method: "PUT", path: "/deploy/deployments/:deploymentId", auth: true },
  async (params: {
    deploymentId: string;
    status?: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
    logs?: string;
    appUrl?: string;
  }): Promise<{ ok: boolean }> => {
    if (params.status) await db.exec`UPDATE deployments SET status = ${params.status}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    if (params.logs) await db.exec`UPDATE deployments SET logs = ${params.logs}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    if (params.appUrl) await db.exec`UPDATE deployments SET app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    return { ok: true };
  }
);

export const destroyDeployment = api(
  { method: "POST", path: "/deploy/deployments/:deploymentId/destroy", auth: true },
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

    const repoName = row.repo.split("/").pop() || "app";
    const appName = row.docker_image || repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
    const region = providerRow.region || "us-east-1";
    const credentials = { accessKeyId: providerRow.api_key, secretAccessKey: providerRow.api_secret };
    const errors: string[] = [];

    const stackName = `image-builder-app-${appName}`;
    try {
      const { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
      const cfn = new CloudFormationClient({ region, credentials });
      try {
        await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
        await cfn.send(new DeleteStackCommand({ StackName: stackName }));
      } catch (e: any) { if (!e.message?.includes("does not exist")) throw e; }
    } catch (e: any) { errors.push(`CloudFormation: ${e.message}`); }

    try {
      const { ECRClient, DeleteRepositoryCommand } = await import("@aws-sdk/client-ecr");
      const ecr = new ECRClient({ region, credentials });
      await ecr.send(new DeleteRepositoryCommand({ repositoryName: appName, force: true }));
    } catch (e: any) { if (!e.name?.includes("RepositoryNotFoundException")) errors.push(`ECR: ${e.message}`); }

    try {
      const { ECRClient, DeleteRepositoryCommand } = await import("@aws-sdk/client-ecr");
      const ecr = new ECRClient({ region, credentials });
      await ecr.send(new DeleteRepositoryCommand({ repositoryName: `${appName}-cache`, force: true }));
    } catch {}

    // 4. Delete S3 static site bucket (for S3 + CloudFront deploys)
    try {
      const { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({ region, credentials });
      const bucketName = `${appName}-static-site`;
      // Empty the bucket first
      const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucketName }));
      if (listed.Contents && listed.Contents.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: listed.Contents.map(o => ({ Key: o.Key! })) } }));
      }
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
    } catch {}

    const destroyTs = new Date().toISOString().replace("T", " ").slice(0, 19);
    const destroyLog = errors.length > 0
      ? `\n[${destroyTs}] ⚠ Partially destroyed. Errors: ${errors.join("; ")}`
      : `\n[${destroyTs}] ✓ Infrastructure destroyed (stack: ${stackName}, ECR: ${appName})`;
    await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', logs = logs || ${destroyLog}, updated_at = NOW() WHERE id = ${params.deploymentId}`;

    if (errors.length > 0) return { success: false, message: `Partially destroyed. Errors: ${errors.join("; ")}` };
    return { success: true, message: `Destroyed stack ${stackName}, ECR repo ${appName}.` };
  }
);
