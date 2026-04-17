import { db, type DeployEvent, extractRegionFromScript } from "../shared";
import { appendLog, ts, generateAppUrl } from "./helpers";
import { getGcpAccessToken, getGcpProjectId, enableGcpApis, ensureArtifactRegistryRepo, pushToArtifactRegistry } from "./gcp-helpers";
import { setupPulumiWorkspace, restorePulumiState, savePulumiState } from "./pulumi-workspace";
import type { RunCmdFn } from "./run-cmd";

type RunCmd = RunCmdFn;

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

  if (!event.tofuScript) throw new Error("No Pulumi program provided. Generate infrastructure code first, then deploy.");
  const { join } = await import("node:path");

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

  const { pulumiDir, providerEnv } = await setupPulumiWorkspace({
    workDir, appName: repoName, provider, region, providerRow: ctx.providerRow, indexTs: event.tofuScript,
  });

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

  if ((provider === "gcp" && event.deployStrategy !== "managed" && event.deployStrategy !== "static")) {
    const sshKeyRow = await db.queryRow<{ public_key: string }>`SELECT public_key FROM ssh_keys WHERE app_id = ${event.appId} ORDER BY created_at DESC LIMIT 1`;
    if (!sshKeyRow) throw new Error("No SSH key found. Go to Settings → SSH Keys and add your public key before deploying to a VPS.");
    // Combine user key + deploy key so both can access the server
    const combinedKeys = `${sshKeyRow.public_key.trim()}\n${deployPubKey}`;
    await runCmd("pulumi", ["config", "set", "sshPublicKey", combinedKeys, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  }
  if (provider === "gcp") {
    const gcpProjectId = getGcpProjectId(ctx.providerRow.api_key);
    if (gcpProjectId) await runCmd("pulumi", ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

    // For Cloud Storage + CDN (static), enable Compute API and skip Docker entirely
    if (event.deployStrategy === "static" && gcpProjectId) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── GCP Static Site Setup ──────────`);

      const gcpAccessToken = await getGcpAccessToken(ctx.providerRow.api_key);
      if (gcpAccessToken) {
        await enableGcpApis(gcpProjectId, gcpAccessToken, ["compute.googleapis.com"]);
        await appendLog(deploymentId, `[${ts()}] ✓ Compute Engine API enabled`);
      }
      await appendLog(deploymentId, `[${ts()}] ℹ Static site — skipping Docker build`);
    }
    // For Cloud Run (managed), enable Artifact Registry API, create repo, push image, and set imageUri
    if (event.deployStrategy === "managed" && gcpProjectId) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── Push Image to Artifact Registry ─`);

      const arRegion = extractRegionFromScript(event.tofuScript) || region;
      const accessToken = await getGcpAccessToken(ctx.providerRow.api_key);
      if (!accessToken) throw new Error("Failed to get GCP access token from service account key");

      // Enable APIs
      await appendLog(deploymentId, `[${ts()}] ℹ Enabling Artifact Registry API...`);
      await enableGcpApis(gcpProjectId, accessToken, ["artifactregistry.googleapis.com", "run.googleapis.com"]);
      await new Promise(r => setTimeout(r, 10_000));
      await appendLog(deploymentId, `[${ts()}] ✓ Artifact Registry API enabled`);

      const arHost = `${arRegion}-docker.pkg.dev`;
      const arRepo = repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
      const arImageUri = `${arHost}/${gcpProjectId}/${arRepo}/${arRepo}:${shortId}`;

      // Create Artifact Registry repository
      const repoResult = await ensureArtifactRegistryRepo(gcpProjectId, arRegion, arRepo, accessToken);
      if (repoResult.created) {
        await appendLog(deploymentId, `[${ts()}] ✓ Artifact Registry repository created`);
      } else if (repoResult.error) {
        await appendLog(deploymentId, `[${ts()}] ⚠ Create repo: ${repoResult.error}`);
      } else {
        await appendLog(deploymentId, `[${ts()}] ✓ Artifact Registry repository already exists`);
      }

      // Push image
      await pushToArtifactRegistry({
        localImage: actualImage, arImageUri, arHost, accessToken, workDir, runCmd, env: providerEnv,
      });
      await appendLog(deploymentId, `[${ts()}] ✓ Image pushed: ${arImageUri}`);

      await runCmd("pulumi", ["config", "set", "imageUri", arImageUri, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    }
    // Don't set gcp:region here — the Pulumi template already has the wizard-selected region as default
  }
  // For non-GCP providers, set region from provider config (GCP uses the region baked into the Pulumi script)
  if (provider !== "gcp") {
    await runCmd("pulumi", ["config", "set", "region", region, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
  }

  // Restore state from previous deployment (only from successful ones — failed/destroyed may have stale resources)
  const prevDeploy = await db.queryRow<{ tofu_script: string }>`
    SELECT tofu_script FROM deployments WHERE repo = ${event.repo} AND provider_id = ${event.providerId}
      AND deploy_strategy = ${event.deployStrategy}
      AND tofu_script LIKE '%/* STATE */%' AND id != ${deploymentId}
      AND status = 'success'
      ORDER BY created_at DESC LIMIT 1`;
  if (prevDeploy?.tofu_script) {
    const { restored } = await restorePulumiState({
      prevTofuScript: prevDeploy.tofu_script, stackName, pulumiDir, providerEnv, runCmd,
    });
    if (restored) await appendLog(deploymentId, `[${ts()}] ℹ Restored state from previous deployment`);
    else await appendLog(deploymentId, `[${ts()}] ⚠ State import failed, deploying fresh`);
  }

  // For GCP Cloud Run: if no previous state was restored, check if the service already exists
  // and inject import directives so Pulumi adopts existing resources instead of failing with 409
  if (provider === "gcp" && event.deployStrategy === "managed" && !prevDeploy?.tofu_script) {
    try {
      const gcpProjectId = getGcpProjectId(ctx.providerRow.api_key);
      const accessToken = await getGcpAccessToken(ctx.providerRow.api_key);

      if (accessToken && gcpProjectId) {
        const arRegion = extractRegionFromScript(event.tofuScript) || region;
        const serviceName = repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");

        const checkRes = await fetch(
          `https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${arRegion}/services/${serviceName}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (checkRes.ok) {
          await appendLog(deploymentId, `[${ts()}] ℹ Existing Cloud Run service found — importing`);
          const indexPath = join(pulumiDir, "index.ts");
          let program = await ctx.readFs(indexPath, "utf-8");
          program = program.replace(
            /}, \{ dependsOn: \[cloudRunApi\] \}\);(\s*\/\/ ── Allow unauthenticated)/,
            `}, { dependsOn: [cloudRunApi], import: \`projects/\${project}/locations/\${region}/services/${serviceName}\` });$1`
          );
          await ctx.writeFile(indexPath, program, "utf-8");
        }
      }
    } catch (e: any) {
      await appendLog(deploymentId, `[${ts()}] ⚠ Cloud Run import check: ${e.message} (continuing)`);
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
        const uploadToken = await getGcpAccessToken(ctx.providerRow.api_key, "https://www.googleapis.com/auth/devstorage.read_write");

        if (uploadToken) {
          // Build the static site using npm directly (cross-platform)
          await appendLog(deploymentId, `[${ts()}] ℹ Installing dependencies...`);
          const installResult = await runCmd("npm", ["ci"], { cwd: repoDir });
          if (installResult.code !== 0) {
            await appendLog(deploymentId, `[${ts()}] ⚠ npm ci failed, trying npm install...`);
            await runCmd("npm", ["install"], { cwd: repoDir });
          }

          await appendLog(deploymentId, `[${ts()}] ℹ Building static site...`);
          const { existsSync, writeFileSync: writeFs, readdirSync, statSync, readFileSync, copyFileSync, mkdirSync } = await import("node:fs");
          const isNuxt = event.techStack.some(t => t.toLowerCase().includes("nuxt"));
          const isNext = event.techStack.some(t => t.toLowerCase().includes("next"));

          // ── Step 1: Build the project ──
          // Each framework has its own build command and output directory.
          // We try the most specific approach first, then fall back to generic `npm run build`.
          let buildOk = false;

          if (isNuxt) {
            // Nuxt: try `nuxt generate` for full SSG, fall back to normal build for SPA
            const genResult = await runCmd("npx", ["nuxt", "generate"], { cwd: repoDir, env: { NITRO_PRESET: "static" } });
            if (genResult.code === 0) {
              buildOk = true;
              await appendLog(deploymentId, `[${ts()}] ✓ Nuxt static site generated`);
            } else {
              await appendLog(deploymentId, `[${ts()}] ℹ nuxt generate failed (likely API deps), building as SPA...`);
              // Save the 200.html produced by the failed generate — it has correct script/link tags
              const outputPublicDir = join(repoDir, ".output/public");
              const saved200 = existsSync(join(outputPublicDir, "200.html"))
                ? readFileSync(join(outputPublicDir, "200.html"), "utf-8") : null;
              // Normal build produces client assets without triggering prerender
              const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
              if (buildRes.code === 0 || existsSync(join(outputPublicDir, "_nuxt")) || existsSync(join(repoDir, ".nuxt/dist/client/_nuxt"))) {
                // Ensure .output/public/_nuxt exists
                if (!existsSync(join(outputPublicDir, "_nuxt"))) {
                  const src = join(repoDir, ".nuxt/dist/client/_nuxt");
                  if (existsSync(src)) {
                    const { cpSync } = await import("node:fs");
                    mkdirSync(outputPublicDir, { recursive: true });
                    cpSync(src, join(outputPublicDir, "_nuxt"), { recursive: true });
                  }
                }
                // Restore saved 200.html as index.html
                if (saved200 && existsSync(join(outputPublicDir, "_nuxt"))) {
                  writeFs(join(outputPublicDir, "index.html"), saved200, "utf-8");
                }
                buildOk = existsSync(join(outputPublicDir, "_nuxt"));
                if (buildOk) await appendLog(deploymentId, `[${ts()}] ✓ Nuxt SPA built`);
              }
            }
          } else if (isNext) {
            // Next.js: `next build` then `next export` (or output: 'export' in next.config)
            const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
            if (buildRes.code === 0) {
              buildOk = true;
              // Try next export if out/ doesn't exist yet
              if (!existsSync(join(repoDir, "out"))) {
                await runCmd("npx", ["next", "export"], { cwd: repoDir });
              }
              await appendLog(deploymentId, `[${ts()}] ✓ Next.js static site built`);
            }
          }

          // Generic fallback for React (CRA/Vite), Vue, Svelte, Angular, Astro, etc.
          if (!buildOk) {
            const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
            if (buildRes.code === 0) {
              buildOk = true;
              await appendLog(deploymentId, `[${ts()}] ✓ Static site built`);
            } else {
              // Last resort: try generate script if it exists
              const genRes = await runCmd("npm", ["run", "generate", "--if-present"], { cwd: repoDir });
              if (genRes.code === 0) {
                buildOk = true;
                await appendLog(deploymentId, `[${ts()}] ✓ Static site generated`);
              } else {
                await appendLog(deploymentId, `[${ts()}] ⚠ Build failed — uploading source files as fallback`);
              }
            }
          }

          // ── Step 2: Find the build output directory ──
          // Frameworks output to different directories:
          //   Nuxt: .output/public    Next.js: out         Astro: dist
          //   React/Vue/Svelte: dist  Angular: dist/<name>  SvelteKit: build
          const possibleDirs = [
            ".output/public",  // Nuxt
            "out",             // Next.js
            "dist",            // Vite (React/Vue/Svelte), Astro, Angular
            "build",           // Create React App, SvelteKit
            ".next/out",       // Next.js (older)
            "output",          // Generic
            "public",          // Hugo, some configs
          ];
          let uploadDir = repoDir;
          // Prefer a dir that has index.html
          for (const dir of possibleDirs) {
            const candidate = join(repoDir, dir);
            if (existsSync(join(candidate, "index.html"))) { uploadDir = candidate; break; }
          }
          // If none had index.html, pick the first that exists
          if (uploadDir === repoDir) {
            for (const dir of possibleDirs) {
              if (existsSync(join(repoDir, dir))) { uploadDir = join(repoDir, dir); break; }
            }
          }
          // For Angular, check dist/<project-name>/browser or dist/<project-name>
          if (uploadDir === repoDir && existsSync(join(repoDir, "dist"))) {
            const distEntries = readdirSync(join(repoDir, "dist"));
            for (const entry of distEntries) {
              const candidate = join(repoDir, "dist", entry);
              if (statSync(candidate).isDirectory()) {
                if (existsSync(join(candidate, "browser", "index.html"))) { uploadDir = join(candidate, "browser"); break; }
                if (existsSync(join(candidate, "index.html"))) { uploadDir = candidate; break; }
              }
            }
          }

          // ── Step 3: Ensure index.html exists ──
          if (!existsSync(join(uploadDir, "index.html"))) {
            // Check for 200.html (Nuxt SPA fallback)
            if (existsSync(join(uploadDir, "200.html"))) {
              copyFileSync(join(uploadDir, "200.html"), join(uploadDir, "index.html"));
              await appendLog(deploymentId, `[${ts()}] ✓ Using 200.html as index.html`);
            } else {
              await appendLog(deploymentId, `[${ts()}] ⚠ No index.html found in build output`);
            }
          }

          await appendLog(deploymentId, `[${ts()}] ℹ Uploading from: ${uploadDir.replace(repoDir, ".")}`);

          // Upload files recursively using GCS JSON API
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
  await savePulumiState({ deploymentId, tofuScript: event.tofuScript, pulumiDir, providerEnv, runCmd, db });

  try { await ctx.rm(workDir, { recursive: true, force: true }); } catch {}

  const finalUrl = appUrl || generateAppUrl(provider, repoName, shortId, region, event.deployStrategy);
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
  await appendLog(deploymentId, `[${ts()}] ✓ ${isStaticDeploy ? "Static site deployed" : `Docker image: ${remoteImage}`}`);
  await appendLog(deploymentId, `[${ts()}] ✓ Infrastructure provisioned via Pulumi`);
  await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${finalUrl}`);
  await db.exec`UPDATE deployments SET status = 'success', app_url = ${finalUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
}
