import { db, type DeployEvent } from "../shared";
import { appendLog, ts } from "./helpers";
import type { TemplateConfig } from "../templates";
import { generatePulumiProgram, generatePulumiProject, generatePackageJson, generateTsConfig } from "../pulumi-templates/index";

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

  const { mkdtemp, writeFile, rm, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir, homedir } = await import("node:os");
  const { spawn } = await import("node:child_process");

  // Augmented PATH for Pulumi
  const pulumiHome = join(homedir(), ".pulumi", "bin");
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
  // Build the services array with the deploy strategy's mode
  const deployStrategy = (event.deployStrategy || "vps") as "vps" | "managed";
  const serviceMode = deployStrategy === "managed" ? "managed" : "vps";
  const services = template.services.map(s => ({ ...s, mode: serviceMode as "vps" | "managed" }));

  // If there's a pre-generated tofuScript from the wizard, use it; otherwise generate one
  let tofuScript = event.tofuScript;
  if (!tofuScript) {
    tofuScript = generatePulumiProgram({
      provider,
      region,
      appName,
      repo: event.repo,
      branch: event.branch,
      runtime: template.runtime,
      hasDocker: true,
      techStack: template.techStack,
      services,
      deployStrategy,
      useDocker: true,
      dockerImage: template.dockerImage,
      publicDockerImage: template.dockerImage,
      dockerEnvVars: template.envVars,
      templateSetupScript: template.vpsSetupScript,
    });
  }

  // ── Pulumi deploy ──
  await db.exec`UPDATE deployments SET status = 'deploying', updated_at = NOW() WHERE id = ${deploymentId}`;
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Pulumi Setup ───────────────────`);

  const workDir = await mkdtemp(join(tmpdir(), `deploy-tpl-${shortId}-`));
  const pulumiDir = join(workDir, "pulumi");
  await mkdir(pulumiDir, { recursive: true });

  await writeFile(join(pulumiDir, "index.ts"), tofuScript, "utf-8");
  await writeFile(join(pulumiDir, "Pulumi.yaml"), generatePulumiProject(appName, provider), "utf-8");
  await writeFile(join(pulumiDir, "package.json"), generatePackageJson(appName, provider), "utf-8");
  await writeFile(join(pulumiDir, "tsconfig.json"), generateTsConfig(), "utf-8");

  // Provider env vars
  const providerEnv: Record<string, string> = {};
  if (provider === "aws") {
    providerEnv.AWS_ACCESS_KEY_ID = ctx.providerRow.api_key || "";
    providerEnv.AWS_SECRET_ACCESS_KEY = ctx.providerRow.api_secret || "";
    providerEnv.AWS_DEFAULT_REGION = region;
  } else if (provider === "gcp") {
    const credPath = join(pulumiDir, "gcp-credentials.json");
    await writeFile(credPath, ctx.providerRow.api_key || "{}", "utf-8");
    providerEnv.GOOGLE_CREDENTIALS = ctx.providerRow.api_key || "";
    providerEnv.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  }

  const stateDir = join(pulumiDir, ".pulumi-state");
  await mkdir(stateDir, { recursive: true });
  const stateUrl = process.platform === "win32"
    ? `file://${stateDir.replace(/\\/g, "/")}`
    : `file://${stateDir}`;
  providerEnv.PULUMI_BACKEND_URL = stateUrl;
  providerEnv.PULUMI_CONFIG_PASSPHRASE = "";

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

    // Generate deploy key for image transfer
    const deployKeyPath = join(workDir, "deploy_key");
    await runCmd("ssh-keygen", ["-t", "ed25519", "-f", deployKeyPath, "-N", "", "-q"], { cwd: workDir });
    const { readFile: readFs } = await import("node:fs/promises");
    const deployPubKey = (await readFs(`${deployKeyPath}.pub`, "utf-8")).trim();
    const combinedKeys = `${sshKeyRow.public_key.trim()}\n${deployPubKey}`;
    await runCmd("pulumi", ["config", "set", "sshPublicKey", combinedKeys, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  }

  if (provider === "gcp") {
    try {
      const creds = JSON.parse(ctx.providerRow.api_key || "{}");
      if (creds.project_id) {
        await runCmd("pulumi", ["config", "set", "gcp:project", creds.project_id, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      }
    } catch {}

    // For Cloud Run (managed), push image to Artifact Registry
    if (deployStrategy === "managed") {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Push Image to Artifact Registry ─`);

      let arRegion = region;
      const regionMatch = tofuScript.match(/config\.get\("region"\)\s*\|\|\s*"([^"]+)"/);
      if (regionMatch) arRegion = regionMatch[1];

      const saKey = JSON.parse(ctx.providerRow.api_key || "{}");
      const gcpProjectId = saKey.project_id || "";

      // Get access token
      const { createSign } = await import("node:crypto");
      const now = Math.floor(Date.now() / 1000);
      const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const jwtClaim = Buffer.from(JSON.stringify({
        iss: saKey.client_email,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        iat: now, exp: now + 3600,
      })).toString("base64url");
      const signInput = `${jwtHeader}.${jwtClaim}`;
      const signer = createSign("RSA-SHA256");
      signer.update(signInput);
      const signature = signer.sign(saKey.private_key, "base64url");

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signInput}.${signature}`,
      });
      const tokenData = await tokenRes.json() as { access_token?: string };
      const accessToken = tokenData.access_token || "";
      if (!accessToken) throw new Error("Failed to get GCP access token");

      // Enable APIs
      for (const api of ["artifactregistry.googleapis.com", "run.googleapis.com"]) {
        try {
          await fetch(`https://serviceusage.googleapis.com/v1/projects/${gcpProjectId}/services/${api}:enable`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        } catch {}
      }
      await new Promise(r => setTimeout(r, 5000));

      const arHost = `${arRegion}-docker.pkg.dev`;
      const arRepo = appName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
      const arImageUri = `${arHost}/${gcpProjectId}/${arRepo}/${arRepo}:${shortId}`;

      // Create AR repo
      try {
        await fetch(`https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories?repositoryId=${arRepo}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ format: "DOCKER" }),
        });
        await new Promise(r => setTimeout(r, 5000));
      } catch {}

      // Docker login, tag, push
      await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password", accessToken, arHost], { cwd: workDir });
      const tagResult = await runCmd("docker", ["tag", localImage, arImageUri], { cwd: workDir });
      if (tagResult.code !== 0) throw new Error("Failed to tag image for Artifact Registry");
      const pushResult = await runCmd("docker", ["push", arImageUri], { cwd: workDir, env: providerEnv });
      if (pushResult.code !== 0) throw new Error("Failed to push image to Artifact Registry");
      await appendLog(deploymentId, `[${ts()}] ✓ Image pushed: ${arImageUri}`);

      await runCmd("pulumi", ["config", "set", "imageUri", arImageUri, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    }
  }

  if (provider !== "gcp") {
    await runCmd("pulumi", ["config", "set", "region", region, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
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

  // ── Template deploys: user-data pulls the public image on boot ──
  // No SCP transfer needed — the EC2/VPS startup script handles pulling
  // wordpress:latest and running it with the correct env vars.
  if (serverIp && deployStrategy === "vps") {
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ── Server Provisioning ─────────────`);
    await appendLog(deploymentId, `[${ts()}] ℹ The server is installing Docker, MySQL, and pulling ${template.dockerImage}`);
    await appendLog(deploymentId, `[${ts()}] ℹ This takes 2-4 minutes after the server boots`);
    await appendLog(deploymentId, `[${ts()}] ℹ Server IP: ${serverIp}`);
  }

  // ── Save Pulumi state ──
  try {
    // Use a dedicated capture to avoid line-splitting corruption of the JSON state
    const { spawn: spawnProc } = await import("node:child_process");
    const stateJson = await new Promise<string>((resolve) => {
      const proc = spawnProc("pulumi", ["stack", "export", "--non-interactive"], {
        cwd: pulumiDir,
        env: { ...process.env, PATH: augmentedPath, ...providerEnv },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      proc.stdout.on("data", (d: Buffer) => chunks.push(d));
      proc.stderr.on("data", () => {}); // discard stderr
      proc.on("close", (code) => {
        if (code === 0) resolve(Buffer.concat(chunks).toString("utf-8").trim());
        else resolve("");
      });
      proc.on("error", () => resolve(""));
    });
    if (stateJson) {
      const scriptWithState = `${tofuScript}\n/* STATE */\n${stateJson}`;
      await db.exec`UPDATE deployments SET tofu_script = ${scriptWithState} WHERE id = ${deploymentId}`;
    }
  } catch {}

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
