import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Topic, Subscription } from "encore.dev/pubsub";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";

const db = new SQLDatabase("deploy", { migrations: "./migrations" });

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
  createdAt: string;
  updatedAt: string;
}

interface ProviderResponse {
  id: string;
  userId: string;
  provider: string;
  label: string;
  region: string;
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
  }): Promise<ProviderResponse> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const region = params.region || "";

    await db.exec`
      INSERT INTO server_providers (id, user_id, provider, label, api_key, api_secret, region, created_at)
      VALUES (${id}, ${authData.userID}, ${params.provider}, ${params.label}, ${params.apiKey}, ${params.apiSecret}, ${region}, NOW())`;

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
      id: string; user_id: string; provider: string; label: string; region: string; created_at: Date;
    }>`SELECT id, user_id, provider, label, region, created_at
       FROM server_providers WHERE user_id = ${authData.userID}`;

    const providers: ProviderResponse[] = [];
    for await (const row of rows) {
      providers.push({
        id: row.id, userId: row.user_id, provider: row.provider,
        label: row.label, region: row.region, createdAt: row.created_at.toISOString(),
      });
    }
    return { providers };
  }
);

export const deleteProvider = api(
  { method: "DELETE", path: "/deploy/providers/:providerId", auth: true },
  async (params: { providerId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM server_providers WHERE id = ${params.providerId}`;
    return { success: true };
  }
);

export const updateProvider = api(
  { method: "PUT", path: "/deploy/providers/:providerId", auth: true },
  async (params: { providerId: string; label: string }): Promise<ProviderResponse> => {
    const row = await db.queryRow<{
      id: string; user_id: string; provider: string; label: string; region: string; created_at: Date;
    }>`SELECT id, user_id, provider, label, region, created_at FROM server_providers WHERE id = ${params.providerId}`;
    if (!row) throw APIError.notFound("Provider not found");

    await db.exec`UPDATE server_providers SET label = ${params.label} WHERE id = ${params.providerId}`;

    return {
      id: row.id, userId: row.user_id, provider: row.provider,
      label: params.label, region: row.region, createdAt: row.created_at.toISOString(),
    };
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
  }): Promise<Deployment> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const script = params.tofuScript || "";

    await db.exec`
      INSERT INTO deployments (id, user_id, provider_id, git_connection_id, repo, branch, status, logs, tofu_script, created_at, updated_at)
      VALUES (${id}, ${authData.userID}, ${params.providerId}, ${params.gitConnectionId},
              ${params.repo}, ${params.branch}, 'pending', '', ${script}, NOW(), NOW())`;

    // Publish deploy event
    await deployTopic.publish({
      deploymentId: id,
      userId: authData.userID,
      providerId: params.providerId,
      gitConnectionId: params.gitConnectionId,
      repo: params.repo,
      branch: params.branch,
      tofuScript: script,
    });

    return {
      id, userId: authData.userID, providerId: params.providerId,
      gitConnectionId: params.gitConnectionId, repo: params.repo,
      branch: params.branch, status: "pending", logs: "", appUrl: "",
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
          repo: string; branch: string; status: string; logs: string; app_url: string; created_at: Date; updated_at: Date;
        }>`SELECT * FROM deployments WHERE user_id = ${authData.userID} AND provider_id = ${params.providerId} ORDER BY created_at DESC LIMIT 50`
      : db.query<{
          id: string; user_id: string; provider_id: string; git_connection_id: string;
          repo: string; branch: string; status: string; logs: string; app_url: string; created_at: Date; updated_at: Date;
        }>`SELECT * FROM deployments WHERE user_id = ${authData.userID} ORDER BY created_at DESC LIMIT 50`;

    const deployments: Deployment[] = [];
    for await (const row of rows) {
      deployments.push({
        id: row.id, userId: row.user_id, providerId: row.provider_id,
        gitConnectionId: row.git_connection_id, repo: row.repo, branch: row.branch,
        status: row.status as Deployment["status"], logs: row.logs, appUrl: row.app_url,
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
      repo: string; branch: string; status: string; logs: string; app_url: string; created_at: Date; updated_at: Date;
    }>`SELECT * FROM deployments WHERE id = ${params.deploymentId}`;

    if (!row) throw APIError.notFound("Deployment not found");

    return {
      id: row.id, userId: row.user_id, providerId: row.provider_id,
      gitConnectionId: row.git_connection_id, repo: row.repo, branch: row.branch,
      status: row.status as Deployment["status"], logs: row.logs, appUrl: row.app_url,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
  }
);

// ─── Deploy Processor (Pub/Sub) — Real OpenTofu execution ───

const _ = new Subscription(deployTopic, "deploy-processor", {
  handler: async (event: DeployEvent) => {
    const { deploymentId } = event;
    const repoName = event.repo.split("/").pop() || "app";
    const shortId = deploymentId.slice(0, 8);

    // Look up provider for API key + region
    const providerRow = await db.queryRow<{ provider: string; region: string; api_key: string; api_secret: string }>`
      SELECT provider, region, api_key, api_secret FROM server_providers WHERE id = ${event.providerId}`;
    const provider = providerRow?.provider || "cloud";
    const region = providerRow?.region || "us-east-1";

    try {
      await db.exec`UPDATE deployments SET status = 'building', updated_at = NOW() WHERE id = ${deploymentId}`;
      await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);
      await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${provider} | Region: ${region}`);
      await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${event.repo} | Branch: ${event.branch}`);

      if (!event.tofuScript) {
        throw new Error("No OpenTofu script provided. Generate a script first, then deploy.");
      }

      // ── Write .tf file to temp directory ──
      const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");
      const { spawn } = await import("node:child_process");

      const workDir = await mkdtemp(join(tmpdir(), `deploy-${shortId}-`));
      const tfFile = join(workDir, "main.tf");
      await writeFile(tfFile, event.tofuScript, "utf-8");
      await appendLog(deploymentId, `[${ts()}] ✓ OpenTofu script written to workspace`);

      // ── Build tfvars from provider credentials ──
      const tfVars: string[] = [];
      if (provider === "hetzner" && providerRow?.api_key) {
        tfVars.push(`hcloud_token=${providerRow.api_key}`);
        // Use api_secret as SSH public key if provided, otherwise placeholder
        if (providerRow.api_secret) tfVars.push(`ssh_public_key=${providerRow.api_secret}`);
      } else if (provider === "digitalocean" && providerRow?.api_key) {
        tfVars.push(`do_token=${providerRow.api_key}`);
      } else if (provider === "vultr" && providerRow?.api_key) {
        tfVars.push(`vultr_api_key=${providerRow.api_key}`);
        if (providerRow.api_secret) tfVars.push(`ssh_public_key=${providerRow.api_secret}`);
      } else if (provider === "linode" && providerRow?.api_key) {
        tfVars.push(`linode_token=${providerRow.api_key}`);
        if (providerRow.api_secret) tfVars.push(`ssh_public_key=${providerRow.api_secret}`);
        tfVars.push(`root_password=Ch4ng3M3-${shortId}!`);
      } else if (provider === "aws") {
        // AWS uses env vars instead of tfvars
      }

      // ── Helper to run a command and stream output ──
      const runCmd = (cmd: string, args: string[], env?: Record<string, string>): Promise<{ code: number; output: string }> => {
        return new Promise((resolve) => {
          const proc = spawn(cmd, args, {
            cwd: workDir,
            env: { ...process.env, ...env },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let output = "";
          const onData = async (data: Buffer) => {
            const lines = data.toString().split("\n").filter(Boolean);
            for (const line of lines) {
              output += line + "\n";
              await appendLog(deploymentId, `[${ts()}] ${line}`);
            }
          };
          proc.stdout.on("data", onData);
          proc.stderr.on("data", onData);
          proc.on("close", (code) => resolve({ code: code ?? 1, output }));
          proc.on("error", (err) => resolve({ code: 1, output: err.message }));
        });
      };

      // ── Step 1: tofu init ──
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── OpenTofu Init ──────────────────`);
      const initResult = await runCmd("tofu", ["init", "-no-color"], provider === "aws" ? {
        AWS_ACCESS_KEY_ID: providerRow?.api_key || "",
        AWS_SECRET_ACCESS_KEY: providerRow?.api_secret || "",
        AWS_DEFAULT_REGION: region,
      } : undefined);

      if (initResult.code !== 0) {
        throw new Error(`tofu init failed (exit code ${initResult.code})`);
      }
      await appendLog(deploymentId, `[${ts()}] ✓ OpenTofu initialized`);

      // ── Step 2: tofu apply ──
      await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── OpenTofu Apply ─────────────────`);

      const applyArgs = ["apply", "-auto-approve", "-no-color"];
      for (const v of tfVars) {
        applyArgs.push("-var", v);
      }

      const applyEnv: Record<string, string> = {};
      if (provider === "aws") {
        applyEnv.AWS_ACCESS_KEY_ID = providerRow?.api_key || "";
        applyEnv.AWS_SECRET_ACCESS_KEY = providerRow?.api_secret || "";
        applyEnv.AWS_DEFAULT_REGION = region;
      }

      const applyResult = await runCmd("tofu", applyArgs, Object.keys(applyEnv).length > 0 ? applyEnv : undefined);

      if (applyResult.code !== 0) {
        throw new Error(`tofu apply failed (exit code ${applyResult.code})`);
      }

      // ── Step 3: Extract outputs ──
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Extracting outputs ──────────────`);
      const outputResult = await runCmd("tofu", ["output", "-json", "-no-color"], Object.keys(applyEnv).length > 0 ? applyEnv : undefined);

      let appUrl = "";
      try {
        const outputs = JSON.parse(outputResult.output);
        // Try common output names
        appUrl = outputs.app_url?.value || outputs.server_ip?.value || outputs.deployed_to?.value || "";
        if (appUrl && !appUrl.startsWith("http")) {
          appUrl = `http://${appUrl}`;
        }
        for (const [key, val] of Object.entries(outputs)) {
          await appendLog(deploymentId, `[${ts()}]   ${key} = ${(val as any).value}`);
        }
      } catch {
        // output parsing failed, not critical
        await appendLog(deploymentId, `[${ts()}]   (could not parse outputs)`);
      }

      // ── Save tofu state for future destroy ──
      try {
        const { readFile: readFs } = await import("node:fs/promises");
        const stateFile = join(workDir, "terraform.tfstate");
        const state = await readFs(stateFile, "utf-8");
        // Store state in tofu_script column (reuse it) for destroy later
        await db.exec`UPDATE deployments SET tofu_script = ${event.tofuScript + "\n\n/* STATE */\n" + state} WHERE id = ${deploymentId}`;
      } catch {
        // state save failed, not critical
      }

      // ── Cleanup temp dir ──
      try { await rm(workDir, { recursive: true, force: true }); } catch { /* ignore */ }

      const finalUrl = appUrl || generateAppUrl(provider, repoName, shortId, region);
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
      await appendLog(deploymentId, `[${ts()}] ✓ Deployment successful!`);
      await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${finalUrl}`);

      await db.exec`UPDATE deployments SET status = 'success', app_url = ${finalUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
    } catch (e: any) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${e.message || e}`);
      await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
    }
  },
});

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function generateAppUrl(provider: string, repoName: string, shortId: string, region: string): string {
  const slug = `${repoName}-${shortId}`;
  switch (provider) {
    case "digitalocean": return `https://${slug}.ondigitalocean.app`;
    case "hetzner": return `https://${slug}.${region}.hetzner.app`;
    case "vultr": return `https://${slug}.vultr.app`;
    case "linode": return `https://${slug}.linodeobjects.com`;
    case "aws": return `https://${slug}.${region}.awsapprunner.com`;
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

// ─── OpenTofu Script Generator ───

interface TofuRequest {
  providerId: string;
  repo: string;
  branch: string;
  techStack: string[];
  primaryLanguage: string;
  hasDocker: boolean;
  appName?: string;
  region?: string;
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

    const script = buildTofuScript({
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

interface TofuBuildParams {
  provider: string;
  region: string;
  appName: string;
  repo: string;
  branch: string;
  runtime: { name: string; version: string; buildCmd: string; startCmd: string; port: number };
  hasDocker: boolean;
  techStack: string[];
  services: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
  aiAnalysis?: TofuRequest["aiAnalysis"];
}

function buildTofuScript(p: TofuBuildParams): string {
  switch (p.provider) {
    case "digitalocean": return buildDigitalOcean(p);
    case "hetzner": return buildHetzner(p);
    case "aws": return buildAws(p);
    case "vultr": return buildVultr(p);
    case "linode": return buildLinode(p);
    default: return buildGenericVPS(p);
  }
}

function buildDigitalOcean(p: TofuBuildParams): string {
  const hasDb = p.techStack.some(s => ["laravel", "django", "rails", "spring", "prisma", "typeorm"].includes(s.toLowerCase()));
  return `# ─────────────────────────────────────────────────
# OpenTofu — DigitalOcean App Platform
# App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
# Generated for: ${p.repo}@${p.branch}
# ─────────────────────────────────────────────────

terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.36"
    }
  }
}

variable "do_token" {
  type      = string
  sensitive = true
}

variable "app_domain" {
  type    = string
  default = ""
}

provider "digitalocean" {
  token = var.do_token
}

resource "digitalocean_app" "${p.appName}" {
  spec {
    name   = "${p.appName}"
    region = "${p.region}"

    service {
      name               = "${p.appName}-web"
      instance_count     = 1
      instance_size_slug = "apps-s-1vcpu-0.5gb"

      git {
        repo_clone_url = "https://github.com/${p.repo}.git"
        branch         = "${p.branch}"
      }

      build_command = "${p.runtime.buildCmd}"
      run_command   = "${p.runtime.startCmd}"

      http_port = ${p.runtime.port}

      env {
        key   = "APP_ENV"
        value = "production"
      }

      env {
        key   = "PORT"
        value = "${p.runtime.port}"
      }
    }
${hasDb ? `
    database {
      name       = "${p.appName}-db"
      engine     = "PG"
      version    = "16"
      size       = "db-s-dev-database"
      production = false
    }
` : ""}  }
}

output "app_url" {
  value = digitalocean_app.${p.appName}.live_url
}

output "app_id" {
  value = digitalocean_app.${p.appName}.id
}
`;
}

function buildHetzner(p: TofuBuildParams): string {
  const ai = p.aiAnalysis;
  const vpsSvcs = p.services.filter(s => s.mode === "vps");
  const managedSvcs = p.services.filter(s => s.mode === "managed");
  const hasVpsDb = vpsSvcs.some(s => s.type === "database");
  const hasVpsCache = vpsSvcs.some(s => s.type === "cache");
  const hasVpsQueue = vpsSvcs.some(s => s.type === "queue") || (ai?.needsQueueWorker ?? false);
  const hasVpsSearch = vpsSvcs.some(s => s.type === "search");
  const needsScheduler = ai?.needsScheduler ?? p.techStack.some(s => s.toLowerCase() === "laravel");
  const needsWebsockets = ai?.needsWebsockets ?? false;
  const isPhp = p.runtime.name === "php";
  const isLaravel = p.techStack.some(s => s.toLowerCase() === "laravel");
  const usePhpFpm = isPhp && (ai?.nginxConfig === "php-fpm" || isLaravel);
  const phpVer = p.runtime.version; // e.g. "8.3"

  // Build install packages
  const packages = ["git", "nginx", "certbot", "python3-certbot-nginx", "unzip", "curl", "acl"];
  if (isPhp) {
    const phpExts = ai?.phpExtensions?.length
      ? ai.phpExtensions.map(e => e.startsWith("php") ? e : `php${phpVer}-${e}`)
      : [`php${phpVer}-fpm`, `php${phpVer}-cli`, `php${phpVer}-mbstring`, `php${phpVer}-xml`, `php${phpVer}-curl`, `php${phpVer}-zip`, `php${phpVer}-bcmath`, `php${phpVer}-intl`, `php${phpVer}-gd`, `php${phpVer}-tokenizer`];
    // Ensure fpm and cli are always present
    if (!phpExts.some(e => e.includes("fpm"))) phpExts.unshift(`php${phpVer}-fpm`);
    if (!phpExts.some(e => e.includes("cli"))) phpExts.unshift(`php${phpVer}-cli`);
    packages.push(...phpExts);
    if (hasVpsDb) packages.push(`php${phpVer}-pgsql`, `php${phpVer}-mysql`);
    if (hasVpsCache || hasVpsQueue) packages.push(`php${phpVer}-redis`);
    // Composer installed separately via installer
  } else if (p.runtime.name === "node") {
    packages.push("nodejs", "npm");
  } else if (p.runtime.name === "python") {
    packages.push(`python${p.runtime.version}`, "python3-pip", "python3-venv");
  } else if (p.runtime.name === "go") {
    packages.push("golang");
  } else if (p.runtime.name === "ruby") {
    packages.push("ruby", "ruby-dev", "build-essential");
  }
  if (hasVpsDb) packages.push("postgresql", "postgresql-contrib");
  if (hasVpsCache || hasVpsQueue) packages.push("redis-server");
  if (hasVpsSearch) packages.push("meilisearch");
  if (needsWebsockets) packages.push("supervisor");
  if (hasVpsQueue && isPhp) packages.push("supervisor");

  // Node setup for asset building (even in PHP projects)
  const needsNode = isPhp && (p.techStack.some(s => ["vite", "node.js", "inertia.js", "livewire", "tailwind css"].includes(s.toLowerCase())) || ai?.nodeVersion);
  const nodeVer = ai?.nodeVersion || "20";
  const nodeSetup = p.runtime.name === "node"
    ? `\n    curl -fsSL https://deb.nodesource.com/setup_${p.runtime.version}.x | bash -`
    : needsNode
      ? `\n    curl -fsSL https://deb.nodesource.com/setup_${nodeVer}.x | bash -\n    apt-get install -y nodejs`
      : "";

  const composerSetup = isPhp ? `
    # ── Install Composer ──
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer` : "";

  // VPS service setup scripts
  const dbSetup = hasVpsDb ? `
    # ── Database Setup ──
    systemctl enable postgresql
    systemctl start postgresql
    sudo -u postgres createuser ${p.appName}
    sudo -u postgres createdb ${p.appName} -O ${p.appName}
    sudo -u postgres psql -c "ALTER USER ${p.appName} PASSWORD 'CHANGE_ME_SECURE_PASSWORD';"` : "";

  const cacheSetup = (hasVpsCache || hasVpsQueue) ? `
    # ── Redis Setup (Cache${hasVpsQueue ? " + Queue" : ""}) ──
    sed -i 's/^# maxmemory .*/maxmemory 256mb/' /etc/redis/redis.conf
    sed -i 's/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    systemctl enable redis-server
    systemctl restart redis-server` : "";

  // Managed service blocks
  const managedBlocks: string[] = [];
  if (managedSvcs.some(s => s.type === "database")) {
    managedBlocks.push(`
# ── Managed Database (external) ──
# Use PlanetScale, Neon, Supabase, or AWS RDS
# Set DATABASE_URL in the app .env file
`);
  }
  if (managedSvcs.some(s => s.type === "cache")) {
    managedBlocks.push(`
# ── Managed Redis (external) ──
# Use Upstash, Redis Cloud, or AWS ElastiCache
# Set REDIS_URL in the app .env file
`);
  }
  if (managedSvcs.some(s => s.type === "storage")) {
    managedBlocks.push(`
# ── Object Storage ──
# Use Hetzner Object Storage, AWS S3, or Cloudflare R2
# Set S3_ENDPOINT, S3_BUCKET, S3_KEY, S3_SECRET in .env
`);
  }
  if (managedSvcs.some(s => s.type === "mail")) {
    managedBlocks.push(`
# ── Email Service (external) ──
# Use Mailgun, Postmark, SendGrid, or AWS SES
# Set MAIL_* environment variables in .env
`);
  }

  const envVars: string[] = ai?.envVars?.length ? [...ai.envVars] : ["APP_ENV=production", `PORT=${p.runtime.port}`];
  if (hasVpsDb && !envVars.some(e => e.startsWith("DATABASE_URL"))) {
    envVars.push(`DATABASE_URL=postgresql://${p.appName}:CHANGE_ME_SECURE_PASSWORD@127.0.0.1:5432/${p.appName}`);
  }
  if ((hasVpsCache || hasVpsQueue) && !envVars.some(e => e.startsWith("REDIS_URL") || e.startsWith("REDIS_HOST"))) {
    envVars.push("REDIS_URL=redis://127.0.0.1:6379");
  }

  // Post-deploy commands from AI
  const postDeploy = ai?.postDeployCommands?.length
    ? ai.postDeployCommands.map(c => `    ${c}`).join("\n")
    : isLaravel
      ? `    php artisan migrate --force
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
    php artisan storage:link
    php artisan optimize`
      : "";

  // ── Nginx config: PHP-FPM vs reverse proxy ──
  const nginxConfig = usePhpFpm
    ? `    server {
        listen 80;
        server_name _;
        root /opt/${p.appName}/public;
        index index.php index.html;

        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";

        charset utf-8;
        client_max_body_size 64M;

        location / {
            try_files \\$uri \\$uri/ /index.php?\\$query_string;
        }

        location = /favicon.ico { access_log off; log_not_found off; }
        location = /robots.txt  { access_log off; log_not_found off; }

        error_page 404 /index.php;

        location ~ \\.php$ {
            fastcgi_pass unix:/run/php/php${phpVer}-fpm.sock;
            fastcgi_param SCRIPT_FILENAME \\$realpath_root\\$fastcgi_script_name;
            include fastcgi_params;
            fastcgi_hide_header X-Powered-By;
        }

        location ~ /\\.(?!well-known).* {
            deny all;
        }
    }`
    : `    server {
        listen 80;
        server_name _;

        location / {
            proxy_pass http://127.0.0.1:${p.runtime.port};
            proxy_set_header Host \\$host;
            proxy_set_header X-Real-IP \\$remote_addr;
            proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \\$scheme;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \\$http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }`;

  // ── Queue worker (supervisor for PHP, systemd for others) ──
  const queueWorkerSetup = hasVpsQueue
    ? isPhp
      ? `
    # ── Queue Worker (Supervisor) ──
    cat > /etc/supervisor/conf.d/${p.appName}-worker.conf <<'SUP'
    [program:${p.appName}-worker]
    process_name=%(program_name)s_%(process_num)02d
    command=php /opt/${p.appName}/artisan queue:work redis --sleep=3 --tries=3 --max-time=3600
    autostart=true
    autorestart=true
    stopasgroup=true
    killasgroup=true
    user=www-data
    numprocs=2
    redirect_stderr=true
    stdout_logfile=/var/log/${p.appName}-worker.log
    stopwaitsecs=3600
    SUP

    supervisorctl reread
    supervisorctl update`
      : `
    # ── Queue Worker Service ──
    cat > /etc/systemd/system/${p.appName}-worker.service <<'WORKER'
    [Unit]
    Description=${p.appName} Queue Worker
    After=network.target

    [Service]
    Type=simple
    User=root
    WorkingDirectory=/opt/${p.appName}
    ExecStart=${p.runtime.name === "python" ? "celery -A app worker --loglevel=info" : "npm run worker"}
    Restart=always
${envVars.map(e => `    Environment=${e}`).join("\n")}

    [Install]
    WantedBy=multi-user.target
    WORKER

    systemctl daemon-reload
    systemctl enable --now ${p.appName}-worker`
    : "";

  // ── Scheduler cron ──
  const schedulerSetup = needsScheduler && isPhp ? `
    # ── Laravel Scheduler (Cron) ──
    echo "* * * * * www-data cd /opt/${p.appName} && php artisan schedule:run >> /dev/null 2>&1" > /etc/cron.d/${p.appName}-scheduler
    chmod 0644 /etc/cron.d/${p.appName}-scheduler` : "";

  // ── Websocket setup ──
  const websocketSetup = needsWebsockets && isPhp ? `
    # ── Websocket Server (Supervisor) ──
    cat > /etc/supervisor/conf.d/${p.appName}-websocket.conf <<'WS'
    [program:${p.appName}-websocket]
    command=php /opt/${p.appName}/artisan reverb:start --host=0.0.0.0 --port=8080
    autostart=true
    autorestart=true
    user=www-data
    redirect_stderr=true
    stdout_logfile=/var/log/${p.appName}-websocket.log
    WS

    supervisorctl reread
    supervisorctl update` : "";

  // ── PHP ownership fix ──
  const ownershipFix = isPhp ? `
    # ── Set permissions ──
    chown -R www-data:www-data /opt/${p.appName}
    chmod -R 775 /opt/${p.appName}/storage /opt/${p.appName}/bootstrap/cache` : "";

  // ── .env generation for Laravel ──
  const envFileSetup = isLaravel ? `
    # ── Generate .env ──
    cp /opt/${p.appName}/.env.example /opt/${p.appName}/.env
    sed -i 's|APP_ENV=.*|APP_ENV=production|' /opt/${p.appName}/.env
    sed -i 's|APP_DEBUG=.*|APP_DEBUG=false|' /opt/${p.appName}/.env
    sed -i 's|APP_URL=.*|APP_URL=http://\\$(hostname -I | awk "{print \\$1}")|' /opt/${p.appName}/.env
${hasVpsDb ? `    sed -i 's|DB_CONNECTION=.*|DB_CONNECTION=pgsql|' /opt/${p.appName}/.env
    sed -i 's|DB_HOST=.*|DB_HOST=127.0.0.1|' /opt/${p.appName}/.env
    sed -i 's|DB_DATABASE=.*|DB_DATABASE=${p.appName}|' /opt/${p.appName}/.env
    sed -i 's|DB_USERNAME=.*|DB_USERNAME=${p.appName}|' /opt/${p.appName}/.env
    sed -i 's|DB_PASSWORD=.*|DB_PASSWORD=CHANGE_ME_SECURE_PASSWORD|' /opt/${p.appName}/.env` : ""}
${hasVpsCache || hasVpsQueue ? `    sed -i 's|CACHE_STORE=.*|CACHE_STORE=redis|' /opt/${p.appName}/.env
    sed -i 's|QUEUE_CONNECTION=.*|QUEUE_CONNECTION=redis|' /opt/${p.appName}/.env
    sed -i 's|SESSION_DRIVER=.*|SESSION_DRIVER=redis|' /opt/${p.appName}/.env` : ""}
    php artisan key:generate --force` : "";

  const aiSummary = ai?.summary ? `\n# AI Analysis: ${ai.summary}` : "";

  return `# ─────────────────────────────────────────────────
# OpenTofu — Hetzner Cloud VPS
# App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
# Generated for: ${p.repo}@${p.branch}
# Services on VPS: ${vpsSvcs.map(s => s.name).join(", ") || "none"}
# Managed services: ${managedSvcs.map(s => s.name).join(", ") || "none"}${aiSummary}
# ─────────────────────────────────────────────────

terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.47"
    }
  }
}

variable "hcloud_token" {
  type      = string
  sensitive = true
}

variable "ssh_public_key" {
  type = string
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_ssh_key" "${p.appName}_key" {
  name       = "${p.appName}-deploy-key"
  public_key = var.ssh_public_key
}

resource "hcloud_firewall" "${p.appName}_fw" {
  name = "${p.appName}-firewall"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "${p.appName}" {
  name        = "${p.appName}"
  server_type = "${vpsSvcs.length > 2 ? "cx32" : "cx22"}"
  image       = "ubuntu-24.04"
  location    = "${p.region}"
  ssh_keys    = [hcloud_ssh_key.${p.appName}_key.id]
  firewall_ids = [hcloud_firewall.${p.appName}_fw.id]

  user_data = <<-EOF
    #!/bin/bash
    set -e

    export DEBIAN_FRONTEND=noninteractive
${isPhp ? `    add-apt-repository -y ppa:ondrej/php` : ""}
${nodeSetup}

    # ── Install packages ──
    apt-get update && apt-get install -y ${packages.join(" ")}
${composerSetup}
${dbSetup}${cacheSetup}

    # ── Clone repository ──
    git clone --depth 1 --branch ${p.branch} https://github.com/${p.repo}.git /opt/${p.appName}
    cd /opt/${p.appName}
${envFileSetup}

    # ── Build ──
    ${p.runtime.buildCmd}
${needsNode && isPhp ? `\n    # ── Build frontend assets ──\n    npm ci && npm run build` : ""}
${ownershipFix}

    # ── Post-deploy commands ──
${postDeploy}

    # ── Configure Nginx ──
    cat > /etc/nginx/sites-available/${p.appName} <<'NGINX'
${nginxConfig}
    NGINX

    ln -sf /etc/nginx/sites-available/${p.appName} /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
${isPhp ? `    systemctl enable php${phpVer}-fpm\n    systemctl restart php${phpVer}-fpm` : ""}
    systemctl restart nginx
${!usePhpFpm ? `
    # ── Create systemd service ──
    cat > /etc/systemd/system/${p.appName}.service <<'SVC'
    [Unit]
    Description=${p.appName}
    After=network.target

    [Service]
    Type=simple
    User=root
    WorkingDirectory=/opt/${p.appName}
    ExecStart=${p.runtime.startCmd}
    Restart=always
${envVars.map(e => `    Environment=${e}`).join("\n")}

    [Install]
    WantedBy=multi-user.target
    SVC

    systemctl daemon-reload
    systemctl enable --now ${p.appName}` : ""}
${queueWorkerSetup}${schedulerSetup}${websocketSetup}
  EOF
}
${managedBlocks.join("")}
output "server_ip" {
  value = hcloud_server.${p.appName}.ipv4_address
}

output "ssh_command" {
  value = "ssh root@\${hcloud_server.${p.appName}.ipv4_address}"
}
`;
}

function buildAws(p: TofuBuildParams): string {
  return `# ─────────────────────────────────────────────────
# OpenTofu — AWS App Runner
# App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
# Generated for: ${p.repo}@${p.branch}
# ─────────────────────────────────────────────────

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "${p.region}"
}

provider "aws" {
  region = var.aws_region
}

resource "aws_apprunner_service" "${p.appName}" {
  service_name = "${p.appName}"

  source_configuration {
    auto_deployments_enabled = true

    code_repository {
      repository_url = "https://github.com/${p.repo}"

      source_code_version {
        type  = "BRANCH"
        value = "${p.branch}"
      }

      code_configuration {
        configuration_source = "API"

        code_configuration_values {
          runtime      = "${p.runtime.name === "node" ? "NODEJS_20" : p.runtime.name === "python" ? "PYTHON_312" : p.runtime.name === "php" ? "PHP_81" : "NODEJS_20"}"
          build_command = "${p.runtime.buildCmd}"
          start_command = "${p.runtime.startCmd}"
          port          = "${p.runtime.port}"

          runtime_environment_variables = {
            APP_ENV = "production"
          }
        }
      }
    }
  }

  instance_configuration {
    cpu    = "0.25 vCPU"
    memory = "0.5 GB"
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  tags = {
    Name        = "${p.appName}"
    Environment = "production"
    ManagedBy   = "opentofu"
  }
}

output "app_url" {
  value = "https://\${aws_apprunner_service.${p.appName}.service_url}"
}

output "service_arn" {
  value = aws_apprunner_service.${p.appName}.arn
}
`;
}

function buildVultr(p: TofuBuildParams): string {
  const ai = p.aiAnalysis;
  const isPhp = p.runtime.name === "php";
  const isLaravel = p.techStack.some(s => s.toLowerCase() === "laravel");
  const usePhpFpm = isPhp && (ai?.nginxConfig === "php-fpm" || isLaravel);
  const phpVer = p.runtime.version;
  const vpsSvcs = p.services.filter(s => s.mode === "vps");
  const hasVpsDb = vpsSvcs.some(s => s.type === "database");
  const hasVpsCache = vpsSvcs.some(s => s.type === "cache");
  const hasVpsQueue = vpsSvcs.some(s => s.type === "queue") || (ai?.needsQueueWorker ?? false);

  // Build packages
  const packages = ["git", "nginx", "certbot", "python3-certbot-nginx", "unzip", "curl"];
  if (isPhp) {
    packages.push(`php${phpVer}-fpm`, `php${phpVer}-cli`, `php${phpVer}-mbstring`, `php${phpVer}-xml`, `php${phpVer}-curl`, `php${phpVer}-zip`, `php${phpVer}-bcmath`, `php${phpVer}-intl`, `php${phpVer}-gd`);
    if (hasVpsDb) packages.push(`php${phpVer}-pgsql`, `php${phpVer}-mysql`);
    if (hasVpsCache || hasVpsQueue) packages.push(`php${phpVer}-redis`);
    if (hasVpsQueue) packages.push("supervisor");
  } else if (p.runtime.name === "node") {
    packages.push("nodejs", "npm");
  } else if (p.runtime.name === "python") {
    packages.push("python3", "python3-pip", "python3-venv");
  }
  if (hasVpsDb) packages.push("postgresql", "postgresql-contrib");
  if (hasVpsCache || hasVpsQueue) packages.push("redis-server");

  const needsNode = isPhp && p.techStack.some(s => ["vite", "node.js", "inertia.js", "tailwind css"].includes(s.toLowerCase()));
  const nodeVer = ai?.nodeVersion || "20";

  const nginxBlock = usePhpFpm
    ? `server {
        listen 80;
        server_name _;
        root /opt/${p.appName}/public;
        index index.php index.html;
        client_max_body_size 64M;
        location / { try_files \\\\$uri \\\\$uri/ /index.php?\\\\$query_string; }
        location ~ \\\\.php$ {
            fastcgi_pass unix:/run/php/php${phpVer}-fpm.sock;
            fastcgi_param SCRIPT_FILENAME \\\\$realpath_root\\\\$fastcgi_script_name;
            include fastcgi_params;
        }
        location ~ /\\\\.(?!well-known).* { deny all; }
    }`
    : `server {
        listen 80;
        server_name _;
        location / {
            proxy_pass http://127.0.0.1:${p.runtime.port};
            proxy_set_header Host \\\\$host;
            proxy_set_header X-Real-IP \\\\$remote_addr;
            proxy_set_header X-Forwarded-For \\\\$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \\\\$scheme;
        }
    }`;

  return `# ─────────────────────────────────────────────────
# OpenTofu — Vultr Cloud Compute
# App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
# Generated for: ${p.repo}@${p.branch}${ai?.summary ? `\n# AI Analysis: ${ai.summary}` : ""}
# ─────────────────────────────────────────────────

terraform {
  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.19"
    }
  }
}

variable "vultr_api_key" {
  type      = string
  sensitive = true
}

variable "ssh_public_key" {
  type = string
}

provider "vultr" {
  api_key = var.vultr_api_key
}

resource "vultr_ssh_key" "${p.appName}_key" {
  name    = "${p.appName}-deploy-key"
  ssh_key = var.ssh_public_key
}

resource "vultr_firewall_group" "${p.appName}_fw" {
  description = "${p.appName} firewall"
}

resource "vultr_firewall_rule" "${p.appName}_ssh" {
  firewall_group_id = vultr_firewall_group.${p.appName}_fw.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "22"
}

resource "vultr_firewall_rule" "${p.appName}_http" {
  firewall_group_id = vultr_firewall_group.${p.appName}_fw.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "80"
}

resource "vultr_firewall_rule" "${p.appName}_https" {
  firewall_group_id = vultr_firewall_group.${p.appName}_fw.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "443"
}

resource "vultr_instance" "${p.appName}" {
  plan              = "${vpsSvcs.length > 2 ? "vc2-2c-4gb" : "vc2-1c-2gb"}"
  region            = "${p.region}"
  os_id             = 2284  # Ubuntu 24.04
  label             = "${p.appName}"
  hostname          = "${p.appName}"
  ssh_key_ids       = [vultr_ssh_key.${p.appName}_key.id]
  firewall_group_id = vultr_firewall_group.${p.appName}_fw.id
  backups           = "disabled"

  user_data = base64encode(<<-EOF
    #!/bin/bash
    set -e
    export DEBIAN_FRONTEND=noninteractive
${isPhp ? "    add-apt-repository -y ppa:ondrej/php" : ""}
${p.runtime.name === "node" ? `    curl -fsSL https://deb.nodesource.com/setup_${p.runtime.version}.x | bash -` : ""}
${needsNode ? `    curl -fsSL https://deb.nodesource.com/setup_${nodeVer}.x | bash -\n    apt-get install -y nodejs` : ""}

    apt-get update && apt-get install -y ${packages.join(" ")}
${isPhp ? "    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer" : ""}
${hasVpsDb ? `
    systemctl enable postgresql && systemctl start postgresql
    sudo -u postgres createuser ${p.appName}
    sudo -u postgres createdb ${p.appName} -O ${p.appName}
    sudo -u postgres psql -c "ALTER USER ${p.appName} PASSWORD 'CHANGE_ME_SECURE_PASSWORD';"` : ""}
${hasVpsCache || hasVpsQueue ? `
    systemctl enable redis-server && systemctl restart redis-server` : ""}

    git clone --depth 1 --branch ${p.branch} https://github.com/${p.repo}.git /opt/${p.appName}
    cd /opt/${p.appName}
${isLaravel ? `
    cp .env.example .env
    sed -i 's|APP_ENV=.*|APP_ENV=production|' .env
    sed -i 's|APP_DEBUG=.*|APP_DEBUG=false|' .env
${hasVpsDb ? `    sed -i 's|DB_CONNECTION=.*|DB_CONNECTION=pgsql|' .env\n    sed -i 's|DB_DATABASE=.*|DB_DATABASE=${p.appName}|' .env\n    sed -i 's|DB_USERNAME=.*|DB_USERNAME=${p.appName}|' .env\n    sed -i 's|DB_PASSWORD=.*|DB_PASSWORD=CHANGE_ME_SECURE_PASSWORD|' .env` : ""}
${hasVpsCache || hasVpsQueue ? `    sed -i 's|CACHE_STORE=.*|CACHE_STORE=redis|' .env\n    sed -i 's|QUEUE_CONNECTION=.*|QUEUE_CONNECTION=redis|' .env` : ""}` : ""}

    ${p.runtime.buildCmd}
${needsNode && isPhp ? "    npm ci && npm run build" : ""}
${isLaravel ? `    php artisan key:generate --force\n    php artisan migrate --force\n    php artisan config:cache\n    php artisan route:cache\n    php artisan view:cache\n    php artisan storage:link\n    php artisan optimize` : ""}
${isPhp ? `    chown -R www-data:www-data /opt/${p.appName}\n    chmod -R 775 /opt/${p.appName}/storage /opt/${p.appName}/bootstrap/cache` : ""}

    cat > /etc/nginx/sites-available/${p.appName} <<'NGINX'
    ${nginxBlock}
    NGINX
    ln -sf /etc/nginx/sites-available/${p.appName} /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
${isPhp ? `    systemctl enable php${phpVer}-fpm && systemctl restart php${phpVer}-fpm` : ""}
    systemctl restart nginx
${!usePhpFpm ? `
    cat > /etc/systemd/system/${p.appName}.service <<'SVC'
    [Unit]
    Description=${p.appName}
    After=network.target
    [Service]
    Type=simple
    User=root
    WorkingDirectory=/opt/${p.appName}
    ExecStart=${p.runtime.startCmd}
    Restart=always
    Environment=APP_ENV=production
    [Install]
    WantedBy=multi-user.target
    SVC
    systemctl daemon-reload && systemctl enable --now ${p.appName}` : ""}
${hasVpsQueue && isPhp ? `
    cat > /etc/supervisor/conf.d/${p.appName}-worker.conf <<'SUP'
    [program:${p.appName}-worker]
    process_name=%(program_name)s_%(process_num)02d
    command=php /opt/${p.appName}/artisan queue:work redis --sleep=3 --tries=3 --max-time=3600
    autostart=true
    autorestart=true
    user=www-data
    numprocs=2
    redirect_stderr=true
    stdout_logfile=/var/log/${p.appName}-worker.log
    SUP
    supervisorctl reread && supervisorctl update` : ""}
${isLaravel ? `
    echo "* * * * * www-data cd /opt/${p.appName} && php artisan schedule:run >> /dev/null 2>&1" > /etc/cron.d/${p.appName}-scheduler
    chmod 0644 /etc/cron.d/${p.appName}-scheduler` : ""}
  EOF
  )
}

output "server_ip" {
  value = vultr_instance.${p.appName}.main_ip
}

output "ssh_command" {
  value = "ssh root@\${vultr_instance.${p.appName}.main_ip}"
}
`;
}

function buildLinode(p: TofuBuildParams): string {
  const ai = p.aiAnalysis;
  const isPhp = p.runtime.name === "php";
  const isLaravel = p.techStack.some(s => s.toLowerCase() === "laravel");
  const usePhpFpm = isPhp && (ai?.nginxConfig === "php-fpm" || isLaravel);
  const phpVer = p.runtime.version;
  const vpsSvcs = p.services.filter(s => s.mode === "vps");
  const hasVpsDb = vpsSvcs.some(s => s.type === "database");
  const hasVpsCache = vpsSvcs.some(s => s.type === "cache");
  const hasVpsQueue = vpsSvcs.some(s => s.type === "queue") || (ai?.needsQueueWorker ?? false);

  const packages = ["git", "nginx", "certbot", "python3-certbot-nginx", "unzip", "curl"];
  if (isPhp) {
    packages.push(`php${phpVer}-fpm`, `php${phpVer}-cli`, `php${phpVer}-mbstring`, `php${phpVer}-xml`, `php${phpVer}-curl`, `php${phpVer}-zip`, `php${phpVer}-bcmath`, `php${phpVer}-intl`, `php${phpVer}-gd`);
    if (hasVpsDb) packages.push(`php${phpVer}-pgsql`, `php${phpVer}-mysql`);
    if (hasVpsCache || hasVpsQueue) packages.push(`php${phpVer}-redis`);
    if (hasVpsQueue) packages.push("supervisor");
  } else if (p.runtime.name === "node") {
    packages.push("nodejs", "npm");
  } else if (p.runtime.name === "python") {
    packages.push("python3", "python3-pip", "python3-venv");
  }
  if (hasVpsDb) packages.push("postgresql", "postgresql-contrib");
  if (hasVpsCache || hasVpsQueue) packages.push("redis-server");

  const needsNode = isPhp && p.techStack.some(s => ["vite", "node.js", "inertia.js", "tailwind css"].includes(s.toLowerCase()));
  const nodeVer = ai?.nodeVersion || "20";

  const nginxBlock = usePhpFpm
    ? `server {
        listen 80;
        server_name _;
        root /opt/${p.appName}/public;
        index index.php index.html;
        client_max_body_size 64M;
        location / { try_files \\\\$uri \\\\$uri/ /index.php?\\\\$query_string; }
        location ~ \\\\.php$ {
            fastcgi_pass unix:/run/php/php${phpVer}-fpm.sock;
            fastcgi_param SCRIPT_FILENAME \\\\$realpath_root\\\\$fastcgi_script_name;
            include fastcgi_params;
        }
        location ~ /\\\\.(?!well-known).* { deny all; }
    }`
    : `server {
        listen 80;
        server_name _;
        location / {
            proxy_pass http://127.0.0.1:${p.runtime.port};
            proxy_set_header Host \\\\$host;
            proxy_set_header X-Real-IP \\\\$remote_addr;
            proxy_set_header X-Forwarded-For \\\\$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \\\\$scheme;
        }
    }`;

  // Build the provisioning script
  const provisionScript = `#!/bin/bash
    set -e
    export DEBIAN_FRONTEND=noninteractive
${isPhp ? "    add-apt-repository -y ppa:ondrej/php" : ""}
${p.runtime.name === "node" ? `    curl -fsSL https://deb.nodesource.com/setup_${p.runtime.version}.x | bash -` : ""}
${needsNode ? `    curl -fsSL https://deb.nodesource.com/setup_${nodeVer}.x | bash -\n    apt-get install -y nodejs` : ""}

    apt-get update && apt-get install -y ${packages.join(" ")}
${isPhp ? "    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer" : ""}
${hasVpsDb ? `
    systemctl enable postgresql && systemctl start postgresql
    sudo -u postgres createuser ${p.appName}
    sudo -u postgres createdb ${p.appName} -O ${p.appName}
    sudo -u postgres psql -c "ALTER USER ${p.appName} PASSWORD 'CHANGE_ME_SECURE_PASSWORD';"` : ""}
${hasVpsCache || hasVpsQueue ? "    systemctl enable redis-server && systemctl restart redis-server" : ""}

    git clone --depth 1 --branch ${p.branch} https://github.com/${p.repo}.git /opt/${p.appName}
    cd /opt/${p.appName}
${isLaravel ? `
    cp .env.example .env
    sed -i 's|APP_ENV=.*|APP_ENV=production|' .env
    sed -i 's|APP_DEBUG=.*|APP_DEBUG=false|' .env
${hasVpsDb ? `    sed -i 's|DB_CONNECTION=.*|DB_CONNECTION=pgsql|' .env\n    sed -i 's|DB_DATABASE=.*|DB_DATABASE=${p.appName}|' .env\n    sed -i 's|DB_USERNAME=.*|DB_USERNAME=${p.appName}|' .env\n    sed -i 's|DB_PASSWORD=.*|DB_PASSWORD=CHANGE_ME_SECURE_PASSWORD|' .env` : ""}
${hasVpsCache || hasVpsQueue ? `    sed -i 's|CACHE_STORE=.*|CACHE_STORE=redis|' .env\n    sed -i 's|QUEUE_CONNECTION=.*|QUEUE_CONNECTION=redis|' .env` : ""}` : ""}

    ${p.runtime.buildCmd}
${needsNode && isPhp ? "    npm ci && npm run build" : ""}
${isLaravel ? `    php artisan key:generate --force\n    php artisan migrate --force\n    php artisan config:cache\n    php artisan route:cache\n    php artisan view:cache\n    php artisan storage:link\n    php artisan optimize` : ""}
${isPhp ? `    chown -R www-data:www-data /opt/${p.appName}\n    chmod -R 775 /opt/${p.appName}/storage /opt/${p.appName}/bootstrap/cache` : ""}

    cat > /etc/nginx/sites-available/${p.appName} <<'NGINX'
    ${nginxBlock}
    NGINX
    ln -sf /etc/nginx/sites-available/${p.appName} /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
${isPhp ? `    systemctl enable php${phpVer}-fpm && systemctl restart php${phpVer}-fpm` : ""}
    systemctl restart nginx
${!usePhpFpm ? `
    cat > /etc/systemd/system/${p.appName}.service <<'SVC'
    [Unit]
    Description=${p.appName}
    After=network.target
    [Service]
    Type=simple
    User=root
    WorkingDirectory=/opt/${p.appName}
    ExecStart=${p.runtime.startCmd}
    Restart=always
    Environment=APP_ENV=production
    [Install]
    WantedBy=multi-user.target
    SVC
    systemctl daemon-reload && systemctl enable --now ${p.appName}` : ""}
${hasVpsQueue && isPhp ? `
    cat > /etc/supervisor/conf.d/${p.appName}-worker.conf <<'SUP'
    [program:${p.appName}-worker]
    process_name=%(program_name)s_%(process_num)02d
    command=php /opt/${p.appName}/artisan queue:work redis --sleep=3 --tries=3 --max-time=3600
    autostart=true
    autorestart=true
    user=www-data
    numprocs=2
    redirect_stderr=true
    stdout_logfile=/var/log/${p.appName}-worker.log
    SUP
    supervisorctl reread && supervisorctl update` : ""}
${isLaravel ? `
    echo "* * * * * www-data cd /opt/${p.appName} && php artisan schedule:run >> /dev/null 2>&1" > /etc/cron.d/${p.appName}-scheduler
    chmod 0644 /etc/cron.d/${p.appName}-scheduler` : ""}`;

  return `# ─────────────────────────────────────────────────
# OpenTofu — Linode (Akamai Cloud)
# App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
# Generated for: ${p.repo}@${p.branch}${ai?.summary ? `\n# AI Analysis: ${ai.summary}` : ""}
# ─────────────────────────────────────────────────

terraform {
  required_providers {
    linode = {
      source  = "linode/linode"
      version = "~> 2.20"
    }
  }
}

variable "linode_token" {
  type      = string
  sensitive = true
}

variable "root_password" {
  type      = string
  sensitive = true
}

variable "ssh_public_key" {
  type = string
}

provider "linode" {
  token = var.linode_token
}

resource "linode_sshkey" "${p.appName}_key" {
  label   = "${p.appName}-deploy-key"
  ssh_key = var.ssh_public_key
}

resource "linode_firewall" "${p.appName}_fw" {
  label = "${p.appName}-firewall"

  inbound {
    label    = "allow-ssh"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "22"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-http"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "80"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-https"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "443"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound_policy  = "DROP"
  outbound_policy = "ACCEPT"

  linodes = [linode_instance.${p.appName}.id]
}

resource "linode_instance" "${p.appName}" {
  label           = "${p.appName}"
  region          = "${p.region}"
  type            = "${vpsSvcs.length > 2 ? "g6-standard-1" : "g6-nanode-1"}"
  image           = "linode/ubuntu24.04"
  root_pass       = var.root_password
  authorized_keys = [linode_sshkey.${p.appName}_key.ssh_key]

  stackscript_id = null

  tags = ["${p.appName}", "opentofu"]
}

resource "null_resource" "${p.appName}_provision" {
  depends_on = [linode_instance.${p.appName}]

  connection {
    type        = "ssh"
    host        = linode_instance.${p.appName}.ip_address
    user        = "root"
    password    = var.root_password
  }

  provisioner "remote-exec" {
    inline = [<<-SCRIPT
${provisionScript}
    SCRIPT
    ]
  }
}

output "server_ip" {
  value = linode_instance.${p.appName}.ip_address
}

output "ssh_command" {
  value = "ssh root@\${linode_instance.${p.appName}.ip_address}"
}
`;
}

function buildGenericVPS(p: TofuBuildParams): string {
  return `# ─────────────────────────────────────────────────
# OpenTofu — ${p.provider} (Generic VPS)
# App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
# Generated for: ${p.repo}@${p.branch}
# ─────────────────────────────────────────────────
#
# This provider does not have a dedicated Terraform/OpenTofu provider.
# Below is a template using null_resource with local-exec provisioners
# to deploy via SSH to an existing server.
#

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

variable "server_ip" {
  type        = string
  description = "IP address of the ${p.provider} server"
}

variable "ssh_private_key_path" {
  type    = string
  default = "~/.ssh/id_rsa"
}

resource "null_resource" "${p.appName}_deploy" {
  triggers = {
    always_run = timestamp()
  }

  connection {
    type        = "ssh"
    host        = var.server_ip
    user        = "root"
    private_key = file(var.ssh_private_key_path)
  }

  provisioner "remote-exec" {
    inline = [
      "set -e",
      "apt-get update -qq",
      "apt-get install -y -qq git nginx",
      "rm -rf /opt/${p.appName}",
      "git clone --depth 1 --branch ${p.branch} https://github.com/${p.repo}.git /opt/${p.appName}",
      "cd /opt/${p.appName}",
      "${p.runtime.buildCmd}",
      "# Configure systemd service and nginx reverse proxy",
      "systemctl restart nginx",
    ]
  }
}

output "deployed_to" {
  value = var.server_ip
}
`;
}
