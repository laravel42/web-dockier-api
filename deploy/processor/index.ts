import { Subscription } from "encore.dev/pubsub";
import { db, deployTopic, type DeployEvent, DEFAULT_REGIONS, extractRegionFromScript } from "../shared";
import { git_integration } from "~encore/clients";
import { appendLog, ts } from "./helpers";
import { handleAwsDeploy } from "./aws-deploy";
import { handlePulumiDeploy } from "./pulumi-deploy";
import { getTemplateConfig } from "../templates";
import { handleTemplateDeploy } from "./template-deploy";
import { createStreamingRunCmd } from "./run-cmd";
import { getAdapter } from "./adapters";
import type { AdapterContext, DetectedStackInfo } from "./adapters/types";

const _ = new Subscription(deployTopic, "deploy-processor", {
  handler: async (event: DeployEvent) => {
    const { deploymentId } = event;
    const repoName = event.repo.split("/").pop() || "app";
    const shortId = deploymentId.slice(0, 8);

    const providerRow = await db.queryRow<{ provider: string; region: string; api_key: string; api_secret: string }>`
      SELECT provider, region, api_key, api_secret FROM server_providers WHERE id = ${event.providerId}`;
    const provider = providerRow?.provider || "cloud";
    let region = providerRow?.region || DEFAULT_REGIONS[providerRow?.provider || ""] || "us-east-1";

    // Extract the actual region from the tofuScript if available (the wizard bakes the user's selection into the script)
    if (event.tofuScript) {
      const scriptRegion = extractRegionFromScript(event.tofuScript);
      if (scriptRegion) region = scriptRegion;
    }

    // ── Template deploy path ──
    if (event.templateId) {
      const templateConfig = getTemplateConfig(event.templateId);
      if (templateConfig) {
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
    const { tmpdir } = await import("node:os");
    const { execSync } = await import("node:child_process");

    const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);

    try {
      await db.exec`UPDATE deployments SET status = 'building', updated_at = NOW() WHERE id = ${deploymentId}`;
      await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);
      // For GCP, extract the actual region from the Pulumi script since the wizard selection overrides the provider default
      let displayRegion = region;
      if (provider === "gcp" && event.tofuScript) {
        const scriptRegion = extractRegionFromScript(event.tofuScript);
        if (scriptRegion) displayRegion = scriptRegion;
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

      const df = generateDockerfile(repoConfig, repoDir);
      await writeFile(join(repoDir, "Dockerfile"), df, "utf-8");
      const dockerignore = ["node_modules", ".next", ".git", ".gitignore", "dist", "build", "out", "output", ".turbo", ".cache", ".pnpm-store", "/vendor", ".env", "*.log", "!.env.example", "coverage", ".nyc_output", "__pycache__", "*.pyc", ".venv", "venv", "*.md", "*.mdx", "LICENSE", ".vscode", ".idea", ".cursor", "Dockerfile*", ".dockerignore", "pulumi", ".pulumi-state"].join("\n");
      await writeFile(join(repoDir, ".dockerignore"), dockerignore, "utf-8");

      const pm = repoConfig.packageManager !== "unknown" ? repoConfig.packageManager : "npm";
      await appendLog(deploymentId, `[${ts()}] ✓ Generated Dockerfile (${repoConfig.runtime}/${repoConfig.framework || "generic"}, pm: ${pm}, subDir: ${repoConfig.subDir || "/"})`);

      // ── Legacy CodeBuild path (backward compatibility) ──
      if (event.buildMethod === "codebuild") {
        await handleAwsDeploy(event, {
          deploymentId, repoName, shortId, provider, region,
          providerRow: providerRow!,
          repoDir, workDir, commitHash,
          repoConfig: { port: repoConfig.port, packageManager: repoConfig.packageManager },
          writeFile: (p, d, e) => writeFile(p, d, e as BufferEncoding),
          rm,
        });
        return;
      }

      // ── Unified adapter dispatch ──
      const isStaticDeploy = event.deployStrategy === "static";
      const imageName = `${repoName}:${shortId}`;
      let actualImage = imageName;
      let skipBuild = isStaticDeploy;

      // Check for cached image from previous deployment
      if (!isStaticDeploy) {
        const cachedImage = await db.queryRow<{ docker_image: string }>`
          SELECT docker_image FROM deployments
          WHERE repo = ${event.repo} AND branch = ${event.branch} AND commit_hash = ${commitHash}
            AND docker_image != '' AND id != ${deploymentId}
            AND status NOT IN ('destroyed', 'failed')
          ORDER BY created_at DESC LIMIT 1`;
        if (cachedImage?.docker_image) {
          try {
            execSync(`docker image inspect ${JSON.stringify(cachedImage.docker_image)}`, { timeout: 10_000, stdio: "pipe" });
            actualImage = cachedImage.docker_image;
            skipBuild = true;
            await appendLog(deploymentId, `[${ts()}] ℹ Reusing cached image: ${actualImage}`);
          } catch {}
        }
      }

      // Build Docker image locally (unless static or cached)
      if (!skipBuild) {
        await appendLog(deploymentId, `[${ts()}]`);
        await appendLog(deploymentId, `[${ts()}] ── Build Docker Image ─────────────`);
        const MAX_BUILD_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
          const buildArgs = ["build", "--platform", "linux/amd64", "-t", imageName];
          if (attempt > 1) buildArgs.push("--no-cache");
          buildArgs.push(".");
          const buildResult = await runCmd("docker", buildArgs, { cwd: repoDir });
          if (buildResult.code === 0) { await appendLog(deploymentId, `[${ts()}] ✓ Docker image built: ${imageName}`); break; }
          if (attempt < MAX_BUILD_ATTEMPTS) {
            const { patchDockerfile } = await import("../repo-analyzer");
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

      // Save Docker image reference
      if (!isStaticDeploy) {
        await db.exec`UPDATE deployments SET docker_image = ${actualImage} WHERE id = ${deploymentId}`;
      }

      // ── Look up adapter and dispatch ──
      const deployStrategy = event.deployStrategy || "managed";
      const adapter = getAdapter(provider, deployStrategy);
      await appendLog(deploymentId, `[${ts()}] ℹ Using adapter: ${adapter.id}`);

      // Build DetectedStackInfo from repoConfig
      const detectedStack: DetectedStackInfo = {
        runtime: repoConfig.runtime,
        framework: repoConfig.framework || "",
        packageManager: repoConfig.packageManager,
        port: repoConfig.port,
        subDir: repoConfig.subDir || "",
        isStatic: isStaticDeploy,
      };

      // Build AdapterContext
      const adapterCtx: AdapterContext = {
        deploymentId,
        repoName,
        shortId,
        region,
        repoDir,
        workDir,
        commitHash,
        providerCredentials: { apiKey: providerRow!.api_key, apiSecret: providerRow!.api_secret },
        event,
        detectedStack,
        runCmd,
        appendLog: (line: string) => appendLog(deploymentId, line),
        writeFile: (p, d, e) => writeFile(p, d, e as BufferEncoding),
        readFile: (p, e) => readFs(p, e as BufferEncoding),
        rm,
      };

      // Inject environment variables
      await adapter.injectEnvVars(adapterCtx, event.envVars || []);

      // Push image to provider registry
      await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
      const pushResult = await adapter.pushImage(adapterCtx, actualImage);

      // Provision infrastructure
      const imageUri = pushResult.skipped ? "" : pushResult.remoteImageUri;
      const provision = await adapter.provisionInfrastructure(adapterCtx, imageUri || actualImage);

      // Run post-deploy steps
      await adapter.runPostDeploy(adapterCtx, provision);

      // ── Update deployment record with success ──
      const finalUrl = provision.appUrl || "";
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
      await appendLog(deploymentId, `[${ts()}] ✓ ${isStaticDeploy ? "Static site deployed" : `Docker image: ${pushResult.remoteImageUri || actualImage}`}`);
      await appendLog(deploymentId, `[${ts()}] ✓ Infrastructure provisioned via ${adapter.id}`);
      if (finalUrl) {
        await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${finalUrl}`);
        await db.exec`UPDATE deployments SET status = 'success', app_url = ${finalUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
      } else {
        await appendLog(deploymentId, `[${ts()}] ⚠ Could not determine app URL — check cloud console`);
        await db.exec`UPDATE deployments SET status = 'success', updated_at = NOW() WHERE id = ${deploymentId}`;
      }
    } catch (e: any) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${e.message || e}`);
      await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
    }
  },
});
