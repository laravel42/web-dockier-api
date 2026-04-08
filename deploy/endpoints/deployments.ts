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
    const errors: string[] = [];

    // ── Pulumi-based providers (GCP, Hetzner, DigitalOcean, Vultr, Linode, etc.) ──
    if (providerRow.provider !== "aws") {
      const tofuRow = await db.queryRow<{ tofu_script: string }>`
        SELECT tofu_script FROM deployments WHERE id = ${params.deploymentId}`;
      const tofuScript = tofuRow?.tofu_script || "";
      const stateMarker = tofuScript.indexOf("/* STATE */\n");

      if (stateMarker === -1) {
        // No saved state — can't run pulumi destroy, mark as destroyed
        const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
        await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', logs = logs || ${`\n[${ts}] ⚠ No Pulumi state found — marked as destroyed but resources may still exist in cloud`}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
        return { success: true, message: "Marked as destroyed (no Pulumi state to clean up)" };
      }

      const savedState = tofuScript.slice(stateMarker + "/* STATE */\n".length);
      const pulumiScript = tofuScript.slice(0, stateMarker).trim();

      const { mkdtemp, writeFile, rm, mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { tmpdir, homedir } = await import("node:os");
      const { spawn } = await import("node:child_process");

      const pulumiPath = `${homedir()}/.pulumi/bin`;
      const augmentedPath = process.env.PATH ? `${pulumiPath}:${process.env.PATH}` : pulumiPath;

      const runCmd = (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<{ code: number; output: string }> => {
        return new Promise((resolve) => {
          const proc = spawn(cmd, args, { cwd: opts?.cwd, env: { ...process.env, PATH: augmentedPath, ...opts?.env }, stdio: ["ignore", "pipe", "pipe"] });
          let output = "";
          proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
          proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
          proc.on("close", (code) => resolve({ code: code ?? 1, output }));
          proc.on("error", (err) => resolve({ code: 1, output: err.message }));
        });
      };

      const workDir = await mkdtemp(join(tmpdir(), `destroy-${params.deploymentId.slice(0, 8)}-`));
      const pulumiDir = join(workDir, "pulumi");
      await mkdir(pulumiDir, { recursive: true });

      try {
        const { generatePulumiProject, generatePackageJson, generateTsConfig } = await import("../pulumi-templates/index");
        await writeFile(join(pulumiDir, "index.ts"), pulumiScript, "utf-8");
        await writeFile(join(pulumiDir, "Pulumi.yaml"), generatePulumiProject(repoName, providerRow.provider), "utf-8");
        await writeFile(join(pulumiDir, "package.json"), generatePackageJson(repoName, providerRow.provider), "utf-8");
        await writeFile(join(pulumiDir, "tsconfig.json"), generateTsConfig(), "utf-8");

        // Provider env vars
        const providerEnv: Record<string, string> = {};
        if (providerRow.provider === "digitalocean") providerEnv.DIGITALOCEAN_TOKEN = providerRow.api_key || "";
        else if (providerRow.provider === "hetzner") providerEnv.HCLOUD_TOKEN = providerRow.api_key || "";
        else if (providerRow.provider === "vultr") providerEnv.VULTR_API_KEY = providerRow.api_key || "";
        else if (providerRow.provider === "linode") providerEnv.LINODE_TOKEN = providerRow.api_key || "";
        else if (providerRow.provider === "gcp") {
          const credPath = join(pulumiDir, "gcp-credentials.json");
          await writeFile(credPath, providerRow.api_key || "{}", "utf-8");
          providerEnv.GOOGLE_CREDENTIALS = providerRow.api_key || "";
          providerEnv.GOOGLE_APPLICATION_CREDENTIALS = credPath;
        }
        const stateDir = join(pulumiDir, ".pulumi-state");
        await mkdir(stateDir, { recursive: true });
        providerEnv.PULUMI_BACKEND_URL = `file://${stateDir}`;
        providerEnv.PULUMI_CONFIG_PASSPHRASE = "";

        // Install deps
        await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });

        // Init stack and import state
        const stackName = `destroy-${params.deploymentId.slice(0, 8)}`;
        await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

        // Set GCP project if needed
        if (providerRow.provider === "gcp") {
          try {
            const creds = JSON.parse(providerRow.api_key || "{}");
            if (creds.project_id) await runCmd("pulumi", ["config", "set", "gcp:project", creds.project_id, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
          } catch {}
        }

        // Import saved state
        const stateFile = join(pulumiDir, "state.json");
        await writeFile(stateFile, savedState, "utf-8");
        const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--force", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
        if (importResult.code !== 0) {
          errors.push(`State import failed: ${importResult.output.split("\n").slice(-3).join(" ")}`);
        } else {
          // Run pulumi destroy
          const destroyResult = await runCmd("pulumi", ["destroy", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
          if (destroyResult.code !== 0) {
            errors.push(`Pulumi destroy failed: ${destroyResult.output.split("\n").filter(l => l.includes("error")).slice(-3).join(" ")}`);
          }
        }
      } catch (e: any) {
        errors.push(e.message || "Unknown error during destroy");
      } finally {
        try { await rm(workDir, { recursive: true, force: true }); } catch {}
      }

      const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
      const destroyLog = errors.length > 0
        ? `\n[${ts}] ⚠ Partially destroyed. Errors: ${errors.join("; ")}`
        : `\n[${ts}] ✓ Infrastructure destroyed via Pulumi`;
      await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', logs = logs || ${destroyLog}, updated_at = NOW() WHERE id = ${params.deploymentId}`;

      if (errors.length > 0) return { success: false, message: `Partially destroyed. Errors: ${errors.join("; ")}` };
      return { success: true, message: "Infrastructure destroyed via Pulumi." };
    }

    // ── AWS-specific destroy ──
    const credentials = { accessKeyId: providerRow.api_key, secretAccessKey: providerRow.api_secret };

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
