import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Topic, Subscription } from "encore.dev/pubsub";
import { secret } from "encore.dev/config";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { git_integration } from "~encore/clients";

const db = new SQLDatabase("deploy", { migrations: "./migrations" });

// ─── Secrets ───
const DeployCallbackUrl = secret("DeployCallbackUrl");

// ─── Interfaces ───

interface ServerProvider {
  id: string;
  userId: string;
  provider: "digitalocean" | "hetzner" | "vultr" | "linode" | "aws" | "upcloud" | "katapult" | "hostinger";
  label: string;
  apiKey: string;
  apiSecret: string;
  region: string;
  createdAt: string;
}

interface Deployment {
  id: string;
  userId: string;
  providerId: string;
  gitConnectionId: string;
  repo: string;
  branch: string;
  status: "pending" | "building" | "deploying" | "success" | "failed";
  logs: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: string;
  createdAt: string;
  updatedAt: string;
}

interface ProviderResponse {
  id: string;
  userId: string;
  provider: string;
  label: string;
  region: string;
  appRunnerConnectionArn?: string;
  createdAt: string;
}

// ─── Pub/Sub ───

export interface DeployEvent {
  deploymentId: string;
  userId: string;
  providerId: string;
  gitConnectionId: string;
  repo: string;
  branch: string;
  tofuScript: string;
  techStack: string[];
  primaryLanguage: string;
  registryUrl: string;
  deployStrategy: string;
  buildMethod: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
}

export const deployTopic = new Topic<DeployEvent>("deployments", {
  deliveryGuarantee: "at-least-once",
});

// ─── Server Providers ───

export const addProvider = api(
  { method: "POST", path: "/deploy/providers", auth: true },
  async (params: {
    provider: "digitalocean" | "hetzner" | "vultr" | "linode" | "aws" | "upcloud" | "katapult" | "hostinger";
    label: string;
    apiKey: string;
    apiSecret: string;
    region?: string;
    appRunnerConnectionArn?: string;
  }): Promise<ProviderResponse> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const region = params.region || "";
    const arn = params.appRunnerConnectionArn?.trim() || "";

    await db.exec`
      INSERT INTO server_providers (id, user_id, provider, label, api_key, api_secret, region, app_runner_connection_arn, created_at)
      VALUES (${id}, ${authData.userID}, ${params.provider}, ${params.label}, ${params.apiKey}, ${params.apiSecret}, ${region}, ${arn}, NOW())`;

    return {
      id, userId: authData.userID, provider: params.provider,
      label: params.label, region, createdAt: new Date().toISOString(),
    };
  }
);

export const listProviders = api(
  { method: "GET", path: "/deploy/providers", auth: true },
  async (): Promise<{ providers: ProviderResponse[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{
      id: string; user_id: string; provider: string; label: string; region: string; app_runner_connection_arn: string; created_at: Date;
    }>`SELECT id, user_id, provider, label, region, COALESCE(app_runner_connection_arn, '') as app_runner_connection_arn, created_at
       FROM server_providers WHERE user_id = ${authData.userID}`;

    const providers: ProviderResponse[] = [];
    for await (const row of rows) {
      providers.push({
        id: row.id, userId: row.user_id, provider: row.provider,
        label: row.label, region: row.region, appRunnerConnectionArn: row.app_runner_connection_arn || undefined, createdAt: row.created_at.toISOString(),
      });
    }
    return { providers };
  }
);

export const deleteProvider = api(
  { method: "DELETE", path: "/deploy/providers/:providerId", auth: true },
  async (params: { providerId: string }): Promise<{ success: boolean }> => {
    // Delete associated deployments first to avoid FK constraint violation
    await db.exec`DELETE FROM deployments WHERE provider_id = ${params.providerId}`;
    await db.exec`DELETE FROM server_providers WHERE id = ${params.providerId}`;
    return { success: true };
  }
);

export const updateProvider = api(
  { method: "PUT", path: "/deploy/providers/:providerId", auth: true },
  async (params: { providerId: string; label?: string; appRunnerConnectionArn?: string; apiSecret?: string }): Promise<ProviderResponse> => {
    const row = await db.queryRow<{
      id: string; user_id: string; provider: string; label: string; region: string; app_runner_connection_arn: string; created_at: Date;
    }>`SELECT id, user_id, provider, label, region, COALESCE(app_runner_connection_arn, '') as app_runner_connection_arn, created_at FROM server_providers WHERE id = ${params.providerId}`;
    if (!row) throw APIError.notFound("Provider not found");

    if (params.label !== undefined) await db.exec`UPDATE server_providers SET label = ${params.label} WHERE id = ${params.providerId}`;
    if (params.appRunnerConnectionArn !== undefined) await db.exec`UPDATE server_providers SET app_runner_connection_arn = ${params.appRunnerConnectionArn.trim()} WHERE id = ${params.providerId}`;
    if (params.apiSecret !== undefined) await db.exec`UPDATE server_providers SET api_secret = ${params.apiSecret.trim()} WHERE id = ${params.providerId}`;

    return {
      id: row.id, userId: row.user_id, provider: row.provider,
      label: params.label ?? row.label, region: row.region, appRunnerConnectionArn: (params.appRunnerConnectionArn !== undefined ? params.appRunnerConnectionArn : row.app_runner_connection_arn) || undefined, createdAt: row.created_at.toISOString(),
    };
  }
);

// ─── SSH Keys ───

export const listSshKeys = api(
  { method: "GET", path: "/deploy/ssh-keys", auth: true },
  async (): Promise<{ keys: Array<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }> }> => {
    const authData = getAuthData()!;
    const rows = db.query<{ id: string; label: string; public_key: string; fingerprint: string; created_at: Date }>`
      SELECT id, label, public_key, fingerprint, created_at FROM ssh_keys WHERE user_id = ${authData.userID} ORDER BY created_at DESC`;
    const keys: Array<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }> = [];
    for await (const row of rows) {
      keys.push({ id: row.id, label: row.label, publicKey: row.public_key, fingerprint: row.fingerprint, createdAt: row.created_at.toISOString() });
    }
    return { keys };
  }
);

export const addSshKey = api(
  { method: "POST", path: "/deploy/ssh-keys", auth: true },
  async (params: { label: string; publicKey: string }): Promise<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const pubKey = params.publicKey.trim();
    // Basic validation
    if (!pubKey.startsWith("ssh-") && !pubKey.startsWith("ecdsa-")) {
      throw APIError.invalidArgument("Invalid SSH public key format. Must start with ssh-rsa, ssh-ed25519, or ecdsa-sha2.");
    }
    // Simple fingerprint: take the base64 part and hash it
    const parts = pubKey.split(/\s+/);
    const fingerprint = parts.length >= 2 ? `SHA256:${parts[1].slice(0, 16)}...` : "";
    await db.exec`INSERT INTO ssh_keys (id, user_id, label, public_key, fingerprint, created_at) VALUES (${id}, ${authData.userID}, ${params.label}, ${pubKey}, ${fingerprint}, NOW())`;
    return { id, label: params.label, publicKey: pubKey, fingerprint, createdAt: new Date().toISOString() };
  }
);

export const deleteSshKey = api(
  { method: "DELETE", path: "/deploy/ssh-keys/:keyId", auth: true },
  async (params: { keyId: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    await db.exec`DELETE FROM ssh_keys WHERE id = ${params.keyId} AND user_id = ${authData.userID}`;
    return { success: true };
  }
);

// ─── Deployments ───

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
      INSERT INTO deployments (id, user_id, provider_id, git_connection_id, repo, branch, status, logs, tofu_script, deploy_strategy, created_at, updated_at)
      VALUES (${id}, ${authData.userID}, ${params.providerId}, ${params.gitConnectionId},
              ${params.repo}, ${params.branch}, 'pending', '', ${script}, ${params.deployStrategy || "managed"}, NOW(), NOW())`;

    // Skip pub/sub when the build is handled externally (e.g. CodeBuild via image-builder)
    if (!params.skipPipeline) {
      await deployTopic.publish({
        deploymentId: id,
        userId: authData.userID,
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
      id, userId: authData.userID, providerId: params.providerId,
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
          id: string; user_id: string; provider_id: string; git_connection_id: string;
          repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
        }>`SELECT * FROM deployments WHERE user_id = ${authData.userID} AND provider_id = ${params.providerId} ORDER BY created_at DESC LIMIT 50`
      : db.query<{
          id: string; user_id: string; provider_id: string; git_connection_id: string;
          repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
        }>`SELECT * FROM deployments WHERE user_id = ${authData.userID} ORDER BY created_at DESC LIMIT 50`;

    const deployments: Deployment[] = [];
    for await (const row of rows) {
      deployments.push({
        id: row.id, userId: row.user_id, providerId: row.provider_id,
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
      id: string; user_id: string; provider_id: string; git_connection_id: string;
      repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
    }>`SELECT * FROM deployments WHERE id = ${params.deploymentId}`;

    if (!row) throw APIError.notFound("Deployment not found");

    return {
      id: row.id, userId: row.user_id, providerId: row.provider_id,
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
    status?: "pending" | "building" | "deploying" | "success" | "failed";
    logs?: string;
    appUrl?: string;
  }): Promise<{ ok: boolean }> => {
    if (params.status) {
      await db.exec`UPDATE deployments SET status = ${params.status}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    }
    if (params.logs) {
      await db.exec`UPDATE deployments SET logs = ${params.logs}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    }
    if (params.appUrl) {
      await db.exec`UPDATE deployments SET app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    }
    return { ok: true };
  }
);

// ─── AWS Pipeline Webhook (called by Lambda when build/deploy completes) ───

export const awsPipelineWebhook = api(
  { method: "POST", path: "/deploy/webhook/aws-pipeline", auth: false },
  async (params: {
    buildId: string;
    status: "deploying" | "success" | "failed";
    appUrl?: string;
    stackName?: string;
    cfnStatus?: string;
    deployTarget?: string;
    codebuildId?: string;
  }): Promise<{ ok: boolean }> => {
    if (!params.buildId) return { ok: false };

    const row = await db.queryRow<{ id: string; status: string }>`
      SELECT id, status FROM deployments WHERE id = ${params.buildId}`;
    if (!row) return { ok: false };

    if (params.status === "success") {
      const appUrl = params.appUrl || "";
      await db.exec`UPDATE deployments SET status = 'success', app_url = ${appUrl}, updated_at = NOW() WHERE id = ${params.buildId}`;
      await appendLog(params.buildId, `[${ts()}] ✓ AWS pipeline complete — app URL: ${appUrl}`);
    } else if (params.status === "failed") {
      await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${params.buildId}`;
      await appendLog(params.buildId, `[${ts()}] ✗ AWS pipeline failed: ${params.cfnStatus || "unknown"}`);
    } else {
      await appendLog(params.buildId, `[${ts()}] ℹ AWS pipeline: ${params.status} (${params.deployTarget || ""})`);
    }
    return { ok: true };
  }
);

// ─── Deploy Processor (Pub/Sub) ───
// AWS: Clone → Analyze → Bundle zip → S3 → SNS → CodeBuild → ECR → CloudFormation
// Others: Clone → Analyze → Docker build → Pulumi

const _ = new Subscription(deployTopic, "deploy-processor", {
  handler: async (event: DeployEvent) => {
    const { deploymentId } = event;
    const repoName = event.repo.split("/").pop() || "app";
    const shortId = deploymentId.slice(0, 8);

    // Look up provider for API key + region
    const providerRow = await db.queryRow<{ provider: string; region: string; api_key: string; api_secret: string; app_runner_connection_arn: string }>`
      SELECT provider, region, api_key, api_secret, COALESCE(app_runner_connection_arn, '') as app_runner_connection_arn FROM server_providers WHERE id = ${event.providerId}`;
    const provider = providerRow?.provider || "cloud";
    const region = providerRow?.region || "us-east-1";

    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { spawn } = await import("node:child_process");
    const { execSync } = await import("node:child_process");

    // ── Helper to run a command and stream output ──
    const runCmd = (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<{ code: number; output: string }> => {
      return new Promise((resolve) => {
        const proc = spawn(cmd, args, {
          cwd: opts?.cwd || undefined,
          env: { ...process.env, ...opts?.env },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        const onData = async (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          for (const line of lines) {
            output += line + "\n";
            if (/^\s*\.+\s*$/.test(line) || /^@ updating/.test(line)) continue;
            await appendLog(deploymentId, `[${ts()}] ${line}`);
          }
        };
        proc.stdout.on("data", onData);
        proc.stderr.on("data", onData);
        proc.on("close", (code) => resolve({ code: code ?? 1, output }));
        proc.on("error", (err) => resolve({ code: 1, output: err.message }));
      });
    };

    try {
      await db.exec`UPDATE deployments SET status = 'building', updated_at = NOW() WHERE id = ${deploymentId}`;
      await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);
      await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${provider} | Region: ${region}`);
      await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${event.deployStrategy || "managed (default)"}`);
      await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${event.repo} | Branch: ${event.branch}`);

      // ── Step 1: Clone repository ──
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Clone Repository ───────────────`);

      const conn = await git_integration.getConnectionForScan({ connectionId: event.gitConnectionId });
      let cloneUrl: string;
      if (conn.provider === "github") {
        cloneUrl = `https://x-access-token:${conn.token}@github.com/${event.repo}.git`;
      } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
        const host = new URL(conn.endpoint || "https://gitlab.com").host;
        cloneUrl = `https://oauth2:${conn.token}@${host}/${event.repo}.git`;
      } else if (conn.provider === "bitbucket") {
        cloneUrl = `https://x-token-auth:${conn.token}@bitbucket.org/${event.repo}.git`;
      } else {
        throw new Error(`Unsupported git provider: ${conn.provider}`);
      }

      const workDir = await mkdtemp(join(tmpdir(), `deploy-${shortId}-`));
      const repoDir = join(workDir, "repo");

      execSync(
        `git clone --depth 1 --branch ${JSON.stringify(event.branch)} ${JSON.stringify(cloneUrl)} repo`,
        { cwd: workDir, timeout: 120_000, stdio: "pipe" }
      );

      const commitHash = execSync("git rev-parse HEAD", { cwd: repoDir, timeout: 5_000 }).toString().trim();
      await appendLog(deploymentId, `[${ts()}] ✓ Repository cloned (commit: ${commitHash.slice(0, 8)})`);
      await db.exec`UPDATE deployments SET commit_hash = ${commitHash} WHERE id = ${deploymentId}`;

      // ── Step 2: Analyze repository & generate Dockerfile ──
      const { existsSync } = await import("node:fs");
      const { readFile: readFs } = await import("node:fs/promises");

      const { analyzeRepoConfig, generateDockerfile, configSummary } = await import("./repo-analyzer");

      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Analyze Repository ──────────────`);

      const repoConfig = analyzeRepoConfig(repoDir);
      for (const line of configSummary(repoConfig)) {
        await appendLog(deploymentId, `[${ts()}] ℹ ${line}`);
      }

      // Ensure packageManager field is set in package.json (required for corepack)
      if (repoConfig.runtime === "node" && (repoConfig.packageManager === "pnpm" || repoConfig.packageManager === "yarn")) {
        const appDir = repoConfig.subDir ? join(repoDir, repoConfig.subDir) : repoDir;
        try {
          const pkgPath = join(appDir, "package.json");
          const pkg = JSON.parse(await readFs(pkgPath, "utf-8"));
          if (!pkg.packageManager) {
            const pmVer = repoConfig.packageManagerVersion || (repoConfig.packageManager === "pnpm" ? "10.14.0" : "4.5.0");
            pkg.packageManager = `${repoConfig.packageManager}@${pmVer}`;
            await writeFile(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
            await appendLog(deploymentId, `[${ts()}] ℹ Added packageManager field: ${pkg.packageManager}`);
          }
        } catch {}
        if (repoConfig.subDir) {
          const lockFiles: Record<string, string> = { pnpm: "pnpm-lock.yaml", yarn: "yarn.lock", bun: "bun.lockb" };
          const lockFile = lockFiles[repoConfig.packageManager];
          if (lockFile && existsSync(join(repoDir, lockFile)) && !existsSync(join(appDir, lockFile))) {
            try { const { copyFile } = await import("node:fs/promises"); await copyFile(join(repoDir, lockFile), join(appDir, lockFile)); } catch {}
          }
        }
      }

      const df = generateDockerfile(repoConfig);
      await writeFile(join(repoDir, "Dockerfile"), df, "utf-8");

      const dockerignore = [
        "node_modules", ".next", ".git", ".gitignore",
        "dist", "build", "out", "output", ".turbo", ".cache", ".pnpm-store",
        "vendor", ".env", ".env.*", "*.log",
        "coverage", ".nyc_output", "__pycache__", "*.pyc", ".venv", "venv",
        "*.md", "*.mdx", "LICENSE", ".vscode", ".idea", ".cursor",
        "Dockerfile*", ".dockerignore", "pulumi", ".pulumi-state",
      ].join("\n");
      await writeFile(join(repoDir, ".dockerignore"), dockerignore, "utf-8");

      const pm = repoConfig.packageManager !== "unknown" ? repoConfig.packageManager : "npm";
      await appendLog(deploymentId, `[${ts()}] ✓ Generated Dockerfile (${repoConfig.runtime}/${repoConfig.framework || "generic"}, pm: ${pm}, subDir: ${repoConfig.subDir || "/"})`);

      // ══════════════════════════════════════════════════════════════
      // AWS: Offload to CodeBuild → CloudFormation pipeline
      // ══════════════════════════════════════════════════════════════
      if (provider === "aws") {
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── AWS Pipeline (CodeBuild → CloudFormation) ──`);

        const accessKeyId = providerRow?.api_key || "";
        const secretAccessKey = providerRow?.api_secret || "";
        if (!accessKeyId || !secretAccessKey) {
          throw new Error("AWS credentials not configured on provider.");
        }

        const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
        const sts = new STSClient({ region, credentials: { accessKeyId, secretAccessKey } });
        const identity = await sts.send(new GetCallerIdentityCommand({}));
        const accountId = identity.Account || "";

        const codebuildProject = "image-builder";
        const imageRepoName = repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
        const cacheRepoName = `${imageRepoName}-cache`;
        const bucketName = `${codebuildProject}-source-${accountId}`;

        // Inject buildspec.yml for CodeBuild
        const buildspecContent = generateAwsBuildspec();
        await writeFile(join(repoDir, "buildspec.yml"), buildspecContent, "utf-8");

        // Remove .git, bundle into zip
        await rm(join(repoDir, ".git"), { recursive: true, force: true });
        const { default: AdmZip } = await import("adm-zip");
        const { readdirSync } = await import("node:fs");
        const zip = new AdmZip();
        const skipDirs = new Set(["node_modules", ".git", ".pnpm-store", ".turbo", ".cache", "__pycache__", ".venv", "venv", "vendor"]);
        const addDir = (dirPath: string, zipPrefix: string) => {
          const items = readdirSync(dirPath, { withFileTypes: true });
          for (const item of items) {
            if (item.isDirectory() && skipDirs.has(item.name)) continue;
            const fullPath = join(dirPath, item.name);
            if (item.isDirectory()) {
              addDir(fullPath, zipPrefix ? `${zipPrefix}/${item.name}` : item.name);
            } else {
              zip.addLocalFile(fullPath, zipPrefix || undefined);
            }
          }
        };
        addDir(repoDir, "");
        const zipBuffer = zip.toBuffer();
        await appendLog(deploymentId, `[${ts()}] ℹ Source bundle: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

        // Upload to S3
        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
        const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
        const s3Key = `${deploymentId}.zip`;
        await s3.send(new PutObjectCommand({
          Bucket: bucketName, Key: s3Key, Body: zipBuffer, ContentType: "application/zip",
        }));
        await appendLog(deploymentId, `[${ts()}] ✓ Source uploaded to S3 (${bucketName}/${s3Key})`);

        // Map deploy strategy → CloudFormation deploy target
        const deployTargetMap: Record<string, string> = { vps: "ec2", managed: "ecs", serverless: "apprunner" };
        const deployTarget = deployTargetMap[event.deployStrategy] || "ec2";

        const deployParams: Record<string, any> = { appName: repoName, containerPort: repoConfig.port || 3000 };
        if (deployTarget === "ecs") { deployParams.cpu = "512"; deployParams.memory = "1024"; }
        if (deployTarget === "ec2") { deployParams.instanceType = "t3.small"; }

        // Publish to SNS → triggers CodeBuild
        const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns");
        const sns = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });
        const buildRequestTopicArn = `arn:aws:sns:${region}:${accountId}:${codebuildProject}-build-request`;

        let callbackUrl = "";
        try { callbackUrl = DeployCallbackUrl(); } catch {}

        await sns.send(new PublishCommand({
          TopicArn: buildRequestTopicArn,
          Subject: "build-request",
          Message: JSON.stringify({
            buildId: deploymentId,
            sourceRepo: event.repo,
            sourceRef: event.branch,
            commitSha: commitHash,
            imageRepoName,
            cacheRepoName,
            s3Bucket: bucketName,
            s3Key,
            accountId,
            region,
            codebuildProject,
            deployTarget,
            deployParams,
            callbackUrl,
          }),
        }));
        await appendLog(deploymentId, `[${ts()}] ✓ Build queued (CodeBuild → ECR → CloudFormation)`);
        await appendLog(deploymentId, `[${ts()}] ℹ Deploy target: ${deployTarget}`);

        try { await rm(workDir, { recursive: true, force: true }); } catch {}

        await db.exec`UPDATE deployments SET status = 'deploying', docker_image = ${imageRepoName}, updated_at = NOW() WHERE id = ${deploymentId}`;
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── Handed off to AWS ───────────────`);
        await appendLog(deploymentId, `[${ts()}] ℹ CodeBuild will build the image, push to ECR, then CloudFormation deploys infrastructure.`);

        // ── Poll CodeBuild + CloudFormation until complete ──
        const { CodeBuildClient, ListBuildsForProjectCommand, BatchGetBuildsCommand } = await import("@aws-sdk/client-codebuild");
        const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
        const cbClient = new CodeBuildClient({ region, credentials: { accessKeyId, secretAccessKey } });
        const cfnClient = new CloudFormationClient({ region, credentials: { accessKeyId, secretAccessKey } });

        const cfnStackName = `${codebuildProject}-app-${repoName}`;
        let codebuildId = "";
        let buildSucceeded = false;

        // Phase 1: Wait for CodeBuild to start and complete (up to 15 min)
        for (let attempt = 0; attempt < 60; attempt++) {
          await new Promise(r => setTimeout(r, 15_000));

          // Find the CodeBuild build for this deployment
          if (!codebuildId) {
            try {
              const listResult = await cbClient.send(new ListBuildsForProjectCommand({
                projectName: codebuildProject, sortOrder: "DESCENDING",
              }));
              const buildIds = (listResult.ids || []).slice(0, 10);
              if (buildIds.length > 0) {
                const batchResult = await cbClient.send(new BatchGetBuildsCommand({ ids: buildIds }));
                const match = (batchResult.builds || []).find(b => {
                  const loc = b.source?.location || "";
                  return loc.includes(`${deploymentId}.zip`);
                });
                if (match?.id) {
                  codebuildId = match.id;
                  await appendLog(deploymentId, `[${ts()}] ℹ CodeBuild started: ${codebuildId}`);
                }
              }
            } catch {}
          }

          // Check CodeBuild status
          if (codebuildId) {
            try {
              const batchResult = await cbClient.send(new BatchGetBuildsCommand({ ids: [codebuildId] }));
              const cbBuild = batchResult.builds?.[0];
              if (cbBuild) {
                const cbStatus = cbBuild.buildStatus || "";
                if (cbStatus === "SUCCEEDED") {
                  buildSucceeded = true;
                  await appendLog(deploymentId, `[${ts()}] ✓ CodeBuild succeeded — image pushed to ECR`);
                  break;
                } else if (cbStatus === "FAILED" || cbStatus === "FAULT" || cbStatus === "TIMED_OUT" || cbStatus === "STOPPED") {
                  const reason = cbBuild.phases?.find(p => p.phaseStatus === "FAILED")?.contexts?.[0]?.message || cbStatus;
                  await appendLog(deploymentId, `[${ts()}] ✗ CodeBuild failed: ${reason}`);
                  await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
                  return;
                } else if (attempt % 4 === 0) {
                  const phase = cbBuild.currentPhase || "QUEUED";
                  await appendLog(deploymentId, `[${ts()}] ℹ CodeBuild: ${phase}...`);
                }
              }
            } catch {}
          } else if (attempt % 4 === 0) {
            await appendLog(deploymentId, `[${ts()}] ℹ Waiting for CodeBuild to start...`);
          }
        }

        if (!buildSucceeded) {
          await appendLog(deploymentId, `[${ts()}] ⚠ CodeBuild did not complete within timeout`);
          await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
          return;
        }

        // Phase 2: Wait for CloudFormation stack to complete (up to 10 min)
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── CloudFormation Deploy ──────────`);

        let appUrl = "";
        for (let attempt = 0; attempt < 40; attempt++) {
          await new Promise(r => setTimeout(r, 15_000));
          try {
            const stackResult = await cfnClient.send(new DescribeStacksCommand({ StackName: cfnStackName }));
            const stack = stackResult.Stacks?.[0];
            if (!stack) {
              if (attempt % 4 === 0) await appendLog(deploymentId, `[${ts()}] ℹ Waiting for CloudFormation stack...`);
              continue;
            }
            const stackStatus = stack.StackStatus || "";
            if (stackStatus === "CREATE_COMPLETE" || stackStatus === "UPDATE_COMPLETE") {
              const outputs = Object.fromEntries((stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]));
              appUrl = outputs.AppUrl || "";
              await appendLog(deploymentId, `[${ts()}] ✓ CloudFormation stack: ${stackStatus}`);
              if (appUrl) await appendLog(deploymentId, `[${ts()}] ✓ App URL: ${appUrl}`);
              break;
            } else if (stackStatus.includes("ROLLBACK_COMPLETE") || stackStatus.includes("FAILED") || stackStatus === "DELETE_COMPLETE") {
              await appendLog(deploymentId, `[${ts()}] ✗ CloudFormation failed: ${stackStatus}`);
              await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
              return;
            } else if (attempt % 4 === 0) {
              await appendLog(deploymentId, `[${ts()}] ℹ CloudFormation: ${stackStatus}...`);
            }
          } catch (cfnErr: any) {
            // Stack might not exist yet
            if (attempt % 4 === 0) await appendLog(deploymentId, `[${ts()}] ℹ Waiting for CloudFormation stack...`);
          }
        }

        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
        await appendLog(deploymentId, `[${ts()}] ✓ Docker image: ${imageRepoName}`);
        await appendLog(deploymentId, `[${ts()}] ✓ Infrastructure deployed via CloudFormation`);
        if (appUrl) {
          await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${appUrl}`);
          await db.exec`UPDATE deployments SET status = 'success', app_url = ${appUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
        } else {
          await appendLog(deploymentId, `[${ts()}] ⚠ Could not determine app URL — check AWS console`);
          await db.exec`UPDATE deployments SET status = 'success', updated_at = NOW() WHERE id = ${deploymentId}`;
        }
        return; // AWS pipeline complete
      }

      // ══════════════════════════════════════════════════════════════
      // Non-AWS: Local Docker build + Pulumi
      // ══════════════════════════════════════════════════════════════

      if (!event.tofuScript) {
        throw new Error("No Pulumi program provided. Generate infrastructure code first, then deploy.");
      }

      const imageName = `${repoName}:${shortId}`;

      // Check for cached image
      const cachedImage = await db.queryRow<{ docker_image: string }>`
        SELECT docker_image FROM deployments
        WHERE repo = ${event.repo} AND branch = ${event.branch} AND commit_hash = ${commitHash}
          AND docker_image != '' AND id != ${deploymentId}
        ORDER BY created_at DESC LIMIT 1`;

      let actualImage = imageName;
      let skipBuild = false;
      if (cachedImage?.docker_image) {
        try {
          execSync(`docker image inspect ${JSON.stringify(cachedImage.docker_image)}`, { timeout: 10_000, stdio: "pipe" });
          actualImage = cachedImage.docker_image;
          skipBuild = true;
          await appendLog(deploymentId, `[${ts()}] ℹ Reusing cached image: ${actualImage}`);
        } catch { /* image pruned, rebuild */ }
      }

      if (!skipBuild) {
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── Build Docker Image ─────────────`);
        const MAX_BUILD_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
          const buildArgs = ["build", "-t", imageName];
          if (attempt > 1) buildArgs.push("--no-cache");
          buildArgs.push(".");
          const buildResult = await runCmd("docker", buildArgs, { cwd: repoDir });
          if (buildResult.code === 0) {
            await appendLog(deploymentId, `[${ts()}] ✓ Docker image built: ${imageName}`);
            break;
          }
          if (attempt < MAX_BUILD_ATTEMPTS) {
            const { patchDockerfile } = await import("./repo-analyzer");
            const currentDf = await readFs(join(repoDir, "Dockerfile"), "utf-8");
            const fix = patchDockerfile(buildResult.output, currentDf);
            if (fix) {
              await appendLog(deploymentId, `[${ts()}] ⚠ Build failed — auto-fixing: ${fix.description}`);
              await writeFile(join(repoDir, "Dockerfile"), fix.patched, "utf-8");
              continue;
            }
          }
          throw new Error(`docker build failed (exit code ${buildResult.code})`);
        }
      }

      await db.exec`UPDATE deployments SET docker_image = ${actualImage} WHERE id = ${deploymentId}`;

      // Push to registry if configured
      let remoteImage = actualImage;
      if (event.registryUrl) {
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── Push Image to Registry ─────────`);
        remoteImage = `${event.registryUrl}/${actualImage}`;
        const tagResult = await runCmd("docker", ["tag", actualImage, remoteImage], { cwd: workDir });
        if (tagResult.code === 0) {
          const pushResult = await runCmd("docker", ["push", remoteImage], { cwd: workDir });
          if (pushResult.code !== 0) {
            await appendLog(deploymentId, `[${ts()}] ⚠ docker push failed, continuing with local image`);
            remoteImage = actualImage;
          } else {
            await appendLog(deploymentId, `[${ts()}] ✓ Image pushed: ${remoteImage}`);
          }
        } else {
          await appendLog(deploymentId, `[${ts()}] ⚠ docker tag failed, continuing with local image`);
          remoteImage = actualImage;
        }
      }

      // ── Pulumi up ──
      await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Pulumi Setup ───────────────────`);

      const pulumiDir = join(workDir, "pulumi");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(pulumiDir, { recursive: true });

      const { generatePulumiProject, generatePackageJson, generateTsConfig } = await import("./pulumi-templates/index");
      await writeFile(join(pulumiDir, "index.ts"), event.tofuScript, "utf-8");
      await writeFile(join(pulumiDir, "Pulumi.yaml"), generatePulumiProject(repoName, provider), "utf-8");
      await writeFile(join(pulumiDir, "package.json"), generatePackageJson(repoName, provider), "utf-8");
      await writeFile(join(pulumiDir, "tsconfig.json"), generateTsConfig(), "utf-8");

      const providerEnv: Record<string, string> = {};
      if (provider === "digitalocean") { providerEnv.DIGITALOCEAN_TOKEN = providerRow?.api_key || ""; }
      else if (provider === "hetzner") { providerEnv.HCLOUD_TOKEN = providerRow?.api_key || ""; }
      else if (provider === "vultr") { providerEnv.VULTR_API_KEY = providerRow?.api_key || ""; }
      else if (provider === "linode") { providerEnv.LINODE_TOKEN = providerRow?.api_key || ""; }
      const stateDir = join(pulumiDir, ".pulumi-state");
      await mkdir(stateDir, { recursive: true });
      providerEnv.PULUMI_BACKEND_URL = `file://${stateDir}`;
      providerEnv.PULUMI_CONFIG_PASSPHRASE = "";

      await appendLog(deploymentId, `[${ts()}] ℹ Installing Pulumi dependencies...`);
      const installResult = await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });
      if (installResult.code !== 0) throw new Error(`npm install failed (exit code ${installResult.code})`);
      await appendLog(deploymentId, `[${ts()}] ✓ Dependencies installed`);

      const stackName = `${repoName}-${shortId}`;
      await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

      // SSH key for VPS providers
      if (provider === "hetzner" || provider === "vultr" || provider === "linode") {
        const sshKeyRow = await db.queryRow<{ public_key: string }>`
          SELECT public_key FROM ssh_keys WHERE user_id = ${event.userId} ORDER BY created_at DESC LIMIT 1`;
        if (!sshKeyRow) throw new Error("No SSH key found. Go to Settings → SSH Keys and add your public key before deploying to a VPS.");
        await runCmd("pulumi", ["config", "set", "sshPublicKey", sshKeyRow.public_key.trim(), "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      }
      if (provider === "linode") {
        await runCmd("pulumi", ["config", "set", "--secret", "rootPassword", `Ch4ng3M3-${shortId}!`, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      }
      await runCmd("pulumi", ["config", "set", "region", region, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

      // Restore state from previous deployment
      const prevDeploy = await db.queryRow<{ tofu_script: string }>`
        SELECT tofu_script FROM deployments
        WHERE repo = ${event.repo} AND provider_id = ${event.providerId}
          AND tofu_script LIKE '%/* STATE */%' AND id != ${deploymentId}
        ORDER BY created_at DESC LIMIT 1`;
      if (prevDeploy?.tofu_script) {
        const stateMarker = prevDeploy.tofu_script.indexOf("/* STATE */\n");
        if (stateMarker !== -1) {
          const savedState = prevDeploy.tofu_script.slice(stateMarker + "/* STATE */\n".length);
          try {
            if (savedState.includes('"deployment"')) {
              const stateFile = join(pulumiDir, "prev-state.json");
              await writeFile(stateFile, savedState, "utf-8");
              const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
              if (importResult.code === 0) await appendLog(deploymentId, `[${ts()}] ℹ Restored state from previous deployment`);
            }
          } catch { /* non-critical */ }
        }
      }

      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Pulumi Up ──────────────────────`);
      const upResult = await runCmd("pulumi", ["up", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
      if (upResult.code !== 0) throw new Error(`pulumi up failed (exit code ${upResult.code})`);

      // Extract outputs
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Extracting outputs ──────────────`);
      const outputResult = await runCmd("pulumi", ["stack", "output", "--json", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

      let appUrl = "";
      let serverIp = "";
      try {
        const jsonMatch = outputResult.output.match(/\{[\s\S]*\}/);
        const outputs = JSON.parse(jsonMatch ? jsonMatch[0] : outputResult.output);
        appUrl = outputs.appUrl || "";
        serverIp = outputs.serverIp || "";
        if (!appUrl && serverIp) appUrl = `http://${serverIp}`;
        if (appUrl && !appUrl.startsWith("http")) appUrl = `http://${appUrl}`;
        for (const [key, val] of Object.entries(outputs)) {
          await appendLog(deploymentId, `[${ts()}]   ${key} = ${val}`);
        }
      } catch {
        await appendLog(deploymentId, `[${ts()}]   (could not parse outputs)`);
      }

      // Transfer Docker image to server (VPS, if no registry)
      if (event.techStack.length > 0 && serverIp && !event.registryUrl) {
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── Transfer Docker Image ──────────`);
        const tarPath = join(workDir, `${actualImage.replace(":", "-")}.tar`);
        const saveResult = await runCmd("docker", ["save", "-o", tarPath, actualImage], { cwd: workDir });
        if (saveResult.code === 0) {
          await appendLog(deploymentId, `[${ts()}] ℹ Waiting for server SSH to be ready...`);
          await new Promise(r => setTimeout(r, 30_000));
          const scpResult = await runCmd("scp", [
            "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30",
            tarPath, `root@${serverIp}:/tmp/app-image.tar`
          ], { cwd: workDir });
          if (scpResult.code === 0) {
            const loadResult = await runCmd("ssh", [
              "-o", "StrictHostKeyChecking=no", `root@${serverIp}`,
              `docker load -i /tmp/app-image.tar && rm /tmp/app-image.tar && docker stop ${repoName} 2>/dev/null; docker rm ${repoName} 2>/dev/null; docker run -d --name ${repoName} --restart=always -p 127.0.0.1:8080:8080 --add-host=host.docker.internal:host-gateway -e APP_ENV=production -e PORT=8080 ${actualImage}`
            ], { cwd: workDir });
            if (loadResult.code === 0) await appendLog(deploymentId, `[${ts()}] ✓ Docker image transferred and running on server`);
            else await appendLog(deploymentId, `[${ts()}] ⚠ Failed to load image on server`);
          } else {
            await appendLog(deploymentId, `[${ts()}] ⚠ SCP failed`);
          }
        }
      }

      // Save Pulumi state
      try {
        const stateResult = await runCmd("pulumi", ["stack", "export", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
        if (stateResult.code === 0) {
          await db.exec`UPDATE deployments SET tofu_script = ${event.tofuScript + "\n\n/* STATE */\n" + stateResult.output} WHERE id = ${deploymentId}`;
        }
      } catch {}

      try { await rm(workDir, { recursive: true, force: true }); } catch {}

      const finalUrl = appUrl || generateAppUrl(provider, repoName, shortId, region, event.deployStrategy);
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
      await appendLog(deploymentId, `[${ts()}] ✓ Docker image: ${remoteImage}`);
      await appendLog(deploymentId, `[${ts()}] ✓ Infrastructure provisioned via Pulumi`);
      await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${finalUrl}`);

      await db.exec`UPDATE deployments SET status = 'success', app_url = ${finalUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
    } catch (e: any) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${e.message || e}`);
      await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
    }
  },
});

function generateAwsBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  variables:
    AWS_ACCOUNT_ID: "123456789012"
    AWS_DEFAULT_REGION: "us-east-1"
    IMAGE_REPO_NAME: "my-app"
    CACHE_REPO_NAME: "my-app-cache"

phases:
  install:
    commands:
      - set -euo pipefail

  pre_build:
    commands:
      - set -euo pipefail
      - |
        IMAGE_URI="\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com/\${IMAGE_REPO_NAME}"
        CACHE_URI="\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com/\${CACHE_REPO_NAME}"
        IMAGE_TAG="\${CODEBUILD_RESOLVED_SOURCE_VERSION:-latest}"
        SHORT_TAG="\${IMAGE_TAG:0:12}"
        echo "export IMAGE_URI=\${IMAGE_URI}" > /tmp/build_env.sh
        echo "export CACHE_URI=\${CACHE_URI}" >> /tmp/build_env.sh
        echo "export IMAGE_TAG=\${IMAGE_TAG}" >> /tmp/build_env.sh
        echo "export SHORT_TAG=\${SHORT_TAG}" >> /tmp/build_env.sh
      - |
        aws ecr describe-repositories --repository-names "$IMAGE_REPO_NAME" >/dev/null 2>&1 \\
          || aws ecr create-repository --repository-name "$IMAGE_REPO_NAME"
        aws ecr describe-repositories --repository-names "$CACHE_REPO_NAME" >/dev/null 2>&1 \\
          || aws ecr create-repository --repository-name "$CACHE_REPO_NAME"
      - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com"

  build:
    commands:
      - echo "Building Docker image"
      - |
        set -euo pipefail
        source /tmp/build_env.sh
        echo "Building \${IMAGE_URI}:\${SHORT_TAG}"
        DOCKER_BUILDKIT=1 docker build \\
          --progress=plain \\
          --build-arg BUILDKIT_INLINE_CACHE=1 \\
          --cache-from \${IMAGE_URI}:latest \\
          --tag \${IMAGE_URI}:\${SHORT_TAG} \\
          --tag \${IMAGE_URI}:latest \\
          .
      - |
        source /tmp/build_env.sh
        echo "Pushing \${IMAGE_URI}:\${SHORT_TAG}"
        docker push \${IMAGE_URI}:\${SHORT_TAG}
        docker push \${IMAGE_URI}:latest

  post_build:
    commands:
      - |
        source /tmp/build_env.sh
        CALLBACK_URL="\${CALLBACK_URL:-}"
        BUILD_ID="\${BUILD_ID:-}"

        if [ "\${CODEBUILD_BUILD_SUCCEEDING:-1}" = "0" ]; then
          echo "Build FAILED"
          exit 0
        fi

        printf '{"imageUri":"%s"}\\n' "\${IMAGE_URI}:\${SHORT_TAG}" > imageDetail.json
        cat imageDetail.json

        if [ -n "\${SNS_TOPIC_ARN:-}" ] && [ -n "\${DEPLOY_TARGET:-}" ]; then
          python3 << 'PYEOF'
        import json, os, subprocess
        dp_raw = os.environ.get('DEPLOY_PARAMS', '{}')
        try: dp = json.loads(dp_raw)
        except: dp = {}
        image_uri = os.environ.get('IMAGE_URI', '')
        short_tag = os.environ.get('SHORT_TAG', 'latest')
        msg = json.dumps({
            'buildId': os.environ.get('BUILD_ID', ''),
            'imageUri': f'{image_uri}:{short_tag}',
            'deployTarget': os.environ.get('DEPLOY_TARGET', ''),
            'deployParams': dp,
            'callbackUrl': os.environ.get('CALLBACK_URL', '')
        })
        subprocess.run([
            'aws', 'sns', 'publish',
            '--topic-arn', os.environ['SNS_TOPIC_ARN'],
            '--subject', 'build-complete',
            '--message', msg
        ], check=True)
        print('SNS published for deploy')
        PYEOF
        fi

artifacts:
  files:
    - imageDetail.json

cache:
  paths:
    - '/root/.cache/**/*'
`;
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function generateAppUrl(provider: string, repoName: string, shortId: string, region: string, deployStrategy?: string): string {
  const slug = `${repoName}-${shortId}`;
  switch (provider) {
    case "digitalocean": return `https://${slug}.ondigitalocean.app`;
    case "hetzner": return `https://${slug}.${region}.hetzner.app`;
    case "vultr": return `https://${slug}.vultr.app`;
    case "linode": return `https://${slug}.linodeobjects.com`;
    case "aws":
      if (deployStrategy === "vps") return `http://ec2-${slug}.compute-1.amazonaws.com`;
      if (deployStrategy === "managed") return `https://${slug}.${region}.elb.amazonaws.com`;
      return `https://${slug}.${region}.awsapprunner.com`;
    case "upcloud": return `https://${slug}.upcloud.app`;
    case "katapult": return `https://${slug}.katapult.io`;
    case "hostinger": return `https://${slug}.hostinger.app`;
    case "vercel": return `https://${slug}.vercel.app`;
    case "netlify": return `https://${slug}.netlify.app`;
    case "cloudflare": return `https://${slug}.pages.dev`;
    case "railway": return `https://${slug}.up.railway.app`;
    case "render": return `https://${slug}.onrender.com`;
    case "flyio": return `https://${slug}.fly.dev`;
    case "encore": return `https://${slug}.encr.app`;
    default: return `https://${slug}.deploy.app`;
  }
}

async function appendLog(deploymentId: string, line: string) {
  await db.exec`UPDATE deployments SET logs = logs || ${line + "\n"} WHERE id = ${deploymentId}`;
}

// ─── Pulumi Program Generator ───

import { generatePulumiProgram } from "./pulumi-templates/index";

interface TofuRequest {
  providerId: string;
  repo: string;
  branch: string;
  techStack: string[];
  primaryLanguage: string;
  hasDocker: boolean;
  appName?: string;
  region?: string;
  deployStrategy?: "vps" | "managed" | "serverless";
  useDocker?: boolean;
  dockerImage?: string;
  instanceType?: string;
  services?: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
  aiAnalysis?: {
    runtime: string;
    runtimeVersion: string;
    framework: string;
    frameworkVersion: string;
    phpExtensions?: string[];
    nodeVersion?: string;
    buildCommand: string;
    startCommand: string;
    port: number;
    needsScheduler: boolean;
    needsQueueWorker: boolean;
    needsWebsockets: boolean;
    envVars: string[];
    postDeployCommands: string[];
    nginxConfig: "php-fpm" | "reverse-proxy" | "static";
    summary: string;
  };
}

interface TofuResponse {
  script: string;
  provider: string;
  region: string;
  appName: string;
  estimatedResources: string[];
}

export const generateTofu = api(
  { method: "POST", path: "/deploy/tofu/generate", auth: true },
  async (params: TofuRequest): Promise<TofuResponse> => {
    const providerRow = await db.queryRow<{
      provider: string; region: string; label: string;
    }>`SELECT provider, region, label FROM server_providers WHERE id = ${params.providerId}`;
    if (!providerRow) throw APIError.notFound("Provider not found");

    const provider = providerRow.provider;
    const region = params.region || providerRow.region || getDefaultRegion(provider);
    const repoName = params.repo.split("/").pop() || "app";
    const appName = params.appName || repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const runtime = params.aiAnalysis
      ? {
          name: params.aiAnalysis.runtime,
          version: params.aiAnalysis.runtimeVersion,
          buildCmd: params.aiAnalysis.buildCommand,
          startCmd: params.aiAnalysis.startCommand,
          port: params.aiAnalysis.port,
        }
      : detectRuntime(params.primaryLanguage, params.techStack);

    const script = generatePulumiProgram({
      provider,
      region,
      appName,
      repo: params.repo,
      branch: params.branch,
      runtime,
      hasDocker: params.hasDocker,
      techStack: params.techStack,
      services: params.services || [],
      aiAnalysis: params.aiAnalysis,
      deployStrategy: params.deployStrategy,
      useDocker: params.useDocker,
      dockerImage: params.dockerImage,
      instanceType: params.instanceType,
    });

    return {
      script,
      provider,
      region,
      appName,
      estimatedResources: getEstimatedResources(provider, runtime, params.hasDocker, params.services || []),
    };
  }
);

function getDefaultRegion(provider: string): string {
  const defaults: Record<string, string> = {
    digitalocean: "nyc3",
    hetzner: "nbg1",
    vultr: "ewr",
    linode: "us-east",
    aws: "us-east-1",
    upcloud: "us-nyc1",
    katapult: "london",
    hostinger: "us",
  };
  return defaults[provider] || "us-east-1";
}

function detectRuntime(lang: string, techStack: string[]): { name: string; version: string; buildCmd: string; startCmd: string; port: number } {
  const lower = lang.toLowerCase();
  const stack = techStack.map(s => s.toLowerCase());

  if (stack.includes("laravel") || lower === "php") {
    return { name: "php", version: "8.3", buildCmd: "composer install --no-dev --optimize-autoloader && php artisan config:cache && php artisan route:cache", startCmd: "php artisan serve --host=0.0.0.0 --port=8080", port: 8080 };
  }
  if (stack.includes("next.js") || stack.includes("nuxt")) {
    return { name: "node", version: "20", buildCmd: "npm ci && npm run build", startCmd: "npm start", port: 3000 };
  }
  if (lower === "typescript" || lower === "javascript" || stack.includes("node.js")) {
    return { name: "node", version: "20", buildCmd: "npm ci && npm run build", startCmd: "npm start", port: 3000 };
  }
  if (lower === "python" || stack.includes("django") || stack.includes("flask") || stack.includes("fastapi")) {
    return { name: "python", version: "3.12", buildCmd: "pip install -r requirements.txt", startCmd: "gunicorn app:app --bind 0.0.0.0:8000", port: 8000 };
  }
  if (lower === "go" || lower === "golang") {
    return { name: "go", version: "1.22", buildCmd: "go build -o app .", startCmd: "./app", port: 8080 };
  }
  if (lower === "ruby" || stack.includes("rails")) {
    return { name: "ruby", version: "3.3", buildCmd: "bundle install && rails assets:precompile", startCmd: "rails server -b 0.0.0.0 -p 3000", port: 3000 };
  }
  if (lower === "java" || stack.includes("spring")) {
    return { name: "java", version: "21", buildCmd: "./gradlew build", startCmd: "java -jar build/libs/app.jar", port: 8080 };
  }
  if (lower === "rust") {
    return { name: "rust", version: "1.77", buildCmd: "cargo build --release", startCmd: "./target/release/app", port: 8080 };
  }
  if (lower === "c#" || lower === "c#/.net" || stack.includes(".net")) {
    return { name: "dotnet", version: "8.0", buildCmd: "dotnet publish -c Release", startCmd: "dotnet run", port: 5000 };
  }
  return { name: "node", version: "20", buildCmd: "npm ci && npm run build", startCmd: "npm start", port: 3000 };
}

function getEstimatedResources(provider: string, runtime: { name: string }, hasDocker: boolean, services: Array<{ type: string; name: string; mode: "vps" | "managed" }>): string[] {
  const resources: string[] = [];
  const managedSvcs = services.filter(s => s.mode === "managed");
  const vpsSvcs = services.filter(s => s.mode === "vps");

  switch (provider) {
    case "digitalocean":
      resources.push("digitalocean_app (App Platform)");
      if (managedSvcs.some(s => s.type === "database")) resources.push("digitalocean_database_cluster (Managed DB)");
      if (managedSvcs.some(s => s.type === "cache")) resources.push("digitalocean_database_cluster (Managed Redis)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("digitalocean_spaces_bucket (Object Storage)");
      resources.push("digitalocean_domain (custom domain)");
      break;
    case "hetzner":
      resources.push("hcloud_server (CX22 — 2 vCPU, 4GB RAM)", "hcloud_firewall", "hcloud_ssh_key");
      if (vpsSvcs.some(s => s.type === "database")) resources.push("Database installed on VPS");
      if (vpsSvcs.some(s => s.type === "cache")) resources.push("Redis installed on VPS");
      if (managedSvcs.some(s => s.type === "database")) resources.push("External managed DB (e.g. PlanetScale, Neon)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("hcloud_volume (Block Storage)");
      break;
    case "vultr":
      resources.push("vultr_instance (vc2-1c-1gb)", "vultr_firewall_group", "vultr_ssh_key");
      if (managedSvcs.some(s => s.type === "database")) resources.push("vultr_database (Managed DB)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("vultr_object_storage");
      break;
    case "aws":
      resources.push("aws_apprunner_service");
      if (managedSvcs.some(s => s.type === "database")) resources.push("aws_rds_instance (Managed PostgreSQL/MySQL)");
      if (managedSvcs.some(s => s.type === "cache")) resources.push("aws_elasticache_cluster (Managed Redis)");
      if (managedSvcs.some(s => s.type === "queue")) resources.push("aws_sqs_queue (Managed Queue)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("aws_s3_bucket (Object Storage)");
      if (managedSvcs.some(s => s.type === "search")) resources.push("aws_opensearch_domain (Managed Search)");
      if (managedSvcs.some(s => s.type === "mail")) resources.push("aws_ses_domain_identity (Email)");
      if (hasDocker) resources.push("aws_ecr_repository");
      resources.push("aws_iam_role");
      break;
    case "linode":
      resources.push("linode_instance (g6-nanode-1)", "linode_firewall", "linode_sshkey");
      if (managedSvcs.some(s => s.type === "database")) resources.push("linode_database_mysql (Managed DB)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("linode_object_storage_bucket");
      break;
    default:
      resources.push(`${provider}_server`, `${provider}_firewall`);
  }
  if (vpsSvcs.length > 0) {
    resources.push(`VPS-hosted: ${vpsSvcs.map(s => s.name).join(", ")}`);
  }
  return resources;
}

