import { db, type DeployEvent } from "../shared";
import { appendLog, ts, generateAppUrl } from "./helpers";

type RunCmd = (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }) => Promise<{ code: number; output: string }>;

export async function handlePulumiDeploy(
  event: DeployEvent,
  ctx: {
    deploymentId: string;
    repoName: string;
    shortId: string;
    provider: string;
    region: string;
    providerRow: { api_key: string; api_secret: string };
    repoDir: string;
    workDir: string;
    commitHash: string;
    runCmd: RunCmd;
    writeFile: (path: string, data: string, enc: string) => Promise<void>;
    readFs: (path: string, enc: string) => Promise<string>;
    rm: (path: string, opts: { recursive: boolean; force: boolean }) => Promise<void>;
  }
) {
  const { deploymentId, repoName, shortId, provider, region, repoDir, workDir, commitHash, runCmd } = ctx;
  const { execSync } = await import("node:child_process");
  const { join } = await import("node:path");

  if (!event.tofuScript) throw new Error("No Pulumi program provided. Generate infrastructure code first, then deploy.");

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
    } catch {}
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
      if (buildResult.code === 0) { await appendLog(deploymentId, `[${ts()}] ✓ Docker image built: ${imageName}`); break; }
      if (attempt < MAX_BUILD_ATTEMPTS) {
        const { patchDockerfile } = await import("../repo-analyzer");
        const currentDf = await ctx.readFs(join(repoDir, "Dockerfile"), "utf-8");
        const fix = patchDockerfile(buildResult.output, currentDf);
        if (fix) {
          await appendLog(deploymentId, `[${ts()}] ⚠ Build failed — auto-fixing: ${fix.description}`);
          await ctx.writeFile(join(repoDir, "Dockerfile"), fix.patched, "utf-8");
          continue;
        }
      }
      throw new Error(`docker build failed (exit code ${buildResult.code})`);
    }
  }

  await db.exec`UPDATE deployments SET docker_image = ${actualImage} WHERE id = ${deploymentId}`;

  let remoteImage = actualImage;
  if (event.registryUrl) {
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ── Push Image to Registry ─────────`);
    remoteImage = `${event.registryUrl}/${actualImage}`;
    const tagResult = await runCmd("docker", ["tag", actualImage, remoteImage], { cwd: workDir });
    if (tagResult.code === 0) {
      const pushResult = await runCmd("docker", ["push", remoteImage], { cwd: workDir });
      if (pushResult.code !== 0) { await appendLog(deploymentId, `[${ts()}] ⚠ docker push failed, continuing with local image`); remoteImage = actualImage; }
      else await appendLog(deploymentId, `[${ts()}] ✓ Image pushed: ${remoteImage}`);
    } else { await appendLog(deploymentId, `[${ts()}] ⚠ docker tag failed, continuing with local image`); remoteImage = actualImage; }
  }

  // ── Pulumi up ──
  await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Pulumi Setup ───────────────────`);

  const pulumiDir = join(workDir, "pulumi");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(pulumiDir, { recursive: true });

  const { generatePulumiProject, generatePackageJson, generateTsConfig } = await import("../pulumi-templates/index");
  await ctx.writeFile(join(pulumiDir, "index.ts"), event.tofuScript, "utf-8");
  await ctx.writeFile(join(pulumiDir, "Pulumi.yaml"), generatePulumiProject(repoName, provider), "utf-8");
  await ctx.writeFile(join(pulumiDir, "package.json"), generatePackageJson(repoName, provider), "utf-8");
  await ctx.writeFile(join(pulumiDir, "tsconfig.json"), generateTsConfig(), "utf-8");

  const providerEnv: Record<string, string> = {};
  if (provider === "digitalocean") providerEnv.DIGITALOCEAN_TOKEN = ctx.providerRow.api_key || "";
  else if (provider === "hetzner") providerEnv.HCLOUD_TOKEN = ctx.providerRow.api_key || "";
  else if (provider === "vultr") providerEnv.VULTR_API_KEY = ctx.providerRow.api_key || "";
  else if (provider === "linode") providerEnv.LINODE_TOKEN = ctx.providerRow.api_key || "";
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

  if (provider === "hetzner" || provider === "vultr" || provider === "linode") {
    const sshKeyRow = await db.queryRow<{ public_key: string }>`SELECT public_key FROM ssh_keys WHERE app_id = ${event.appId} ORDER BY created_at DESC LIMIT 1`;
    if (!sshKeyRow) throw new Error("No SSH key found. Go to Settings → SSH Keys and add your public key before deploying to a VPS.");
    await runCmd("pulumi", ["config", "set", "sshPublicKey", sshKeyRow.public_key.trim(), "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  }
  if (provider === "linode") await runCmd("pulumi", ["config", "set", "--secret", "rootPassword", `Ch4ng3M3-${shortId}!`, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  await runCmd("pulumi", ["config", "set", "region", region, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

  // Restore state from previous deployment
  const prevDeploy = await db.queryRow<{ tofu_script: string }>`
    SELECT tofu_script FROM deployments WHERE repo = ${event.repo} AND provider_id = ${event.providerId}
      AND tofu_script LIKE '%/* STATE */%' AND id != ${deploymentId} ORDER BY created_at DESC LIMIT 1`;
  if (prevDeploy?.tofu_script) {
    const stateMarker = prevDeploy.tofu_script.indexOf("/* STATE */\n");
    if (stateMarker !== -1) {
      const savedState = prevDeploy.tofu_script.slice(stateMarker + "/* STATE */\n".length);
      try {
        if (savedState.includes('"deployment"')) {
          const stateFile = join(pulumiDir, "prev-state.json");
          await ctx.writeFile(stateFile, savedState, "utf-8");
          const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
          if (importResult.code === 0) await appendLog(deploymentId, `[${ts()}] ℹ Restored state from previous deployment`);
        }
      } catch {}
    }
  }

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Pulumi Up ──────────────────────`);
  const upResult = await runCmd("pulumi", ["up", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
  if (upResult.code !== 0) throw new Error(`pulumi up failed (exit code ${upResult.code})`);

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Extracting outputs ──────────────`);
  const outputResult = await runCmd("pulumi", ["stack", "output", "--json", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

  let appUrl = "";
  let serverIp = "";
  try {
    const jsonMatch = outputResult.output.match(/\{[\s\S]*\}/);
    const outputs = JSON.parse(jsonMatch ? jsonMatch[0] : outputResult.output);
    appUrl = outputs.appUrl || ""; serverIp = outputs.serverIp || "";
    if (!appUrl && serverIp) appUrl = `http://${serverIp}`;
    if (appUrl && !appUrl.startsWith("http")) appUrl = `http://${appUrl}`;
    for (const [key, val] of Object.entries(outputs)) await appendLog(deploymentId, `[${ts()}]   ${key} = ${val}`);
  } catch { await appendLog(deploymentId, `[${ts()}]   (could not parse outputs)`); }

  // Transfer Docker image to server (VPS, if no registry)
  if (event.techStack.length > 0 && serverIp && !event.registryUrl) {
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ── Transfer Docker Image ──────────`);
    const tarPath = join(workDir, `${actualImage.replace(":", "-")}.tar`);
    const saveResult = await runCmd("docker", ["save", "-o", tarPath, actualImage], { cwd: workDir });
    if (saveResult.code === 0) {
      await appendLog(deploymentId, `[${ts()}] ℹ Waiting for server SSH to be ready...`);
      await new Promise(r => setTimeout(r, 30_000));
      const scpResult = await runCmd("scp", ["-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30", tarPath, `root@${serverIp}:/tmp/app-image.tar`], { cwd: workDir });
      if (scpResult.code === 0) {
        const loadResult = await runCmd("ssh", ["-o", "StrictHostKeyChecking=no", `root@${serverIp}`,
          `docker load -i /tmp/app-image.tar && rm /tmp/app-image.tar && docker stop ${repoName} 2>/dev/null; docker rm ${repoName} 2>/dev/null; docker run -d --name ${repoName} --restart=always -p 127.0.0.1:8080:8080 --add-host=host.docker.internal:host-gateway -e APP_ENV=production -e PORT=8080 ${actualImage}`
        ], { cwd: workDir });
        if (loadResult.code === 0) await appendLog(deploymentId, `[${ts()}] ✓ Docker image transferred and running on server`);
        else await appendLog(deploymentId, `[${ts()}] ⚠ Failed to load image on server`);
      } else await appendLog(deploymentId, `[${ts()}] ⚠ SCP failed`);
    }
  }

  // Save Pulumi state
  try {
    const stateResult = await runCmd("pulumi", ["stack", "export", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    if (stateResult.code === 0) await db.exec`UPDATE deployments SET tofu_script = ${event.tofuScript + "\n\n/* STATE */\n" + stateResult.output} WHERE id = ${deploymentId}`;
  } catch {}

  try { await ctx.rm(workDir, { recursive: true, force: true }); } catch {}

  const finalUrl = appUrl || generateAppUrl(provider, repoName, shortId, region, event.deployStrategy);
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
  await appendLog(deploymentId, `[${ts()}] ✓ Docker image: ${remoteImage}`);
  await appendLog(deploymentId, `[${ts()}] ✓ Infrastructure provisioned via Pulumi`);
  await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${finalUrl}`);
  await db.exec`UPDATE deployments SET status = 'success', app_url = ${finalUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
}
