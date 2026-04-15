import { Subscription } from "encore.dev/pubsub";
import { db, deployTopic, type DeployEvent } from "../shared";
import { git_integration } from "~encore/clients";
import { appendLog, ts } from "./helpers";
import { handleAwsDeploy } from "./aws-deploy";
import { handlePulumiDeploy } from "./pulumi-deploy";
import { getTemplateConfig } from "../templates";
import { handleTemplateDeploy } from "./template-deploy";

const _ = new Subscription(deployTopic, "deploy-processor", {
  handler: async (event: DeployEvent) => {
    const { deploymentId } = event;
    const repoName = event.repo.split("/").pop() || "app";
    const shortId = deploymentId.slice(0, 8);

    const providerRow = await db.queryRow<{ provider: string; region: string; api_key: string; api_secret: string }>`
      SELECT provider, region, api_key, api_secret FROM server_providers WHERE id = ${event.providerId}`;
    const provider = providerRow?.provider || "cloud";
    const defaultRegions: Record<string, string> = {
      aws: "us-east-1", digitalocean: "nyc3", hetzner: "nbg1", vultr: "ewr",
      linode: "us-east", gcp: "us-central1", upcloud: "us-nyc1",
    };
    const region = providerRow?.region || defaultRegions[providerRow?.provider || ""] || "us-east-1";

    // ── Template deploy path ──
    // If this is a template-based project, skip clone/analyze and use pre-built Docker images
    if (event.templateId) {
      const templateConfig = getTemplateConfig(event.templateId);
      if (templateConfig) {
        // For template projects, use the project name instead of the repo URL
        const projectRow = await db.queryRow<{ name: string }>`SELECT name FROM projects WHERE app_id = ${event.appId} ORDER BY created_at DESC LIMIT 1`;
        const templateRepoName = projectRow?.name || repoName;
        try {
          await handleTemplateDeploy(event, templateConfig, {
            deploymentId, repoName: templateRepoName, shortId, provider, region,
            providerRow: providerRow!,
          });
        } catch (e: any) {
          await appendLog(deploymentId, `[${ts()}]`);
          await appendLog(deploymentId, `[${ts()}] ✗ Template deployment failed: ${e.message || e}`);
          await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
        }
        return;
      }
    }

    // ── Standard deploy path (clone repo, analyze, build, deploy) ──
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir, homedir } = await import("node:os");
    const { spawn } = await import("node:child_process");
    const { execSync } = await import("node:child_process");

    // Ensure ~/.pulumi/bin and common install locations are in PATH for child processes
    const { join: joinPath } = await import("node:path");
    const pulumiHome = joinPath(homedir(), ".pulumi", "bin");
    const pathSep = process.platform === "win32" ? ";" : ":";
    const extraPaths = process.platform === "win32"
      ? [pulumiHome, "C:\\Program Files\\Pulumi", "C:\\Program Files (x86)\\Pulumi"]
      : [pulumiHome, "/usr/local/bin"];
    const augmentedPath = [...extraPaths, process.env.PATH || ""].join(pathSep);

    const runCmd = (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<{ code: number; output: string }> => {
      return new Promise((resolve) => {
        const proc = spawn(cmd, args, { cwd: opts?.cwd || undefined, env: { ...process.env, PATH: augmentedPath, ...opts?.env }, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
        let output = "";
        const onData = async (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          for (const line of lines) {
            output += line + "\n";
            if (/^\s*\.+\s*$/.test(line) || /^@ updating/.test(line)) continue;
            // Filter noisy Docker push/pull layer status lines
            if (/^[0-9a-f]{12}:\s*(Waiting|Preparing|Layer already exists|Pushing|Pulling fs layer)\s*$/.test(line)) continue;
            if (/^\s*Waiting\s*$/.test(line)) continue;
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
      // For GCP, extract the actual region from the Pulumi script since the wizard selection overrides the provider default
      let displayRegion = region;
      if (provider === "gcp" && event.tofuScript) {
        const regionMatch = event.tofuScript.match(/config\.get\("region"\)\s*\|\|\s*"([^"]+)"/);
        if (regionMatch) displayRegion = regionMatch[1];
      }
      await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${provider} | Region: ${displayRegion}`);
      await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${event.deployStrategy || "managed (default)"}`);
      await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${event.repo} | Branch: ${event.branch}`);

      // ── Clone repository ──
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Clone Repository ───────────────`);

      const conn = await git_integration.getConnectionForScan({ connectionId: event.gitConnectionId });
      let cloneUrl: string;
      if (conn.provider === "github") cloneUrl = `https://x-access-token:${conn.token}@github.com/${event.repo}.git`;
      else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") { const host = new URL(conn.endpoint || "https://gitlab.com").host; cloneUrl = `https://oauth2:${conn.token}@${host}/${event.repo}.git`; }
      else if (conn.provider === "bitbucket") cloneUrl = `https://x-token-auth:${conn.token}@bitbucket.org/${event.repo}.git`;
      else throw new Error(`Unsupported git provider: ${conn.provider}`);

      const workDir = await mkdtemp(join(tmpdir(), `deploy-${shortId}-`));
      const repoDir = join(workDir, "repo");
      execSync(`git clone --depth 1 --branch ${JSON.stringify(event.branch)} ${JSON.stringify(cloneUrl)} repo`, { cwd: workDir, timeout: 120_000, stdio: "pipe" });
      const commitHash = execSync("git rev-parse HEAD", { cwd: repoDir, timeout: 5_000 }).toString().trim();
      await appendLog(deploymentId, `[${ts()}] ✓ Repository cloned (commit: ${commitHash.slice(0, 8)})`);
      await db.exec`UPDATE deployments SET commit_hash = ${commitHash} WHERE id = ${deploymentId}`;

      // ── Analyze repository ──
      const { existsSync } = await import("node:fs");
      const { readFile: readFs } = await import("node:fs/promises");
      const { analyzeRepoConfig, generateDockerfile, configSummary } = await import("../repo-analyzer");

      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Analyze Repository ──────────────`);

      const repoConfig = analyzeRepoConfig(repoDir);
      for (const line of configSummary(repoConfig)) await appendLog(deploymentId, `[${ts()}] ℹ ${line}`);

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
      const dockerignore = ["node_modules", ".next", ".git", ".gitignore", "dist", "build", "out", "output", ".turbo", ".cache", ".pnpm-store", "vendor", ".env", ".env.*", "*.log", "coverage", ".nyc_output", "__pycache__", "*.pyc", ".venv", "venv", "*.md", "*.mdx", "LICENSE", ".vscode", ".idea", ".cursor", "Dockerfile*", ".dockerignore", "pulumi", ".pulumi-state"].join("\n");
      await writeFile(join(repoDir, ".dockerignore"), dockerignore, "utf-8");

      const pm = repoConfig.packageManager !== "unknown" ? repoConfig.packageManager : "npm";
      await appendLog(deploymentId, `[${ts()}] ✓ Generated Dockerfile (${repoConfig.runtime}/${repoConfig.framework || "generic"}, pm: ${pm}, subDir: ${repoConfig.subDir || "/"})`);

      // ── Dispatch to provider-specific handler ──
      if (provider === "aws") {
        await handleAwsDeploy(event, {
          deploymentId, repoName, shortId, provider, region,
          providerRow: providerRow!,
          repoDir, workDir, commitHash,
          repoConfig: { port: repoConfig.port, packageManager: repoConfig.packageManager },
          writeFile: (p, d, e) => writeFile(p, d, e as BufferEncoding),
          rm,
        });
      } else {
        await handlePulumiDeploy(event, {
          deploymentId, repoName, shortId, provider, region,
          providerRow: providerRow!,
          repoDir, workDir, commitHash, runCmd,
          writeFile: (p, d, e) => writeFile(p, d, e as BufferEncoding),
          readFs: (p, e) => readFs(p, e as BufferEncoding),
          rm,
        });
      }
    } catch (e: any) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${e.message || e}`);
      await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
    }
  },
});
