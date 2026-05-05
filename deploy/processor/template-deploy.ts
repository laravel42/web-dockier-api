import { db, type DeployEvent, extractRegionFromScript } from "../shared";
import { appendLog, ts } from "./helpers";
import type { TemplateConfig } from "../templates";
import { generatePulumiProgram } from "../pulumi-templates/index";
import { createStreamingRunCmd } from "./run-cmd";
import { setupPulumiWorkspace, restorePulumiState, savePulumiState } from "./pulumi-workspace";
import { getGcpAccessToken, getGcpProjectId, enableGcpApis, ensureArtifactRegistryRepo, pushToArtifactRegistry } from "./gcp-helpers";

/**
 * Deploy a template-based project.
 * Skips repo clone and analysis — uses the official Docker image directly.
 * Works with both VPS (EC2, Compute Engine) and managed (ECS, Cloud Run) strategies.
 */
export async function handleTemplateDeploy(
  event: DeployEvent,
  template: TemplateConfig,
  ctx: {
    deploymentId: string;
    repoName: string;
    shortId: string;
    provider: string;
    region: string;
    providerRow: { provider: string; region: string; api_key: string; api_secret: string };
  }
) {
  const { deploymentId, shortId, provider, region } = ctx;
  const appName = ctx.repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || template.id;

  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);

  await db.exec`UPDATE deployments SET status = 'building', updated_at = NOW() WHERE id = ${deploymentId}`;
  await appendLog(deploymentId, `[${ts()}] ▶ Starting template deployment...`);
  await appendLog(deploymentId, `[${ts()}] ℹ Template: ${template.name}`);
  await appendLog(deploymentId, `[${ts()}] ℹ Docker image: ${template.dockerImage}`);
  await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${provider} | Region: ${region}`);
  await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${event.deployStrategy || "managed"}`);

  // ── Pull the official Docker image ──
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Pull Docker Image ──────────────`);

  const pullResult = await runCmd("docker", ["pull", "--platform", "linux/amd64", template.dockerImage]);
  if (pullResult.code !== 0) {
    throw new Error(`Failed to pull Docker image: ${template.dockerImage}`);
  }
  await appendLog(deploymentId, `[${ts()}] ✓ Image pulled: ${template.dockerImage}`);

  // Tag with our naming convention
  const localImage = `${appName}:${shortId}`;
  await runCmd("docker", ["tag", template.dockerImage, localImage]);
  await db.exec`UPDATE deployments SET docker_image = ${localImage} WHERE id = ${deploymentId}`;

  // ── Generate Pulumi program ──
  const deployStrategy = (event.deployStrategy || "vps") as "vps" | "managed";
  const serviceMode = deployStrategy === "managed" ? "managed" : "vps";
  const services = template.services.map(s => ({ ...s, mode: serviceMode as "vps" | "managed" }));

  let tofuScript = event.tofuScript;
  if (!tofuScript) {
    tofuScript = generatePulumiProgram({
      provider, region, appName,
      repo: event.repo, branch: event.branch,
      runtime: template.runtime, hasDocker: true, techStack: template.techStack,
      services, deployStrategy, useDocker: true,
      dockerImage: template.dockerImage, publicDockerImage: template.dockerImage,
      dockerEnvVars: template.envVars, templateSetupScript: template.vpsSetupScript,
    });
  }

  // ── Pulumi deploy ──
  await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Pulumi Setup ───────────────────`);

  const workDir = await mkdtemp(join(tmpdir(), `deploy-tpl-${shortId}-`));
  const { pulumiDir, providerEnv } = await setupPulumiWorkspace({
    workDir, appName, provider, region, providerRow: ctx.providerRow, indexTs: tofuScript,
  });

  await appendLog(deploymentId, `[${ts()}] ℹ Installing Pulumi dependencies...`);
  const installResult = await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });
  if (installResult.code !== 0) {
    throw new Error(`npm install failed (exit code ${installResult.code})`);
  }
  await appendLog(deploymentId, `[${ts()}] ✓ Dependencies installed`);

  const stackName = `${appName}-${shortId}`;
  await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

  // Set unique suffix for resource names to avoid collisions across deployments
  await runCmd("pulumi", ["config", "set", "keyPairSuffix", shortId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

  // Set SSH key for VPS providers
  if (deployStrategy === "vps" && (provider === "aws" || provider === "gcp")) {
    const sshKeyRow = await db.queryRow<{ public_key: string }>`SELECT public_key FROM ssh_keys WHERE app_id = ${event.appId} ORDER BY created_at DESC LIMIT 1`;
    if (!sshKeyRow) throw new Error("No SSH key found. Go to Settings → SSH Keys and add your public key before deploying to a VPS.");

    const deployKeyPath = join(workDir, "deploy_key");
    await runCmd("ssh-keygen", ["-t", "ed25519", "-f", deployKeyPath, "-N", "", "-q"], { cwd: workDir });
    const { readFile: readFs } = await import("node:fs/promises");
    const deployPubKey = (await readFs(`${deployKeyPath}.pub`, "utf-8")).trim();
    const combinedKeys = `${sshKeyRow.public_key.trim()}\n${deployPubKey}`;
    await runCmd("pulumi", ["config", "set", "sshPublicKey", combinedKeys, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  }

  if (provider === "gcp") {
    const gcpProjectId = getGcpProjectId(ctx.providerRow.api_key);
    if (gcpProjectId) {
      await runCmd("pulumi", ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    }

    // For Cloud Run (managed), push image to Artifact Registry
    if (deployStrategy === "managed" && gcpProjectId) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Push Image to Artifact Registry ─`);

      const arRegion = extractRegionFromScript(tofuScript) || region;
      const accessToken = await getGcpAccessToken(ctx.providerRow.api_key);
      if (!accessToken) throw new Error("Failed to get GCP access token");

      // Enable APIs
      await enableGcpApis(gcpProjectId, accessToken, ["artifactregistry.googleapis.com", "run.googleapis.com"]);
      await new Promise(r => setTimeout(r, 5000));

      const arHost = `${arRegion}-docker.pkg.dev`;
      const arRepo = appName.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
      const arImageUri = `${arHost}/${gcpProjectId}/${arRepo}/${arRepo}:${shortId}`;

      // Create AR repo
      await ensureArtifactRegistryRepo(gcpProjectId, arRegion, arRepo, accessToken);

      // Push image
      await pushToArtifactRegistry({
        localImage, arImageUri, arHost, accessToken, workDir, runCmd, env: providerEnv,
      });
      await appendLog(deploymentId, `[${ts()}] ✓ Image pushed: ${arImageUri}`);

      await runCmd("pulumi", ["config", "set", "imageUri", arImageUri, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    }
  }

  await runCmd("pulumi", ["config", "set", "region", region, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

  // ── Restore state from previous deployment ──
  // Query the project_id from the current deployment to scope state restore
  const currentDeploy = await db.queryRow<{ project_id: string }>`
    SELECT project_id FROM deployments WHERE id = ${deploymentId}`;
  const projectId = currentDeploy?.project_id || event.projectId || "";

  const prevDeploy = await db.queryRow<{ tofu_script: string }>`
    SELECT tofu_script FROM deployments WHERE provider_id = ${event.providerId}
      AND project_id = ${projectId} AND deploy_strategy = ${deployStrategy}
      AND tofu_script LIKE '%/* STATE */%' AND id != ${deploymentId}
      AND status = 'success'
      ORDER BY created_at DESC LIMIT 1`;
  if (prevDeploy?.tofu_script) {
    const { restored } = await restorePulumiState({
      prevTofuScript: prevDeploy.tofu_script, stackName, pulumiDir, providerEnv, runCmd, force: true,
    });
    if (restored) await appendLog(deploymentId, `[${ts()}] ℹ Restored state from previous deployment — will update in-place`);
    else await appendLog(deploymentId, `[${ts()}] ⚠ State import failed, deploying fresh`);
  }

  // ── Pulumi up ──
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Pulumi Up ──────────────────────`);
  const upResult = await runCmd("pulumi", ["up", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
  if (upResult.code !== 0) {
    const errorLines = upResult.output.split("\n").filter(l => l.trim()).slice(-20);
    for (const line of errorLines) await appendLog(deploymentId, `[${ts()}] ✗ ${line}`);
    throw new Error(`pulumi up failed (exit code ${upResult.code})`);
  }

  // ── Extract outputs ──
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Extracting outputs ──────────────`);

  let appUrl = "";
  let serverIp = "";
  try {
    const ipResult = await runCmd("pulumi", ["stack", "output", "serverIp", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    serverIp = ipResult.output.trim().split("\n").pop()?.trim() || "";
    const urlResult = await runCmd("pulumi", ["stack", "output", "appUrl", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    appUrl = urlResult.output.trim().split("\n").pop()?.trim() || "";
    if (!appUrl && serverIp) appUrl = `http://${serverIp}`;
    if (appUrl && !appUrl.startsWith("http")) appUrl = `http://${appUrl}`;
    await appendLog(deploymentId, `[${ts()}]   serverIp = ${serverIp || "(not found)"}`);
    await appendLog(deploymentId, `[${ts()}]   appUrl = ${appUrl || "(not found)"}`);
  } catch (e: any) {
    await appendLog(deploymentId, `[${ts()}]   (could not parse outputs: ${e.message})`);
  }

  // Template deploys: user-data pulls the public image on boot
  if (serverIp && deployStrategy === "vps") {
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ── Server Provisioning ─────────────`);
    await appendLog(deploymentId, `[${ts()}] ℹ The server is installing Docker, MySQL, and pulling ${template.dockerImage}`);
    await appendLog(deploymentId, `[${ts()}] ℹ This takes 2-4 minutes after the server boots`);
    await appendLog(deploymentId, `[${ts()}] ℹ Server IP: ${serverIp}`);
  }

  // ── Save Pulumi state ──
  await savePulumiState({ deploymentId, tofuScript, pulumiDir, providerEnv, runCmd, db });

  // ── Complete ──
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
  await appendLog(deploymentId, `[${ts()}] ✓ Template: ${template.name}`);
  await appendLog(deploymentId, `[${ts()}] ✓ Docker image: ${template.dockerImage}`);
  if (appUrl) {
    await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${appUrl}`);
    await db.exec`UPDATE deployments SET status = 'success', app_url = ${appUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
  } else {
    await appendLog(deploymentId, `[${ts()}] ⚠ Could not determine app URL — check cloud console`);
    await db.exec`UPDATE deployments SET status = 'success', updated_at = NOW() WHERE id = ${deploymentId}`;
  }

  // Cleanup
  try { await rm(workDir, { recursive: true, force: true }); } catch {}
}
