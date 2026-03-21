import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Topic, Subscription } from "encore.dev/pubsub";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { git_integration } from "~encore/clients";

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
  }): Promise<Deployment> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const script = params.tofuScript || "";

    await db.exec`
      INSERT INTO deployments (id, user_id, provider_id, git_connection_id, repo, branch, status, logs, tofu_script, deploy_strategy, created_at, updated_at)
      VALUES (${id}, ${authData.userID}, ${params.providerId}, ${params.gitConnectionId},
              ${params.repo}, ${params.branch}, 'pending', '', ${script}, ${params.deployStrategy || "managed"}, NOW(), NOW())`;

    // Publish deploy event
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
    });

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

// ─── Deploy Processor (Pub/Sub) — Docker + Pulumi ───

const _ = new Subscription(deployTopic, "deploy-processor", {
  handler: async (event: DeployEvent) => {
    const { deploymentId } = event;
    const repoName = event.repo.split("/").pop() || "app";
    const shortId = deploymentId.slice(0, 8);
    const imageName = `${repoName}:${shortId}`;

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
            // Skip Pulumi progress noise (dots, "@ updating..." lines)
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

      if (!event.tofuScript) {
        throw new Error("No Pulumi program provided. Generate infrastructure code first, then deploy.");
      }

      // AWS App Runner requires a GitHub connection ARN; fail early if missing
      const isAppRunner = provider === "aws" && event.deployStrategy === "serverless";
      const appRunnerArn = providerRow?.app_runner_connection_arn?.trim() || "";
      if (isAppRunner && !appRunnerArn) {
        throw new Error(
          "AWS App Runner requires a GitHub connection. Go to Settings → Providers, edit your AWS provider, and add the App Runner connection ARN from AWS Console → App Runner → GitHub connections."
        );
      }

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

      // Get the commit hash
      const commitHash = execSync("git rev-parse HEAD", { cwd: repoDir, timeout: 5_000 }).toString().trim();
      await appendLog(deploymentId, `[${ts()}] ✓ Repository cloned (commit: ${commitHash.slice(0, 8)})`);
      await db.exec`UPDATE deployments SET commit_hash = ${commitHash} WHERE id = ${deploymentId}`;

      // ── Step 2: Build Docker image with Cloud Native Buildpacks ──
      // Check if we already have a built image for this repo+branch+commit
      const cachedImage = await db.queryRow<{ docker_image: string }>`
        SELECT docker_image FROM deployments
        WHERE repo = ${event.repo} AND branch = ${event.branch} AND commit_hash = ${commitHash}
          AND docker_image != '' AND id != ${deploymentId}
        ORDER BY created_at DESC LIMIT 1`;

      let imageName: string;
      let skipBuild = false;
      let buildDir = repoDir;
      let detectedPM = "";
      const { existsSync } = await import("node:fs");
      const { readFile: readFs } = await import("node:fs/promises");
      const { readdirSync } = await import("node:fs");

      if (cachedImage?.docker_image) {
        // Verify the image still exists locally
        try {
          execSync(`docker image inspect ${JSON.stringify(cachedImage.docker_image)}`, { timeout: 10_000, stdio: "pipe" });
          imageName = cachedImage.docker_image;
          skipBuild = true;
          await appendLog(deploymentId, `[${ts()}]`);
          await appendLog(deploymentId, `[${ts()}] ── Build Image (Buildpacks) ───────`);
          await appendLog(deploymentId, `[${ts()}] ℹ Reusing cached image for commit ${commitHash.slice(0, 8)}`);
          await appendLog(deploymentId, `[${ts()}] ✓ Docker image: ${imageName}`);
        } catch {
          // Image was pruned, need to rebuild
          imageName = `${repoName}:${shortId}`;
        }
      } else {
        imageName = `${repoName}:${shortId}`;
      }

      // ── Prepare Dockerfile (always, even if skipping local build for AWS) ──
      {
      const rootFiles = readdirSync(repoDir);
      const frameworkConfigs = ["next.config.js", "next.config.ts", "next.config.mjs", "nuxt.config.ts", "vite.config.ts", "angular.json", "remix.config.js", "astro.config.mjs"];
      const hasRootFramework = frameworkConfigs.some(f => rootFiles.includes(f));
      if (!hasRootFramework) {
        const subdirs = ["app", "frontend", "web", "client", "packages/app", "packages/web", "apps/web", "apps/frontend"];
        for (const sub of subdirs) {
          const subPath = join(repoDir, sub);
          if (existsSync(subPath) && existsSync(join(subPath, "package.json"))) {
            const subFiles = readdirSync(subPath);
            if (frameworkConfigs.some(f => subFiles.includes(f))) {
              buildDir = subPath;
              await appendLog(deploymentId, `[${ts()}] ℹ Detected app in subdirectory: ${sub}/`);
              break;
            }
          }
        }
      }

      // Detect package manager
      if (existsSync(join(buildDir, "pnpm-lock.yaml"))) detectedPM = "pnpm";
      else if (existsSync(join(buildDir, "yarn.lock"))) detectedPM = "yarn";
      else if (existsSync(join(buildDir, "bun.lockb"))) detectedPM = "bun";
      if (!detectedPM && buildDir !== repoDir) {
        if (existsSync(join(repoDir, "pnpm-lock.yaml"))) detectedPM = "pnpm";
        else if (existsSync(join(repoDir, "yarn.lock"))) detectedPM = "yarn";
        else if (existsSync(join(repoDir, "bun.lockb"))) detectedPM = "bun";
        if (detectedPM) {
          const lockFiles: Record<string, string> = { pnpm: "pnpm-lock.yaml", yarn: "yarn.lock", bun: "bun.lockb" };
          try { const { copyFile } = await import("node:fs/promises"); await copyFile(join(repoDir, lockFiles[detectedPM]), join(buildDir, lockFiles[detectedPM])); } catch {}
        }
      }
      if (!detectedPM) {
        const stackLowerPM = event.techStack.map(s => s.toLowerCase());
        if (stackLowerPM.includes("pnpm")) detectedPM = "pnpm";
        else if (stackLowerPM.includes("yarn")) detectedPM = "yarn";
      }

      if (detectedPM) {
        try {
          const pkgPath = join(buildDir, "package.json");
          const pkg = JSON.parse(await readFs(pkgPath, "utf-8"));
          if (!pkg.packageManager) {
            const pmVersions: Record<string, string> = { pnpm: "pnpm@10.14.0", yarn: "yarn@4.5.0", bun: "bun@1.1.0" };
            pkg.packageManager = pmVersions[detectedPM] || `${detectedPM}@latest`;
            await writeFile(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
            await appendLog(deploymentId, `[${ts()}] ℹ Detected ${detectedPM} — added packageManager field`);
          } else {
            await appendLog(deploymentId, `[${ts()}] ℹ Package manager: ${pkg.packageManager}`);
          }
        } catch {}
      }

      const stackLower = event.techStack.map(s => s.toLowerCase());
      const isNextJs = stackLower.includes("next.js") || existsSync(join(buildDir, "next.config.js")) || existsSync(join(buildDir, "next.config.ts")) || existsSync(join(buildDir, "next.config.mjs"));
      const runtime = detectRuntime(event.primaryLanguage, event.techStack);

      let hasStandalone = false;
      if (isNextJs) {
        for (const cfgName of ["next.config.ts", "next.config.mjs", "next.config.js"]) {
          const cfgPath = join(buildDir, cfgName);
          if (existsSync(cfgPath)) {
            try { hasStandalone = (await readFs(cfgPath, "utf-8")).includes("standalone"); } catch {}
            break;
          }
        }
      }

      // Compute relative subdirectory path (e.g. "frontend" or "" if root)
      const { relative } = await import("node:path");
      const subDir = buildDir !== repoDir ? relative(repoDir, buildDir) : "";
      const copyPrefix = subDir ? `${subDir}/` : "";

      // Extract actual pnpm version from packageManager field
      let pnpmVersion = "9.15.0";
      try {
        const pkgContent = JSON.parse(await readFs(join(buildDir, "package.json"), "utf-8"));
        if (pkgContent.packageManager && pkgContent.packageManager.startsWith("pnpm@")) {
          // Extract version without hash (e.g. "pnpm@10.14.0+sha512..." → "10.14.0")
          const ver = pkgContent.packageManager.replace("pnpm@", "").split("+")[0];
          if (ver) pnpmVersion = ver;
        }
      } catch {}

      const hasComposer = existsSync(join(buildDir, "composer.json"));
      let phpVersion = "8.4";
      if (hasComposer) {
        try {
          const composerJson = JSON.parse(await readFs(join(buildDir, "composer.json"), "utf-8"));
          const phpReq = composerJson?.require?.["php"];
          if (typeof phpReq === "string") {
            const matches = [...phpReq.matchAll(/8\.(\d+)/g)];
            if (matches.length) {
              const minMinor = Math.min(...matches.map((m) => parseInt(m[1], 10)));
              const minor = Math.min(4, Math.max(2, minMinor));
              phpVersion = `8.${minor}`;
            }
          }
        } catch {}
        await appendLog(deploymentId, `[${ts()}] ℹ Detected composer.json — will run composer install (PHP ${phpVersion}) before JS build`);
      }
      const composerStage = hasComposer
        ? `FROM php:${phpVersion}-cli AS composer\nWORKDIR /app\nCOPY ${copyPrefix}composer.json ${copyPrefix}composer.lock* ./\nRUN apt-get update && apt-get install -y --no-install-recommends curl git && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer && rm -rf /var/lib/apt/lists/*\nRUN composer install --no-interaction --optimize-autoloader --ignore-platform-reqs --prefer-dist --no-scripts\n`
        : "";
      const composerCopy = hasComposer ? `COPY --from=composer /app/vendor ./vendor\n` : "";

      let df = hasComposer ? composerStage : "";
      df += `FROM node:20-slim AS builder\nWORKDIR /app\n`;
      if (detectedPM === "pnpm") {
        df += `COPY ${copyPrefix}package.json ${copyPrefix}pnpm-lock.yaml ./\nRUN corepack enable && corepack prepare pnpm@${pnpmVersion} --activate\nRUN pnpm install --no-frozen-lockfile\nCOPY ${copyPrefix}. .\n${composerCopy}RUN pnpm run build\n`;
      } else if (detectedPM === "yarn") {
        df += `COPY ${copyPrefix}package.json ${copyPrefix}yarn.lock ./\nRUN corepack enable\nRUN yarn install --immutable\nCOPY ${copyPrefix}. .\n${composerCopy}RUN yarn build\n`;
      } else {
        df += `COPY ${copyPrefix}package.json ${copyPrefix}package-lock.json* ./\nRUN npm ci\nCOPY ${copyPrefix}. .\n${composerCopy}RUN npm run build\n`;
      }
      if (runtime.name === "php") {
        df += `\nFROM php:${phpVersion}-cli\nWORKDIR /app\n`;
        df += `COPY --from=builder /app .\nENV PORT=${runtime.port}\nEXPOSE ${runtime.port}\n`;
        df += `CMD ${JSON.stringify(runtime.startCmd.split(" "))}\n`;
      } else {
        df += `\nFROM node:20-slim\nWORKDIR /app\n`;
        if (isNextJs && hasStandalone) {
          df += `COPY --from=builder /app/.next/standalone ./\nCOPY --from=builder /app/.next/static ./.next/static\nCOPY --from=builder /app/public ./public\nENV PORT=3000 HOSTNAME="0.0.0.0"\nEXPOSE 3000\nCMD ["node", "server.js"]\n`;
        } else if (isNextJs) {
          df += `COPY --from=builder /app/node_modules ./node_modules\nCOPY --from=builder /app/.next ./.next\nCOPY --from=builder /app/public ./public\nCOPY --from=builder /app/package.json ./\n`;
          df += `ENV PORT=3000 HOSTNAME="0.0.0.0"\nEXPOSE 3000\nCMD ${JSON.stringify([detectedPM || "npm", "start"])}\n`;
        } else {
          df += `COPY --from=builder /app .\nENV PORT=${runtime.port}\nEXPOSE ${runtime.port}\nCMD ${JSON.stringify(runtime.startCmd.split(" "))}\n`;
        }
      }

      // Verify package.json exists, find it if not
      if (!existsSync(join(buildDir, "package.json"))) {
        const findPkg = (dir: string, depth: number): string | null => {
          if (depth > 3) return null;
          try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              if (e.name === "package.json") return dir;
              if (e.isDirectory() && !["node_modules", ".git", ".next", "dist"].includes(e.name)) {
                const found = findPkg(join(dir, e.name), depth + 1);
                if (found) return found;
              }
            }
          } catch {}
          return null;
        };
        const pkgDir = findPkg(repoDir, 0);
        if (pkgDir) {
          buildDir = pkgDir;
          await appendLog(deploymentId, `[${ts()}] ℹ Found package.json in: ${buildDir.replace(workDir, ".")}`);
        }
      }

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
      await appendLog(deploymentId, `[${ts()}] ℹ Generated Dockerfile in repo root (pm: ${detectedPM || "npm"}, subDir: ${subDir || "/"})`);
      }

      // ── Docker build (skip for AWS managed/serverless — both ECS and App Runner use Pulumi docker → ECR) ──
      const isAwsEcs = provider === "aws" && event.deployStrategy !== "vps" && event.deployStrategy !== "serverless";
      const skipAwsBuild = provider === "aws" && event.deployStrategy !== "vps";
      if (!skipBuild && !skipAwsBuild) {
        const buildResult = await runCmd("docker", [
          "build", "-t", imageName, "."
        ], { cwd: repoDir });
        if (buildResult.code !== 0) {
          throw new Error(`docker build failed (exit code ${buildResult.code})`);
        }
        await appendLog(deploymentId, `[${ts()}] ✓ Docker image built: ${imageName}`);
      } else if (skipBuild) {
        await appendLog(deploymentId, `[${ts()}] ℹ Reusing cached image, skipping build`);
      } else if (isAwsEcs) {
        await appendLog(deploymentId, `[${ts()}] ℹ Skipping local build — Pulumi will build+push to ECR`);
      } else {
        await appendLog(deploymentId, `[${ts()}] ℹ Skipping local build — Pulumi will build+push to ECR for App Runner`);
      }

      // Save docker image name to DB
      await db.exec`UPDATE deployments SET docker_image = ${imageName} WHERE id = ${deploymentId}`;

      // ── Step 2b: Push image to registry (if registry configured) ──
      let remoteImage = imageName;
      if (event.registryUrl) {
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── Push Image to Registry ─────────`);
        remoteImage = `${event.registryUrl}/${imageName}`;
        // Tag the image for the remote registry
        const tagResult = await runCmd("docker", ["tag", imageName, remoteImage], { cwd: workDir });
        if (tagResult.code !== 0) {
          await appendLog(deploymentId, `[${ts()}] ⚠ docker tag failed, continuing with local image`);
          remoteImage = imageName;
        } else {
          const pushResult = await runCmd("docker", ["push", remoteImage], { cwd: workDir });
          if (pushResult.code !== 0) {
            await appendLog(deploymentId, `[${ts()}] ⚠ docker push failed, continuing with local image`);
            remoteImage = imageName;
          } else {
            await appendLog(deploymentId, `[${ts()}] ✓ Image pushed: ${remoteImage}`);
          }
        }
      }
      // ── Step 3: Pulumi up ──
      await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Pulumi Setup ───────────────────`);

      const pulumiDir = join(workDir, "pulumi");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(pulumiDir, { recursive: true });

      // Write Pulumi program files (use unique app names for AWS ECS to avoid resource conflicts)
      const { generatePulumiProject, generatePackageJson, generateTsConfig } = await import("./pulumi-templates/index");
      let pulumiScript = event.tofuScript;
      // Normalize AWS App Runner runtimes (NODEJS_20/PYTHON_312 not supported — use NODEJS_22/PYTHON_311)
      pulumiScript = pulumiScript.replace(/NODEJS_20/g, "NODEJS_22").replace(/PYTHON_312/g, "PYTHON_311");
      if (provider === "aws" && event.deployStrategy !== "vps") {
        const uniqueAppName = `${repoName}-${shortId}`;
        const quotedRepo = repoName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pulumiScript = pulumiScript.replace(new RegExp(`"${quotedRepo}(-[a-zA-Z0-9-]*)?"`, "g"), (_, suffix) => `"${uniqueAppName}${suffix || ""}"`);
        await appendLog(deploymentId, `[${ts()}] ℹ Using unique resource prefix: ${uniqueAppName}`);
      }
      await writeFile(join(pulumiDir, "index.ts"), pulumiScript, "utf-8");
      await writeFile(join(pulumiDir, "Pulumi.yaml"), generatePulumiProject(repoName, provider), "utf-8");
      await writeFile(join(pulumiDir, "package.json"), generatePackageJson(repoName, provider), "utf-8");
      await writeFile(join(pulumiDir, "tsconfig.json"), generateTsConfig(), "utf-8");

      // Build provider env vars
      const providerEnv: Record<string, string> = {};
      if (provider === "aws") {
        providerEnv.AWS_ACCESS_KEY_ID = providerRow?.api_key || "";
        providerEnv.AWS_SECRET_ACCESS_KEY = providerRow?.api_secret || "";
        providerEnv.AWS_DEFAULT_REGION = region;
      } else if (provider === "digitalocean") {
        providerEnv.DIGITALOCEAN_TOKEN = providerRow?.api_key || "";
      } else if (provider === "hetzner") {
        providerEnv.HCLOUD_TOKEN = providerRow?.api_key || "";
      } else if (provider === "vultr") {
        providerEnv.VULTR_API_KEY = providerRow?.api_key || "";
      } else if (provider === "linode") {
        providerEnv.LINODE_TOKEN = providerRow?.api_key || "";
      }
      // Use local backend (file state) to avoid needing Pulumi Cloud login
      const stateDir = join(pulumiDir, ".pulumi-state");
      await mkdir(stateDir, { recursive: true });
      providerEnv.PULUMI_BACKEND_URL = `file://${stateDir}`;
      providerEnv.PULUMI_CONFIG_PASSPHRASE = "";

      // npm install
      await appendLog(deploymentId, `[${ts()}] ℹ Installing Pulumi dependencies...`);
      const installResult = await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });
      if (installResult.code !== 0) {
        throw new Error(`npm install failed (exit code ${installResult.code})`);
      }
      await appendLog(deploymentId, `[${ts()}] ✓ Dependencies installed`);

      // pulumi stack init
      const stackName = `${repoName}-${shortId}`;
      await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

      // Set config values — SSH public key for VPS providers (from ssh_keys table)
      if (provider === "hetzner" || provider === "vultr" || provider === "linode" || (provider === "aws" && event.deployStrategy === "vps")) {
        const sshKeyRow = await db.queryRow<{ public_key: string }>`
          SELECT public_key FROM ssh_keys WHERE user_id = ${event.userId} ORDER BY created_at DESC LIMIT 1`;
        if (!sshKeyRow) {
          throw new Error("No SSH key found. Go to Settings → SSH Keys and add your public key before deploying to a VPS.");
        }
        await runCmd("pulumi", ["config", "set", "sshPublicKey", sshKeyRow.public_key.trim(), "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
        if (provider === "aws" && event.deployStrategy === "vps") {
          await runCmd("pulumi", ["config", "set", "keyPairSuffix", shortId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
        }
      }
      if (provider === "linode") {
        await runCmd("pulumi", ["config", "set", "--secret", "rootPassword", `Ch4ng3M3-${shortId}!`, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      }
      await runCmd("pulumi", ["config", "set", "region", region, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

      // For AWS ECS/App Runner deploys, tell @pulumi/docker where the Dockerfile is (repo root)
      if (provider === "aws" && event.deployStrategy !== "vps") {
        await runCmd("pulumi", ["config", "set", "buildContext", repoDir, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      }

      // AWS App Runner requires the GitHub connection ARN for source authentication
      if (isAppRunner && appRunnerArn) {
        await runCmd("pulumi", ["config", "set", "appRunnerConnectionArn", appRunnerArn, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      }

      // Restore state from previous deployment if available
      let hasValidState = false;
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
            // Only attempt import if it looks like valid Pulumi state (has "deployment" key)
            if (savedState.includes('"deployment"')) {
              const stateFile = join(pulumiDir, "prev-state.json");
              await writeFile(stateFile, savedState, "utf-8");
              const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
              if (importResult.code === 0) {
                hasValidState = true;
                await appendLog(deploymentId, `[${ts()}] ℹ Restored state from previous deployment`);
                // Remove stale config keys only when not using App Runner (ECS doesn't need it)
                if (!isAppRunner) {
                  await runCmd("pulumi", ["config", "rm", "appRunnerConnectionArn", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
                }
              }
            }
          } catch { /* non-critical */ }
        }
      }

      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Pulumi Up ──────────────────────`);

      // Clean up leftover AWS ECS resources from previous (non-Pulumi) deploys
      if (isAwsEcs && !hasValidState) {
        const appName = repoName;
        await appendLog(deploymentId, `[${ts()}] ℹ Cleaning up pre-existing AWS resources...`);

        // Silently clean up — errors are expected if resources don't exist
        const silentCmd = async (cmd: string, args: string[], env?: Record<string, string>) => {
          const result = await new Promise<{ code: number; output: string }>((resolve) => {
            const proc = spawn(cmd, args, {
              env: { ...process.env, ...env },
              stdio: ["ignore", "pipe", "pipe"],
            });
            let output = "";
            proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
            proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
            proc.on("close", (code) => resolve({ code: code ?? 1, output }));
            proc.on("error", (err) => resolve({ code: 1, output: err.message }));
          });
          return result;
        };

        await silentCmd("aws", ["logs", "delete-log-group", "--log-group-name", `/ecs/${appName}`, "--region", region], providerEnv);
        await silentCmd("aws", ["iam", "detach-role-policy", "--role-name", `${appName}-exec`, "--policy-arn", "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"], providerEnv);
        await silentCmd("aws", ["iam", "delete-role", "--role-name", `${appName}-exec`], providerEnv);
        await silentCmd("aws", ["ecs", "update-service", "--cluster", appName, "--service", appName, "--desired-count", "0", "--region", region], providerEnv);
        await silentCmd("aws", ["ecs", "delete-service", "--cluster", appName, "--service", appName, "--force", "--region", region], providerEnv);
        const tdListResult = await silentCmd("aws", ["ecs", "list-task-definitions", "--family-prefix", appName, "--query", "taskDefinitionArns", "--output", "text", "--region", region], providerEnv);
        if (tdListResult.code === 0 && tdListResult.output.trim()) {
          for (const arn of tdListResult.output.trim().split(/\s+/)) {
            if (arn.startsWith("arn:")) await silentCmd("aws", ["ecs", "deregister-task-definition", "--task-definition", arn, "--region", region], providerEnv);
          }
        }
        await silentCmd("aws", ["ecs", "delete-cluster", "--cluster", appName, "--region", region], providerEnv);
        const sgResult = await silentCmd("aws", ["ec2", "describe-security-groups", "--filters", `Name=group-name,Values=${appName}-sg`, "--query", "SecurityGroups[0].GroupId", "--output", "text", "--region", region], providerEnv);
        if (sgResult.code === 0 && sgResult.output.trim() && sgResult.output.trim() !== "None") {
          await silentCmd("aws", ["ec2", "delete-security-group", "--group-id", sgResult.output.trim(), "--region", region], providerEnv);
        }
        await silentCmd("aws", ["ecr", "delete-repository", "--repository-name", appName, "--force", "--region", region], providerEnv);
        await appendLog(deploymentId, `[${ts()}] ✓ Cleaned up pre-existing resources`);
      }

      const upResult = await runCmd("pulumi", ["up", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
      if (upResult.code !== 0) {
        throw new Error(`pulumi up failed (exit code ${upResult.code})`);
      }

      // ── Step 4: Extract outputs ──
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Extracting outputs ──────────────`);
      const outputResult = await runCmd("pulumi", ["stack", "output", "--json", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

      let appUrl = "";
      let serverIp = "";
      try {
        const outputs = JSON.parse(outputResult.output);
        appUrl = outputs.appUrl || outputs.serverIp || "";
        serverIp = outputs.serverIp || "";
        if (appUrl && !appUrl.startsWith("http") && !appUrl.startsWith("ecs-fargate://")) appUrl = `http://${appUrl}`;
        for (const [key, val] of Object.entries(outputs)) {
          await appendLog(deploymentId, `[${ts()}]   ${key} = ${val}`);
        }
      } catch {
        await appendLog(deploymentId, `[${ts()}]   (could not parse outputs)`);
      }

      // ── Step 5: Wait for ECS task public IP (AWS ECS deploys only) ──
      if (isAwsEcs) {
        let ecsClusterName = "";
        let ecsServiceName = "";
        try {
          const outputs = JSON.parse(outputResult.output);
          ecsClusterName = outputs.clusterName || "";
          ecsServiceName = outputs.serviceName || "";
        } catch {}

        if (ecsClusterName && ecsServiceName) {
          await appendLog(deploymentId, `[${ts()}]`);
          await appendLog(deploymentId, `[${ts()}] ── Waiting for ECS Task ────────────`);
          await appendLog(deploymentId, `[${ts()}] ℹ Image was built & pushed to ECR by Pulumi`);

          let taskPublicIp = "";
          for (let attempt = 0; attempt < 20; attempt++) {
            await new Promise(r => setTimeout(r, 15_000));
            const listResult = await runCmd("aws", [
              "ecs", "list-tasks",
              "--cluster", ecsClusterName,
              "--service-name", ecsServiceName,
              "--desired-status", "RUNNING",
              "--region", region,
              "--output", "json"
            ], { cwd: workDir, env: providerEnv });
            try {
              const listOutput = JSON.parse(listResult.output);
              const taskArns: string[] = listOutput.taskArns || [];
              if (taskArns.length > 0) {
                await appendLog(deploymentId, `[${ts()}] ✓ ECS task is running`);
                const descResult = await runCmd("aws", [
                  "ecs", "describe-tasks",
                  "--cluster", ecsClusterName,
                  "--tasks", taskArns[0],
                  "--region", region,
                  "--output", "json"
                ], { cwd: workDir, env: providerEnv });
                try {
                  const descOutput = JSON.parse(descResult.output);
                  const attachments = descOutput.tasks?.[0]?.attachments || [];
                  for (const att of attachments) {
                    if (att.type === "ElasticNetworkInterface") {
                      const eniDetail = (att.details || []).find((d: any) => d.name === "networkInterfaceId");
                      if (eniDetail) {
                        const eniResult = await runCmd("aws", [
                          "ec2", "describe-network-interfaces",
                          "--network-interface-ids", eniDetail.value,
                          "--query", "NetworkInterfaces[0].Association.PublicIp",
                          "--output", "text",
                          "--region", region
                        ], { cwd: workDir, env: providerEnv });
                        const ip = eniResult.output.trim();
                        if (ip && ip !== "None") {
                          taskPublicIp = ip;
                          await appendLog(deploymentId, `[${ts()}] ✓ Public IP: ${taskPublicIp}`);
                        }
                      }
                    }
                  }
                } catch { /* parse error */ }
                break;
              }
            } catch { /* parse error */ }
            if (attempt === 5 || attempt === 10 || attempt === 15) {
              const stoppedResult = await runCmd("aws", [
                "ecs", "describe-services",
                "--cluster", ecsClusterName,
                "--services", ecsServiceName,
                "--region", region,
                "--output", "json"
              ], { cwd: workDir, env: providerEnv });
              try {
                const svcOutput = JSON.parse(stoppedResult.output);
                const events = svcOutput.services?.[0]?.events?.slice(0, 3) || [];
                for (const ev of events) {
                  await appendLog(deploymentId, `[${ts()}]   ECS event: ${ev.message}`);
                }
              } catch {}
            }
            await appendLog(deploymentId, `[${ts()}] ℹ Waiting for task... (attempt ${attempt + 1}/20)`);
          }
          if (taskPublicIp) {
            appUrl = `http://${taskPublicIp}:${3000}`;
          }
        }
      }

      // ── Step 5b: Transfer Docker image to server (VPS, if no registry) ──
      if (event.techStack.length > 0 && serverIp && !event.registryUrl && provider !== "aws") {
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── Transfer Docker Image ──────────`);
        const tarPath = join(workDir, `${imageName.replace(":", "-")}.tar`);
        const saveResult = await runCmd("docker", ["save", "-o", tarPath, imageName], { cwd: workDir });
        if (saveResult.code === 0) {
          // Wait for SSH to be ready (VPS just provisioned)
          await appendLog(deploymentId, `[${ts()}] ℹ Waiting for server SSH to be ready...`);
          await new Promise(r => setTimeout(r, 30_000));

          // SCP the image to the server
          const scpResult = await runCmd("scp", [
            "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30",
            tarPath, `root@${serverIp}:/tmp/app-image.tar`
          ], { cwd: workDir });

          if (scpResult.code === 0) {
            // Load the image on the server
            const loadResult = await runCmd("ssh", [
              "-o", "StrictHostKeyChecking=no",
              `root@${serverIp}`,
              `docker load -i /tmp/app-image.tar && rm /tmp/app-image.tar && docker stop ${repoName} 2>/dev/null; docker rm ${repoName} 2>/dev/null; docker run -d --name ${repoName} --restart=always -p 127.0.0.1:8080:8080 --add-host=host.docker.internal:host-gateway -e APP_ENV=production -e PORT=8080 ${imageName}`
            ], { cwd: workDir });
            if (loadResult.code === 0) {
              await appendLog(deploymentId, `[${ts()}] ✓ Docker image transferred and running on server`);
            } else {
              await appendLog(deploymentId, `[${ts()}] ⚠ Failed to load image on server (deploy may still work via user_data)`);
            }
          } else {
            await appendLog(deploymentId, `[${ts()}] ⚠ SCP failed — server may still pull image via user_data`);
          }
        } else {
          await appendLog(deploymentId, `[${ts()}] ⚠ docker save failed, skipping image transfer`);
        }
      }

      // ── Save state ──
      try {
        const stateResult = await runCmd("pulumi", ["stack", "export", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
        if (stateResult.code === 0) {
          await db.exec`UPDATE deployments SET tofu_script = ${event.tofuScript + "\n\n/* STATE */\n" + stateResult.output} WHERE id = ${deploymentId}`;
        }
      } catch { /* not critical */ }

      // ── Cleanup ──
      try { await rm(workDir, { recursive: true, force: true }); } catch { /* ignore */ }

      const finalUrl = appUrl || generateAppUrl(provider, repoName, shortId, region);
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

