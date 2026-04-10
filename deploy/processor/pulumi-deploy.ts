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
  const isStaticDeploy = event.deployStrategy === "static";

  // Check for cached image
  const cachedImage = !isStaticDeploy ? await db.queryRow<{ docker_image: string }>`
    SELECT docker_image FROM deployments
    WHERE repo = ${event.repo} AND branch = ${event.branch} AND commit_hash = ${commitHash}
      AND docker_image != '' AND id != ${deploymentId}
    ORDER BY created_at DESC LIMIT 1` : null;

  let actualImage = imageName;
  let skipBuild = isStaticDeploy;
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
      const buildArgs = ["build", "--platform", "linux/amd64", "-t", imageName];
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

  if (!isStaticDeploy) {
    await db.exec`UPDATE deployments SET docker_image = ${actualImage} WHERE id = ${deploymentId}`;
  }

  let remoteImage = actualImage;
  if (event.registryUrl && !isStaticDeploy) {
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
  else if (provider === "gcp") {
    const credPath = join(pulumiDir, "gcp-credentials.json");
    await ctx.writeFile(credPath, ctx.providerRow.api_key || "{}", "utf-8");
    providerEnv.GOOGLE_CREDENTIALS = ctx.providerRow.api_key || "";
    providerEnv.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  }
  const stateDir = join(pulumiDir, ".pulumi-state");
  await mkdir(stateDir, { recursive: true });
  // Pulumi on Windows needs file://C:/... (two slashes, forward slashes) — NOT file:///C:/
  const stateUrl = process.platform === "win32"
    ? `file://${stateDir.replace(/\\/g, "/")}`
    : `file://${stateDir}`;
  providerEnv.PULUMI_BACKEND_URL = stateUrl;
  providerEnv.PULUMI_CONFIG_PASSPHRASE = "";

  await appendLog(deploymentId, `[${ts()}] ℹ Installing Pulumi dependencies...`);
  const installResult = await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });
  if (installResult.code !== 0) {
    const errLines = installResult.output.split("\n").filter(l => l.trim()).slice(-10);
    for (const line of errLines) await appendLog(deploymentId, `[${ts()}] ✗ npm: ${line}`);
    throw new Error(`npm install failed (exit code ${installResult.code})`);
  }
  await appendLog(deploymentId, `[${ts()}] ✓ Dependencies installed`);

  const stackName = `${repoName}-${shortId}`;
  const initResult = await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  if (initResult.code !== 0) await appendLog(deploymentId, `[${ts()}] ⚠ Stack init: ${initResult.output.split("\n").filter(l => l.trim()).slice(-3).join(" | ")}`);

  // Generate a temporary deploy SSH key (no passphrase) for image transfer
  const deployKeyPath = join(workDir, "deploy_key");
  const deployPubKeyPath = `${deployKeyPath}.pub`;
  await runCmd("ssh-keygen", ["-t", "ed25519", "-f", deployKeyPath, "-N", "", "-q"], { cwd: workDir });
  const { readFile: readFs2 } = await import("node:fs/promises");
  const deployPubKey = (await readFs2(deployPubKeyPath, "utf-8")).trim();

  if (provider === "hetzner" || provider === "vultr" || provider === "linode" || (provider === "gcp" && event.deployStrategy !== "managed" && event.deployStrategy !== "static")) {
    const sshKeyRow = await db.queryRow<{ public_key: string }>`SELECT public_key FROM ssh_keys WHERE app_id = ${event.appId} ORDER BY created_at DESC LIMIT 1`;
    if (!sshKeyRow) throw new Error("No SSH key found. Go to Settings → SSH Keys and add your public key before deploying to a VPS.");
    // Combine user key + deploy key so both can access the server
    const combinedKeys = `${sshKeyRow.public_key.trim()}\n${deployPubKey}`;
    await runCmd("pulumi", ["config", "set", "sshPublicKey", combinedKeys, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  }
  if (provider === "linode") await runCmd("pulumi", ["config", "set", "--secret", "rootPassword", `Ch4ng3M3-${shortId}!`, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  if (provider === "gcp") {
    let gcpProjectId = "";
    try {
      const creds = JSON.parse(ctx.providerRow.api_key || "{}");
      gcpProjectId = creds.project_id || "";
      if (gcpProjectId) await runCmd("pulumi", ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    } catch {}
    // For Cloud Storage + CDN (static), enable Compute API and skip Docker entirely
    if (event.deployStrategy === "static" && gcpProjectId) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── GCP Static Site Setup ──────────`);

      const { createSign } = await import("node:crypto");
      const saKey = JSON.parse(ctx.providerRow.api_key || "{}");
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
      const jwt = `${signInput}.${signature}`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      });
      const tokenData = await tokenRes.json() as { access_token?: string };
      const gcpAccessToken = tokenData.access_token || "";

      // Enable Compute Engine API (needed for CDN/LB resources)
      if (gcpAccessToken) {
        try {
          await fetch(`https://serviceusage.googleapis.com/v1/projects/${gcpProjectId}/services/compute.googleapis.com:enable`, {
            method: "POST",
            headers: { Authorization: `Bearer ${gcpAccessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          await appendLog(deploymentId, `[${ts()}] ✓ Compute Engine API enabled`);
        } catch (e: any) {
          await appendLog(deploymentId, `[${ts()}] ℹ Compute API enable: ${e.message} (continuing)`);
        }
      }
      await appendLog(deploymentId, `[${ts()}] ℹ Static site — skipping Docker build`);
    }
    // For Cloud Run (managed), enable Artifact Registry API, create repo, push image, and set imageUri
    if (event.deployStrategy === "managed" && gcpProjectId) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Push Image to Artifact Registry ─`);

      // Extract the actual region from the Pulumi script (wizard-selected, may differ from provider default)
      let arRegion = region;
      const regionMatch = event.tofuScript.match(/config\.get\("region"\)\s*\|\|\s*"([^"]+)"/);
      if (regionMatch) arRegion = regionMatch[1];

      // Get access token from service account key using JWT
      const { createSign } = await import("node:crypto");
      const saKey = JSON.parse(ctx.providerRow.api_key || "{}");
      const now = Math.floor(Date.now() / 1000);
      const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const jwtClaim = Buffer.from(JSON.stringify({
        iss: saKey.client_email,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })).toString("base64url");
      const signInput = `${jwtHeader}.${jwtClaim}`;
      const signer = createSign("RSA-SHA256");
      signer.update(signInput);
      const signature = signer.sign(saKey.private_key, "base64url");
      const jwt = `${signInput}.${signature}`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      });
      const tokenData = await tokenRes.json() as { access_token?: string };
      const accessToken = tokenData.access_token || "";
      if (!accessToken) throw new Error("Failed to get GCP access token from service account key");

      // Enable Artifact Registry API (idempotent)
      await appendLog(deploymentId, `[${ts()}] ℹ Enabling Artifact Registry API...`);
      try {
        const enableRes = await fetch(`https://serviceusage.googleapis.com/v1/projects/${gcpProjectId}/services/artifactregistry.googleapis.com:enable`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (enableRes.ok) {
          await new Promise(r => setTimeout(r, 10_000));
          await appendLog(deploymentId, `[${ts()}] ✓ Artifact Registry API enabled`);
        } else {
          await appendLog(deploymentId, `[${ts()}] ℹ API enable: ${enableRes.status} (may already be enabled)`);
        }
      } catch (e: any) {
        await appendLog(deploymentId, `[${ts()}] ℹ API enable: ${e.message} (continuing)`);
      }

      // Also enable Cloud Run API
      try {
        await fetch(`https://serviceusage.googleapis.com/v1/projects/${gcpProjectId}/services/run.googleapis.com:enable`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch {}

      const arHost = `${arRegion}-docker.pkg.dev`;
      const arRepo = repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
      const arImageUri = `${arHost}/${gcpProjectId}/${arRepo}/${arRepo}:${shortId}`;

      // Create Artifact Registry repository (idempotent — 409 means already exists)
      try {
        const createRepoRes = await fetch(`https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories?repositoryId=${arRepo}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ format: "DOCKER" }),
        });
        if (createRepoRes.ok) {
          // Creation is async — poll until the repo is accessible
          await appendLog(deploymentId, `[${ts()}] ℹ Waiting for repository to be ready...`);
          for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 5_000));
            const checkRes = await fetch(`https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories/${arRepo}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (checkRes.ok) break;
          }
          await appendLog(deploymentId, `[${ts()}] ✓ Artifact Registry repository created`);
        } else if (createRepoRes.status === 409) {
          await appendLog(deploymentId, `[${ts()}] ✓ Artifact Registry repository already exists`);
        } else {
          const body = await createRepoRes.text();
          await appendLog(deploymentId, `[${ts()}] ⚠ Create repo: ${createRepoRes.status} ${body.slice(0, 200)}`);
        }
      } catch (e: any) {
        await appendLog(deploymentId, `[${ts()}] ⚠ Create repo: ${e.message}`);
      }

      // Authenticate Docker to Artifact Registry using access token
      const loginResult = await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password", accessToken, arHost], { cwd: workDir });
      if (loginResult.code !== 0) {
        await appendLog(deploymentId, `[${ts()}] ⚠ Docker login failed, retrying...`);
        // Retry once
        await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password", accessToken, arHost], { cwd: workDir });
      }

      // Tag and push
      const tagResult = await runCmd("docker", ["tag", actualImage, arImageUri], { cwd: workDir });
      if (tagResult.code !== 0) throw new Error(`Failed to tag image for Artifact Registry`);
      const pushResult = await runCmd("docker", ["push", arImageUri], { cwd: workDir, env: providerEnv });
      if (pushResult.code !== 0) throw new Error(`Failed to push image to Artifact Registry`);
      await appendLog(deploymentId, `[${ts()}] ✓ Image pushed: ${arImageUri}`);

      await runCmd("pulumi", ["config", "set", "imageUri", arImageUri, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    }
    // Don't set gcp:region here — the Pulumi template already has the wizard-selected region as default
  }
  // For non-GCP providers, set region from provider config (GCP uses the region baked into the Pulumi script)
  if (provider !== "gcp") {
    await runCmd("pulumi", ["config", "set", "region", region, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  }

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
          // Rewrite the old stack name in the state to match the current stack
          // Pulumi state embeds URNs like "urn:pulumi:<oldStack>::<project>::..." — update them to the new stack
          const oldStackMatch = savedState.match(/"urn:pulumi:([^:]+)::/);
          const updatedState = oldStackMatch
            ? savedState.replaceAll(`urn:pulumi:${oldStackMatch[1]}::`, `urn:pulumi:${stackName}::`)
            : savedState;
          const stateFile = join(pulumiDir, "prev-state.json");
          await ctx.writeFile(stateFile, updatedState, "utf-8");
          const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
          if (importResult.code === 0) await appendLog(deploymentId, `[${ts()}] ℹ Restored state from previous deployment`);
          else await appendLog(deploymentId, `[${ts()}] ⚠ State import failed, deploying fresh`);
        }
      } catch {}
    }
  }

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Pulumi Up ──────────────────────`);
  const upResult = await runCmd("pulumi", ["up", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
  if (upResult.code !== 0) {
    const errorLines = upResult.output.split("\n").filter(l => l.trim()).slice(-20);
    for (const line of errorLines) await appendLog(deploymentId, `[${ts()}] ✗ ${line}`);
    throw new Error(`pulumi up failed (exit code ${upResult.code})`);
  }

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Extracting outputs ──────────────`);

  let appUrl = "";
  let serverIp = "";
  try {
    if (isStaticDeploy) {
      // Static deploys have cdnIp instead of serverIp
      const cdnResult = await runCmd("pulumi", ["stack", "output", "cdnIp", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      const cdnIp = cdnResult.output.trim().split("\n").pop()?.trim() || "";
      const urlResult = await runCmd("pulumi", ["stack", "output", "appUrl", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      appUrl = urlResult.output.trim().split("\n").pop()?.trim() || "";
      if (!appUrl && cdnIp) appUrl = `http://${cdnIp}`;
      if (appUrl && !appUrl.startsWith("http")) appUrl = `http://${appUrl}`;
      await appendLog(deploymentId, `[${ts()}]   cdnIp = ${cdnIp || "(not found)"}`);
      await appendLog(deploymentId, `[${ts()}]   appUrl = ${appUrl || "(not found)"}`);
    } else {
      const ipResult = await runCmd("pulumi", ["stack", "output", "serverIp", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      serverIp = ipResult.output.trim().split("\n").pop()?.trim() || "";
      const urlResult = await runCmd("pulumi", ["stack", "output", "appUrl", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      appUrl = urlResult.output.trim().split("\n").pop()?.trim() || "";
      if (!appUrl && serverIp) appUrl = `http://${serverIp}`;
      if (appUrl && !appUrl.startsWith("http")) appUrl = `http://${appUrl}`;
      await appendLog(deploymentId, `[${ts()}]   serverIp = ${serverIp || "(not found)"}`);
      await appendLog(deploymentId, `[${ts()}]   appUrl = ${appUrl || "(not found)"}`);
    }
  } catch (e: any) { await appendLog(deploymentId, `[${ts()}]   (could not parse outputs: ${e.message})`); }

  // Transfer Docker image to server (VPS providers with a server IP)
  if (serverIp && !event.registryUrl && !isStaticDeploy) {
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ── Transfer Docker Image ──────────`);
    const tarPath = join(workDir, `${actualImage.replace(":", "-")}.tar`);
    const saveResult = await runCmd("docker", ["save", "-o", tarPath, actualImage], { cwd: workDir });
    if (saveResult.code === 0) {
      await appendLog(deploymentId, `[${ts()}] ℹ Waiting for server SSH to be ready...`);
      await new Promise(r => setTimeout(r, 30_000));
      const scpResult = await runCmd("scp", ["-i", deployKeyPath, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=30", tarPath, `root@${serverIp}:/tmp/app-image.tar`], { cwd: workDir });
      if (scpResult.code === 0) {
        // Wait for Docker to be installed by the startup script
        await appendLog(deploymentId, `[${ts()}] ℹ Waiting for Docker to be ready on server...`);
        for (let i = 0; i < 30; i++) {
          const check = await runCmd("ssh", ["-i", deployKeyPath, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=10", `root@${serverIp}`, "docker info >/dev/null 2>&1 && echo READY"], { cwd: workDir });
          if (check.output.includes("READY")) break;
          await new Promise(r => setTimeout(r, 10_000));
        }
        const loadResult = await runCmd("ssh", ["-i", deployKeyPath, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", `root@${serverIp}`,
          `docker load -i /tmp/app-image.tar && rm /tmp/app-image.tar && ` +
          `APP_PORT=$(grep proxy_pass /etc/nginx/sites-available/* 2>/dev/null | head -1 | sed 's/.*://;s/;.*//') && ` +
          `APP_PORT=\${APP_PORT:-3000} && ` +
          `docker stop ${repoName} 2>/dev/null; docker rm ${repoName} 2>/dev/null; ` +
          `docker run -d --name ${repoName} --restart=always -p 127.0.0.1:\${APP_PORT}:\${APP_PORT} --add-host=host.docker.internal:host-gateway -e APP_ENV=production -e PORT=\${APP_PORT} ${actualImage}`
        ], { cwd: workDir });
        if (loadResult.code === 0) await appendLog(deploymentId, `[${ts()}] ✓ Docker image transferred and running on server`);
        else await appendLog(deploymentId, `[${ts()}] ⚠ Failed to load image on server`);
      } else await appendLog(deploymentId, `[${ts()}] ⚠ SCP failed`);
    }
  }

  // Upload static files to GCS bucket (for Cloud Storage + CDN deploys)
  if (isStaticDeploy && provider === "gcp") {
    await appendLog(deploymentId, `[${ts()}]`);
    await appendLog(deploymentId, `[${ts()}] ── Upload Static Files to GCS ─────`);
    try {
      // Get the bucket name from Pulumi outputs
      const bucketResult = await runCmd("pulumi", ["stack", "output", "bucketName", "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
      const gcsBucket = bucketResult.output.trim().split("\n").pop()?.trim() || "";
      if (gcsBucket) {
        // Get access token for GCS upload
        const saKey = JSON.parse(ctx.providerRow.api_key || "{}");
        const { createSign: createSignUpload } = await import("node:crypto");
        const nowUpload = Math.floor(Date.now() / 1000);
        const jwtHeaderUpload = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
        const jwtClaimUpload = Buffer.from(JSON.stringify({
          iss: saKey.client_email,
          scope: "https://www.googleapis.com/auth/devstorage.read_write",
          aud: "https://oauth2.googleapis.com/token",
          iat: nowUpload, exp: nowUpload + 3600,
        })).toString("base64url");
        const signInputUpload = `${jwtHeaderUpload}.${jwtClaimUpload}`;
        const signerUpload = createSignUpload("RSA-SHA256");
        signerUpload.update(signInputUpload);
        const signatureUpload = signerUpload.sign(saKey.private_key, "base64url");
        const tokenResUpload = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signInputUpload}.${signatureUpload}`,
        });
        const tokenDataUpload = await tokenResUpload.json() as { access_token?: string };
        const uploadToken = tokenDataUpload.access_token || "";

        if (uploadToken) {
          // Build the static site using npm directly (cross-platform)
          await appendLog(deploymentId, `[${ts()}] ℹ Installing dependencies...`);
          const installResult = await runCmd("npm", ["ci"], { cwd: repoDir });
          if (installResult.code !== 0) {
            await appendLog(deploymentId, `[${ts()}] ⚠ npm ci failed, trying npm install...`);
            await runCmd("npm", ["install"], { cwd: repoDir });
          }

          await appendLog(deploymentId, `[${ts()}] ℹ Building static site...`);
          const isNuxt = event.techStack.some(t => t.toLowerCase().includes("nuxt"));
          const isNext = event.techStack.some(t => t.toLowerCase().includes("next"));
          let buildOk = false;

          // Set environment to force static output
          const staticEnv: Record<string, string> = {};
          if (isNuxt) staticEnv.NITRO_PRESET = "static";

          if (isNuxt) {
            // Try nuxt generate first (produces fully prerendered static site)
            const genResult = await runCmd("npx", ["nuxt", "generate"], { cwd: repoDir, env: staticEnv });
            if (genResult.code === 0) {
              buildOk = true;
              await appendLog(deploymentId, `[${ts()}] ✓ Nuxt static site generated`);
            } else {
              await appendLog(deploymentId, `[${ts()}] ℹ nuxt generate failed (likely API deps), building as SPA...`);
              // Build with static preset — even if prerender fails, we get the client bundle
              const buildResult = await runCmd("npm", ["run", "build"], { cwd: repoDir, env: staticEnv });
              if (buildResult.code === 0) {
                buildOk = true;
                await appendLog(deploymentId, `[${ts()}] ✓ Nuxt built with static preset`);
              }
            }
          }

          if (!buildOk) {
            const buildResult = await runCmd("npm", ["run", "build"], { cwd: repoDir, env: staticEnv });
            if (buildResult.code === 0) {
              buildOk = true;
              await appendLog(deploymentId, `[${ts()}] ✓ Static site built`);
            } else {
              const genResult2 = await runCmd("npm", ["run", "generate", "--if-present"], { cwd: repoDir, env: staticEnv });
              if (genResult2.code === 0) {
                buildOk = true;
                await appendLog(deploymentId, `[${ts()}] ✓ Static site generated`);
              } else {
                await appendLog(deploymentId, `[${ts()}] ⚠ Build failed — uploading source files as fallback`);
              }
            }
          }

          // Determine build output directory (check most specific first)
          const { existsSync, writeFileSync: writeFs } = await import("node:fs");
          const possibleDirs = [".output/public", "dist", "build", "out", ".next/out", "output", "public"];
          let uploadDir = repoDir;
          for (const dir of possibleDirs) {
            if (existsSync(join(repoDir, dir))) { uploadDir = join(repoDir, dir); break; }
          }

          // If no index.html in the upload dir, try to find one elsewhere
          if (!existsSync(join(uploadDir, "index.html"))) {
            for (const dir of possibleDirs) {
              const candidate = join(repoDir, dir);
              if (existsSync(join(candidate, "index.html"))) { uploadDir = candidate; break; }
            }
          }

          // If still no index.html, generate a SPA fallback that loads the client bundle
          if (!existsSync(join(uploadDir, "index.html"))) {
            await appendLog(deploymentId, `[${ts()}] ℹ No index.html found — generating SPA fallback`);
            // Check for 200.html (Nuxt SPA fallback) and use it as index.html
            if (existsSync(join(uploadDir, "200.html"))) {
              const { copyFileSync } = await import("node:fs");
              copyFileSync(join(uploadDir, "200.html"), join(uploadDir, "index.html"));
              await appendLog(deploymentId, `[${ts()}] ✓ Using 200.html as index.html`);
            } else {
              // Look for the client manifest to build a minimal SPA shell
              const clientDir = join(repoDir, ".nuxt/dist/client");
              const outputPublicDir = join(repoDir, ".output/public");
              // If .output/public exists with _nuxt assets but no index.html, create one
              if (existsSync(join(outputPublicDir, "_nuxt")) || existsSync(join(clientDir, "_nuxt"))) {
                const assetDir = existsSync(join(outputPublicDir, "_nuxt")) ? outputPublicDir : clientDir;
                // Find the entry JS file from the manifest
                let entryScript = "";
                const manifestPath = join(assetDir, "manifest.json");
                if (existsSync(manifestPath)) {
                  try {
                    const { readFileSync: readManifest } = await import("node:fs");
                    const manifest = JSON.parse(readManifest(manifestPath, "utf-8"));
                    // Find the entry point (usually the largest JS file or one with isEntry)
                    for (const [, value] of Object.entries(manifest) as [string, any][]) {
                      if (value.isEntry && value.file) { entryScript = `/_nuxt/${value.file}`; break; }
                    }
                    if (!entryScript) {
                      // Fallback: find any JS entry
                      for (const [, value] of Object.entries(manifest) as [string, any][]) {
                        if (value.file?.endsWith(".js")) { entryScript = `/_nuxt/${value.file}`; break; }
                      }
                    }
                  } catch {}
                }
                const spaHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loading...</title>
  ${entryScript ? `<script type="module" src="${entryScript}"></script>` : ""}
</head>
<body>
  <div id="__nuxt"></div>
</body>
</html>`;
                writeFs(join(uploadDir, "index.html"), spaHtml, "utf-8");
                await appendLog(deploymentId, `[${ts()}] ✓ Generated SPA fallback index.html`);
              } else {
                // Generic fallback
                writeFs(join(uploadDir, "index.html"), `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Site</title></head><body><p>Deployment complete. Static files uploaded.</p></body></html>`, "utf-8");
                await appendLog(deploymentId, `[${ts()}] ⚠ Generated placeholder index.html`);
              }
            }
          }

          await appendLog(deploymentId, `[${ts()}] ℹ Uploading from: ${uploadDir.replace(repoDir, ".")}`);

          // Upload files recursively using GCS JSON API
          const { readdirSync, statSync, readFileSync } = await import("node:fs");
          const mimeTypes: Record<string, string> = {
            ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
            ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
            ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
            ".ttf": "font/ttf", ".txt": "text/plain", ".xml": "application/xml",
            ".webp": "image/webp", ".map": "application/json",
          };
          const { extname } = await import("node:path");

          const uploadFile = async (filePath: string, objectName: string) => {
            const content = readFileSync(filePath);
            const ext = extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || "application/octet-stream";
            await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${gcsBucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${uploadToken}`, "Content-Type": contentType },
              body: content,
            });
          };

          const uploadDir2 = async (dir: string, prefix: string) => {
            const entries = readdirSync(dir);
            for (const entry of entries) {
              // Skip non-deployable directories
              if (["node_modules", ".git", ".nuxt", ".output", ".next", ".cache", "__pycache__"].includes(entry)) continue;
              const fullPath = join(dir, entry);
              const objectName = prefix ? `${prefix}/${entry}` : entry;
              if (statSync(fullPath).isDirectory()) {
                await uploadDir2(fullPath, objectName);
              } else {
                await uploadFile(fullPath, objectName);
              }
            }
          };

          await uploadDir2(uploadDir, "");
          await appendLog(deploymentId, `[${ts()}] ✓ Static files uploaded to gs://${gcsBucket}`);
        } else {
          await appendLog(deploymentId, `[${ts()}] ⚠ Could not get upload token — files not uploaded`);
        }
      } else {
        await appendLog(deploymentId, `[${ts()}] ⚠ Could not determine bucket name from Pulumi outputs`);
      }
    } catch (e: any) {
      await appendLog(deploymentId, `[${ts()}] ⚠ Static file upload error: ${e.message}`);
    }
  }

  // Save Pulumi state
  try {
    const { execSync: execSyncState } = await import("node:child_process");
    const stateOutput = execSyncState("pulumi stack export --non-interactive", {
      cwd: pulumiDir,
      env: { ...process.env, ...providerEnv },
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
    if (stateOutput.includes('"deployment"')) {
      await db.exec`UPDATE deployments SET tofu_script = ${(event.tofuScript + "\n\n/* STATE */\n" + stateOutput).replace(/\0/g, "")} WHERE id = ${deploymentId}`;
    }
  } catch {}

  try { await ctx.rm(workDir, { recursive: true, force: true }); } catch {}

  const finalUrl = appUrl || generateAppUrl(provider, repoName, shortId, region, event.deployStrategy);
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
  await appendLog(deploymentId, `[${ts()}] ✓ ${isStaticDeploy ? "Static site deployed" : `Docker image: ${remoteImage}`}`);
  await appendLog(deploymentId, `[${ts()}] ✓ Infrastructure provisioned via Pulumi`);
  await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${finalUrl}`);
  await db.exec`UPDATE deployments SET status = 'success', app_url = ${finalUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
}
