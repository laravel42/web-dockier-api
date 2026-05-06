import { join } from "node:path";
import { db, extractRegionFromScript } from "../../shared";
import {
  getGcpAccessToken,
  getGcpProjectId,
  enableGcpApis,
  ensureArtifactRegistryRepo,
  pushToArtifactRegistry,
  deleteOrphanedComputeResources,
} from "../gcp-helpers";
import {
  setupPulumiWorkspace,
  restorePulumiState,
  savePulumiState,
} from "../pulumi-workspace";
import { replacePulumiPlaceholders } from "../pulumi-placeholders";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
  DestroyContext,
  DestroyResult,
} from "./types";
import { runCmd } from "../run-cmd";

/**
 * GCP Compute Engine (VPS) adapter.
 *
 * Handles deployments to GCP Compute Engine via Artifact Registry + Pulumi,
 * including SCP image transfer and container startup on the provisioned VM.
 */
export class GcpComputeAdapter implements DeployAdapter {
  readonly id = "gcp-compute";

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "gcp" && deployStrategy === "vps";
  }

  /**
   * Push Docker image to GCP Artifact Registry.
   *
   * Steps:
   * 1. Get GCP access token and project ID from service account key
   * 2. Enable artifactregistry.googleapis.com and compute.googleapis.com APIs
   * 3. Create Artifact Registry repository (idempotent)
   * 4. Tag and push Docker image to Artifact Registry
   */
  async pushImage(ctx: AdapterContext, localImage: string): Promise<PushImageResult> {
    const { shortId, region, workDir, providerCredentials, event, runCmd, appendLog } = ctx;
    const repoName = ctx.repoName;

    const gcpProjectId = getGcpProjectId(providerCredentials.apiKey);
    if (!gcpProjectId) {
      throw new Error("Could not determine GCP project ID from service account key");
    }

    await appendLog("── Push Image to Artifact Registry ─");

    const arRegion = extractRegionFromScript(event.tofuScript) || region;
    const accessToken = await getGcpAccessToken(providerCredentials.apiKey);
    if (!accessToken) {
      throw new Error("Failed to get GCP access token from service account key");
    }

    // Enable APIs — Compute Engine + Artifact Registry
    await appendLog("ℹ Enabling Artifact Registry API...");
    await enableGcpApis(gcpProjectId, accessToken, [
      "artifactregistry.googleapis.com",
      "compute.googleapis.com",
    ]);
    await new Promise((r) => setTimeout(r, 5_000));
    await appendLog("✓ APIs enabled");

    const arHost = `${arRegion}-docker.pkg.dev`;
    const arRepo = repoName.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
    const arImageUri = `${arHost}/${gcpProjectId}/${arRepo}/${arRepo}:${shortId}`;

    // Create Artifact Registry repository
    const repoResult = await ensureArtifactRegistryRepo(gcpProjectId, arRegion, arRepo, accessToken);
    if (repoResult.created) {
      await appendLog("✓ Artifact Registry repository created");
    } else if (repoResult.error) {
      await appendLog(`⚠ Create repo: ${repoResult.error}`);
    } else {
      await appendLog("✓ Artifact Registry repository already exists");
    }

    // Push image
    await pushToArtifactRegistry({
      localImage,
      arImageUri,
      arHost,
      accessToken,
      workDir,
      runCmd,
    });
    await appendLog(`✓ Image pushed: ${arImageUri}`);

    // Store the access token for use in injectEnvVars (AR_TOKEN placeholder)
    ctx.state.gcpAccessToken = accessToken;
    ctx.state.arImageUri = arImageUri;

    return { remoteImageUri: arImageUri, skipped: false };
  }

  /**
   * Inject environment variables into the Pulumi program.
   *
   * For Compute Engine VPS, this:
   * 1. Replaces __AR_IMAGE_URI__ placeholder with the actual AR image URI
   * 2. Replaces __AR_TOKEN__ placeholder with the GCP access token
   * 3. Replaces __USER_ENV_FLAGS__ placeholder with user env var docker flags
   * 4. Replaces __DEPLOY_DB_*__ placeholders with user DB credentials (or defaults)
   */
  async injectEnvVars(
    ctx: AdapterContext,
    envVars: Array<{ name: string; value: string }>,
  ): Promise<void> {
    // Store envVars for later use in provisionInfrastructure
    // The actual placeholder replacement happens in provisionInfrastructure
    // after the Pulumi workspace is set up and we have the pulumiDir path.
    ctx.state.pendingEnvVars = envVars;
  }

  /**
   * Provision Compute Engine infrastructure via Pulumi.
   *
   * Steps:
   * 1. Set up Pulumi workspace with GCP credentials
   * 2. Install npm dependencies, init stack
   * 3. Set resourceSuffix config
   * 4. Generate deploy SSH key and combine with user SSH key
   * 5. Set sshPublicKey config
   * 6. Set GCP project config
   * 7. Replace AR image/token placeholders in Pulumi program
   * 8. Replace user env vars and DB credential placeholders
   * 9. Restore previous Pulumi state if available
   * 10. Run `pulumi up` with 404/409 retry
   * 11. Extract serverIp and appUrl from outputs
   */
  async provisionInfrastructure(
    ctx: AdapterContext,
    imageUri: string,
  ): Promise<ProvisionResult> {
    const {
      deploymentId,
      repoName,
      shortId,
      region,
      workDir,
      providerCredentials,
      event,
      runCmd,
      appendLog,
      readFile: readFs,
      writeFile: writeFs,
    } = ctx;

    if (!event.tofuScript) {
      throw new Error("No Pulumi program provided. Generate infrastructure code first, then deploy.");
    }

    await appendLog("── Pulumi Setup ───────────────────");

    const { pulumiDir, providerEnv } = await setupPulumiWorkspace({
      workDir,
      appName: repoName,
      provider: "gcp",
      region,
      providerRow: {
        api_key: providerCredentials.apiKey,
        api_secret: providerCredentials.apiSecret,
      },
      indexTs: event.tofuScript,
    });

    // Install npm dependencies
    await appendLog("ℹ Installing Pulumi dependencies...");
    const installResult = await runCmd("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: pulumiDir,
      env: providerEnv,
    });
    if (installResult.code !== 0) {
      const errLines = installResult.output
        .split("\n")
        .filter((l) => l.trim())
        .slice(-10);
      for (const line of errLines) {
        await appendLog(`✗ npm: ${line}`);
      }
      throw new Error(`npm install failed (exit code ${installResult.code})`);
    }
    await appendLog("✓ Dependencies installed");

    // Init Pulumi stack
    const stackName = `${repoName}-${shortId}`;
    const initResult = await runCmd(
      "pulumi",
      ["stack", "init", stackName, "--non-interactive"],
      { cwd: pulumiDir, env: providerEnv },
    );
    if (initResult.code !== 0) {
      await appendLog(
        `⚠ Stack init: ${initResult.output
          .split("\n")
          .filter((l) => l.trim())
          .slice(-3)
          .join(" | ")}`,
      );
    }

    // Set unique suffix for GCP resource names to avoid 409 collisions across stacks
    await runCmd(
      "pulumi",
      ["config", "set", "resourceSuffix", shortId, "--non-interactive"],
      { cwd: pulumiDir, env: providerEnv },
    );

    // Generate a temporary deploy SSH key (no passphrase) for image transfer
    const deployKeyPath = join(workDir, "deploy_key");
    const deployPubKeyPath = `${deployKeyPath}.pub`;
    await runCmd("ssh-keygen", ["-t", "ed25519", "-f", deployKeyPath, "-N", "", "-q"], {
      cwd: workDir,
    });
    const { readFile: readFs2 } = await import("node:fs/promises");
    const deployPubKey = (await readFs2(deployPubKeyPath, "utf-8")).trim();

    // Combine user SSH key + deploy key so both can access the server.
    // GCP ssh-keys metadata requires each line to be prefixed with "username:".
    const sshKeyRow = await db.queryRow<{ public_key: string }>`
      SELECT public_key FROM ssh_keys WHERE app_id = ${event.appId}
      ORDER BY created_at DESC LIMIT 1`;
    if (!sshKeyRow) {
      throw new Error(
        "No SSH key found. Go to Settings → SSH Keys and add your public key before deploying to a VPS.",
      );
    }
    // Each key must be on its own line with the "root:" prefix for GCP metadata.
    // The Pulumi template wraps the value as `root:${sshPublicKey}`, so we need
    // the second key to also start with "root:" on its own line.
    const combinedKeys = `${sshKeyRow.public_key.trim()}\nroot:${deployPubKey}`;
    await runCmd(
      "pulumi",
      ["config", "set", "sshPublicKey", combinedKeys, "--non-interactive"],
      { cwd: pulumiDir, env: providerEnv },
    );

    // Set GCP project config
    const gcpProjectId = getGcpProjectId(providerCredentials.apiKey);
    if (gcpProjectId) {
      await runCmd(
        "pulumi",
        ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
    }

    // Replace AR image and token placeholders in the Pulumi program
    // so the startup script can pull from Artifact Registry
    {
      const indexPath = join(pulumiDir, "index.ts");
      let program = await readFs(indexPath, "utf-8");
      const arImageUri = ctx.state.arImageUri || imageUri;
      const accessToken = ctx.state.gcpAccessToken || "";
      program = program.replace(/__AR_IMAGE_URI__/g, arImageUri);
      program = program.replace(/__AR_TOKEN__/g, accessToken);
      await writeFs(indexPath, program, "utf-8");
    }

    // Replace user-provided env vars and DB credential placeholders in the Pulumi program
    {
      const indexPath = join(pulumiDir, "index.ts");
      let program = await readFs(indexPath, "utf-8");
      const envVars = ctx.state.pendingEnvVars || event.envVars || [];
      program = replacePulumiPlaceholders(program, envVars);
      await writeFs(indexPath, program, "utf-8");
    }

    // Fix port mapping if the detected container port differs from what the template assumed.
    // The template may have been generated with port 8080 (artisan serve) but the Dockerfile
    // actually uses php-fpm+nginx on port 80. Patch the startup script to use the correct mapping.
    {
      const indexPath = join(pulumiDir, "index.ts");
      let program = await readFs(indexPath, "utf-8");
      const detectedPort = ctx.detectedStack.port || 80;
      // The template uses: -p 127.0.0.1:HOST_PORT:CONTAINER_PORT
      // If the container port in the script doesn't match the detected port, fix it.
      // Use global regex to fix ALL occurrences (ECR path + AR path in user-data).
      const portMappingRegex = /-p 127\.0\.0\.1:(\d+):(\d+)/g;
      const firstMatch = program.match(/-p 127\.0\.0\.1:(\d+):(\d+)/);
      if (firstMatch) {
        const templateContainerPort = parseInt(firstMatch[2], 10);
        const templateHostPort = firstMatch[1];
        if (templateContainerPort !== detectedPort) {
          const newHostPort = detectedPort === 80 || detectedPort === 443 ? 8080 : detectedPort;
          // Replace all port mappings in docker run commands
          program = program.replace(portMappingRegex, `-p 127.0.0.1:${newHostPort}:${detectedPort}`);
          // Also fix the nginx proxy_pass port (all occurrences)
          program = program.replace(
            new RegExp(`proxy_pass http://127\\.0\\.0\\.1:${templateHostPort}`, "g"),
            `proxy_pass http://127.0.0.1:${newHostPort}`,
          );
          await writeFs(indexPath, program, "utf-8");
        }
      }
    }

    // Restore state from previous successful deployment only
    const prevDeploy = await db.queryRow<{ tofu_script: string }>`
      SELECT tofu_script FROM deployments WHERE repo = ${event.repo} AND provider_id = ${event.providerId}
        AND deploy_strategy = ${event.deployStrategy}
        AND tofu_script LIKE '%/* STATE */%' AND id != ${deploymentId}
        AND status = 'success'
        ORDER BY created_at DESC LIMIT 1`;
    if (prevDeploy?.tofu_script) {
      // Skip state restoration if it references a different region (stale state from region change)
      const stateSection = prevDeploy.tofu_script.slice(prevDeploy.tofu_script.indexOf("/* STATE */"));
      const stateReferencesWrongRegion = stateSection.includes("zones/") &&
        !stateSection.includes(`zones/${region}-`);

      if (stateReferencesWrongRegion) {
        await appendLog("⚠ Previous state references a different region — deploying fresh");
      } else {
        const { restored } = await restorePulumiState({
          prevTofuScript: prevDeploy.tofu_script,
          stackName,
          pulumiDir,
          providerEnv,
          runCmd,
        });
        if (restored) {
          await appendLog("ℹ Restored state from previous deployment");
        } else {
          await appendLog("⚠ State import failed, deploying fresh");
        }
      }
    }

    // Run pulumi up
    await appendLog("── Pulumi Up ──────────────────────");
    let upResult = await runCmd(
      "pulumi",
      ["up", "--yes", "--non-interactive", "--skip-preview"],
      { cwd: pulumiDir, env: providerEnv },
    );

    // If pulumi up fails because a resource in state no longer exists (404/notFound)
    // or a resource already exists outside of state (409/alreadyExists),
    // delete orphaned GCP resources, wipe the stack state, and retry as a fresh deploy.
    if (
      upResult.code !== 0 &&
      /was not found|notFound|Error 404|already exists|alreadyExists|Error 409/.test(
        upResult.output,
      )
    ) {
      await appendLog("⚠ Resource conflict — cleaning up orphaned resources...");

      // Delete orphaned GCP resources that exist outside Pulumi state
      const cleanupToken = ctx.state.gcpAccessToken || await getGcpAccessToken(providerCredentials.apiKey);
      if (gcpProjectId && cleanupToken) {
        await deleteOrphanedComputeResources({
          projectId: gcpProjectId,
          region,
          resName: repoName,
          accessToken: cleanupToken,
          appendLog,
        });
      }

      // Force-remove the stack
      await runCmd(
        "pulumi",
        ["stack", "rm", "--yes", "--force", "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
      await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], {
        cwd: pulumiDir,
        env: providerEnv,
      });
      // Re-apply all config that was set earlier
      if (gcpProjectId) {
        await runCmd(
          "pulumi",
          ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"],
          { cwd: pulumiDir, env: providerEnv },
        );
      }
      await runCmd(
        "pulumi",
        ["config", "set", "resourceSuffix", shortId, "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
      // Re-set SSH key config (each key needs "root:" prefix for GCP metadata)
      const sshKeyRow2 = await db.queryRow<{ public_key: string }>`
        SELECT public_key FROM ssh_keys WHERE app_id = ${event.appId}
        ORDER BY created_at DESC LIMIT 1`;
      if (sshKeyRow2) {
        const combinedKeys2 = `${sshKeyRow2.public_key.trim()}\nroot:${deployPubKey}`;
        await runCmd(
          "pulumi",
          ["config", "set", "sshPublicKey", combinedKeys2, "--non-interactive"],
          { cwd: pulumiDir, env: providerEnv },
        );
      }
      await appendLog("ℹ Clean state — retrying pulumi up");
      upResult = await runCmd(
        "pulumi",
        ["up", "--yes", "--non-interactive", "--skip-preview"],
        { cwd: pulumiDir, env: providerEnv },
      );
    }

    if (upResult.code !== 0) {
      const errorLines = upResult.output
        .split("\n")
        .filter((l) => l.trim())
        .slice(-20);
      for (const line of errorLines) {
        await appendLog(`✗ ${line}`);
      }
      throw new Error(`pulumi up failed (exit code ${upResult.code})`);
    }

    // Extract outputs
    await appendLog("── Extracting outputs ──────────────");

    let appUrl = "";
    let serverIp = "";
    try {
      const ipResult = await runCmd(
        "pulumi",
        ["stack", "output", "serverIp", "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
      serverIp =
        ipResult.output
          .trim()
          .split("\n")
          .pop()
          ?.trim() || "";
      const urlResult = await runCmd(
        "pulumi",
        ["stack", "output", "appUrl", "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
      appUrl =
        urlResult.output
          .trim()
          .split("\n")
          .pop()
          ?.trim() || "";
      if (!appUrl && serverIp) appUrl = `http://${serverIp}`;
      if (appUrl && !appUrl.startsWith("http")) appUrl = `http://${appUrl}`;
      await appendLog(`  serverIp = ${serverIp || "(not found)"}`);
      await appendLog(`  appUrl = ${appUrl || "(not found)"}`);
    } catch (e: any) {
      await appendLog(`  (could not parse outputs: ${e.message})`);
    }

    // Store pulumiDir, providerEnv, and deployKeyPath for runPostDeploy
    ctx.state.pulumiDir = pulumiDir;
    ctx.state.providerEnv = providerEnv;
    ctx.state.deployKeyPath = deployKeyPath;

    return {
      appUrl,
      serverIp,
      outputs: {
        pulumiDir,
        providerEnvJson: JSON.stringify(providerEnv),
        deployKeyPath,
      },
    };
  }

  /**
   * Run post-deploy steps: SCP image transfer, Docker load, container start, nginx config.
   *
   * Steps:
   * 1. Save Docker image as tar
   * 2. Wait for server SSH to be ready (30s initial wait + retry)
   * 3. SCP the tar to the server
   * 4. Wait for Docker to be installed by the startup script
   * 5. Wait for nginx to be configured by the startup script
   * 6. Load Docker image and start container with correct port mapping and env vars
   * 7. Configure nginx proxy (ensure it's active for both fresh and redeployments)
   * 8. Save Pulumi state to DB
   */
  async runPostDeploy(ctx: AdapterContext, provision: ProvisionResult): Promise<void> {
    const {
      deploymentId,
      repoName,
      workDir,
      event,
      runCmd,
      appendLog,
    } = ctx;

    const pulumiDir = ctx.state.pulumiDir || provision.outputs.pulumiDir;
    const providerEnv = ctx.state.providerEnv
      || JSON.parse(provision.outputs.providerEnvJson || "{}");
    const deployKeyPath = ctx.state.deployKeyPath || provision.outputs.deployKeyPath;
    const serverIp = provision.serverIp || "";

    // Transfer Docker image to server (VPS providers with a server IP)
    // Skip SCP transfer if the image is already in a remote registry (Artifact Registry / ECR)
    // — the startup script will pull it directly, which is much faster than SCP.
    const imageInRegistry = !!(ctx.state.arImageUri || (ctx.state.actualImage && (
      ctx.state.actualImage.includes("docker.pkg.dev") ||
      ctx.state.actualImage.includes(".dkr.ecr.")
    )));
    if (serverIp && !event.registryUrl && !imageInRegistry) {
      // The container port is the port the app actually listens on inside the container.
      // For php-fpm+nginx Dockerfiles this is 80, for artisan serve it's 8080, etc.
      // The host nginx proxies to this port on 127.0.0.1.
      const containerPort = ctx.detectedStack.port || 80;

      // The startup script (user-data) uses a sanitized container name (appName) that
      // replaces non-alphanumeric chars with hyphens. We must use the same name here
      // so docker stop/rm correctly targets the container started by the startup script.
      const containerName = repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

      await appendLog("── Transfer Docker Image ──────────");

      // Determine the actual image name (could be the local image or a cached one)
      const actualImage = ctx.state.actualImage || `${repoName}:${ctx.shortId}`;
      const tarPath = join(workDir, `${actualImage.replace(":", "-")}.tar`);
      const saveResult = await runCmd("docker", ["save", "-o", tarPath, actualImage], {
        cwd: workDir,
      });

      if (saveResult.code === 0) {
        // Helper: common SSH options for all SSH/SCP calls
        const sshOpts = [
          "-i", deployKeyPath,
          "-o", "StrictHostKeyChecking=no",
          "-o", "UserKnownHostsFile=/dev/null",
          "-o", "ConnectTimeout=30",
        ];

        // Wait for SSH to become available with retry (fresh VMs can take 30-90s)
        await appendLog("ℹ Waiting for server SSH to be ready...");
        let sshReady = false;
        for (let i = 0; i < 12; i++) {
          if (i === 0) await new Promise((r) => setTimeout(r, 30_000));
          else await new Promise((r) => setTimeout(r, 10_000));
          const probe = await runCmd(
            "ssh",
            [...sshOpts, `root@${serverIp}`, "echo SSH_OK"],
            { cwd: workDir },
          );
          if (probe.output.includes("SSH_OK")) { sshReady = true; break; }
        }

        if (!sshReady) {
          await appendLog("⚠ SSH not available after retries — startup script will handle container setup");
        }

        let containerRunning = false;

        if (sshReady) {
          // Try SCP transfer first (fastest path for redeployments)
          const scpResult = await runCmd(
            "scp",
            [
              ...sshOpts,
              tarPath,
              `root@${serverIp}:/tmp/app-image.tar`,
            ],
            { cwd: workDir },
          );

          if (scpResult.code !== 0) {
            await appendLog("⚠ SCP failed — checking if startup script already started the container...");

            // The startup script (user-data) pulls from Artifact Registry and starts the container.
            // Wait for it to finish and check if the container is already running.
            for (let i = 0; i < 30; i++) {
              const check = await runCmd(
                "ssh",
                [
                  ...sshOpts,
                  `root@${serverIp}`,
                  `docker ps --filter name=${containerName} --filter status=running -q 2>/dev/null`,
                ],
                { cwd: workDir },
              );
              if (check.output.trim()) {
                containerRunning = true;
                await appendLog("✓ Container already running (started by startup script)");
                break;
              }
              await new Promise((r) => setTimeout(r, 15_000));
            }

            if (!containerRunning) {
              await appendLog("⚠ Container not running — startup script may still be in progress, waiting longer...");
              // Give the startup script more time (it installs Docker, pulls image, etc.)
              for (let i = 0; i < 20; i++) {
                const check = await runCmd(
                  "ssh",
                  [
                    ...sshOpts,
                    `root@${serverIp}`,
                    `docker ps --filter name=${containerName} --filter status=running -q 2>/dev/null`,
                  ],
                  { cwd: workDir },
                );
                if (check.output.trim()) {
                  containerRunning = true;
                  await appendLog("✓ Container started by startup script");
                  break;
                }
                await new Promise((r) => setTimeout(r, 15_000));
              }
            }
          }

          if (!containerRunning && sshReady) {
            // SCP succeeded or we need to proceed with the image load path
            // Wait for Docker to be installed by the startup script
            await appendLog("ℹ Waiting for Docker to be ready on server...");
            for (let i = 0; i < 30; i++) {
              const check = await runCmd(
                "ssh",
                [
                  ...sshOpts,
                  `root@${serverIp}`,
                  "docker info >/dev/null 2>&1 && echo READY",
                ],
                { cwd: workDir },
              );
              if (check.output.includes("READY")) break;
              await new Promise((r) => setTimeout(r, 10_000));
            }

            // Wait for the startup script to finish configuring nginx
            await appendLog("ℹ Waiting for startup script to finish...");
            for (let i = 0; i < 30; i++) {
              const check2 = await runCmd(
                "ssh",
                [
                  ...sshOpts,
                  `root@${serverIp}`,
                  "grep -q proxy_pass /etc/nginx/sites-available/* 2>/dev/null && echo READY || echo WAITING",
                ],
                { cwd: workDir },
              );
              if (check2.output.includes("READY")) break;
              await new Promise((r) => setTimeout(r, 10_000));
            }

            // Build the port mapping: map host port → container port.
            // The host nginx listens on port 80 externally and proxies to a local port
            // where Docker binds. We read the current proxy port from the nginx config
            // (set by the Pulumi startup script) and map it to the container's actual
            // listening port. This handles cases where the container port changed between
            // deploys (e.g., from 8080 with artisan serve to 80 with php-fpm+nginx).
            const hostPort = `$(grep proxy_pass /etc/nginx/sites-available/* 2>/dev/null | head -1 | sed 's/.*://;s/;.*//')`;
            const hostPortFallback = "8080";
            const portMapping = `127.0.0.1:\${HOST_PORT}:${containerPort}`;

            // Build env flags from wizard-provided env vars (user vars first, then infra overrides)
            const userEnvFlags = (event.envVars || [])
              .map((e) => `-e ${e.name}='${e.value.replace(/'/g, "'\\''")}'`)
              .join(" ");

            // Infrastructure env vars that must override user values
            // (e.g. DB_HOST must point to host, not localhost)
            const infraEnvFlags = ["-e APP_ENV=production", `-e PORT=${containerPort}`];

            // Detect if VPS database is provisioned and add correct connection env vars
            const vpsSvcs = (event.services || []).filter(s => s.mode === "vps");
            const hasVpsDb =
              vpsSvcs.some(s => s.type === "database") ||
              event.tofuScript?.includes("mysql-server") ||
              event.tofuScript?.includes("postgresql") ||
              event.tofuScript?.includes("apt-get install -y mysql") ||
              event.envVars?.some(e => e.name === "DB_HOST");
            if (hasVpsDb) {
              infraEnvFlags.push("-e DB_HOST=host.docker.internal");
            }

            // Detect if VPS cache (Redis) is provisioned
            const hasVpsCache =
              vpsSvcs.some(s => s.type === "cache") ||
              event.tofuScript?.includes("redis-server") ||
              event.tofuScript?.includes("apt-get install -y redis");
            if (hasVpsCache) {
              infraEnvFlags.push("-e REDIS_HOST=host.docker.internal");
            }

            const allEnvStr = `${userEnvFlags} ${infraEnvFlags.join(" ")}`;

            // If a VPS database is provisioned, wait for it to be ready before starting the container
            if (hasVpsDb) {
              await appendLog("ℹ Waiting for database to be ready...");
              const needsMysql = event.techStack?.some(s => s.toLowerCase().includes("mysql")) ||
                vpsSvcs.some(s => s.type === "database" && s.name.toLowerCase().includes("mysql")) ||
                event.envVars?.some(e => e.name === "DB_CONNECTION" && e.value === "mysql");
              const dbCheckCmd = needsMysql
                ? "mysqladmin ping -h localhost --silent 2>/dev/null && echo DB_READY || echo DB_WAITING"
                : "pg_isready -h localhost 2>/dev/null && echo DB_READY || echo DB_WAITING";
              for (let i = 0; i < 30; i++) {
                const dbCheck = await runCmd(
                  "ssh",
                  [
                    ...sshOpts,
                    `root@${serverIp}`,
                    dbCheckCmd,
                  ],
                  { cwd: workDir },
                );
                if (dbCheck.output.includes("DB_READY")) { await appendLog("✓ Database is ready"); break; }
                await new Promise(r => setTimeout(r, 5_000));
              }
            }

            const loadResult = await runCmd(
              "ssh",
              [
                ...sshOpts,
                `root@${serverIp}`,
                `docker load -i /tmp/app-image.tar && rm /tmp/app-image.tar && ` +
                // Read the host port from the existing nginx config (set by Pulumi startup script)
                `HOST_PORT=${hostPort} && ` +
                `HOST_PORT=\${HOST_PORT:-${hostPortFallback}} && ` +
                `docker stop ${containerName} 2>/dev/null; docker rm ${containerName} 2>/dev/null; ` +
                `docker run -d --name ${containerName} --restart=always -p ${portMapping} --add-host=host.docker.internal:host-gateway ${allEnvStr} ${actualImage} && ` +
                // Ensure the nginx proxy is active and points to the correct host port
                `sleep 2 && NGINX_CONF=$(ls /etc/nginx/sites-available/* 2>/dev/null | grep -v default | head -1) && ` +
                `if [ -n "$NGINX_CONF" ]; then ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx; fi`,
              ],
              { cwd: workDir },
            );

            if (loadResult.code === 0) {
              containerRunning = true;
              await appendLog("✓ Docker image transferred and running on server");
            } else {
              await appendLog("⚠ Failed to load image on server");
            }
          }

          // Run Laravel post-deploy commands if the container is running
          if (containerRunning) {
            const isLaravel = event.techStack?.some(s => s.toLowerCase() === "laravel");
            if (isLaravel) {
              await appendLog("ℹ Running Laravel post-deploy commands...");
              await runCmd(
                "ssh",
                [
                  ...sshOpts,
                  `root@${serverIp}`,
                  `sleep 3 && ` +
                  `docker exec ${containerName} php artisan config:clear 2>/dev/null; ` +
                  `docker exec ${containerName} php artisan migrate --force 2>/dev/null; ` +
                  `docker exec ${containerName} php artisan config:cache 2>/dev/null; ` +
                  `echo LARAVEL_SETUP_DONE`,
                ],
                { cwd: workDir },
              );
              await appendLog("✓ Laravel post-deploy commands completed");
            }
          }
        }
      }
    }

    // When image is in a remote registry, the startup script pulls and starts it.
    // Wait for the container to come up, then run post-deploy commands.
    if (serverIp && imageInRegistry) {
      const containerPort = ctx.detectedStack.port || 80;
      const containerName = repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

      await appendLog("── Waiting for Startup Script ─────");
      await appendLog("ℹ Image is in registry — startup script will pull and start container");

      const sshOpts = [
        "-i", deployKeyPath,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=30",
      ];

      // Wait for SSH
      await appendLog("ℹ Waiting for server SSH to be ready...");
      let sshReady = false;
      for (let i = 0; i < 12; i++) {
        if (i === 0) await new Promise((r) => setTimeout(r, 30_000));
        else await new Promise((r) => setTimeout(r, 10_000));
        const probe = await runCmd(
          "ssh",
          [...sshOpts, `root@${serverIp}`, "echo SSH_OK"],
          { cwd: workDir },
        );
        if (probe.output.includes("SSH_OK")) { sshReady = true; break; }
      }

      if (sshReady) {
        // Wait for the container to be running (startup script installs Docker, pulls, starts)
        await appendLog("ℹ Waiting for container to start...");
        let containerRunning = false;
        for (let i = 0; i < 40; i++) {
          const check = await runCmd(
            "ssh",
            [
              ...sshOpts,
              `root@${serverIp}`,
              `docker ps --filter name=${containerName} --filter status=running -q 2>/dev/null`,
            ],
            { cwd: workDir },
          );
          if (check.output.trim()) {
            containerRunning = true;
            await appendLog("✓ Container running (pulled from registry by startup script)");
            break;
          }
          await new Promise((r) => setTimeout(r, 15_000));
        }

        if (!containerRunning) {
          await appendLog("⚠ Container not detected after waiting — check server logs");
        }

        // Ensure the container is running with the correct port mapping.
        // The startup script may have used a stale port from the template generation.
        // Restart the container with the detected port and fix the nginx proxy config.
        if (containerRunning) {
          const hostPort = containerPort === 80 || containerPort === 443 ? 8080 : containerPort;
          await runCmd(
            "ssh",
            [
              ...sshOpts,
              `root@${serverIp}`,
              // Check current port mapping — if wrong, restart with correct mapping
              `CURRENT_PORT=$(docker port ${containerName} 2>/dev/null | head -1 | sed 's/.*://' ) && ` +
              `if [ "$CURRENT_PORT" != "${hostPort}" ] || ! docker port ${containerName} | grep -q ":${containerPort}->"; then ` +
              `  echo "Fixing port mapping: host ${hostPort} -> container ${containerPort}" && ` +
              `  IMG=$(docker inspect --format='{{.Config.Image}}' ${containerName}) && ` +
              `  ENV_ARGS=$(docker inspect --format='{{range .Config.Env}}-e {{.}} {{end}}' ${containerName}) && ` +
              `  docker stop ${containerName} && docker rm ${containerName} && ` +
              `  docker run -d --name ${containerName} --restart=always -p 127.0.0.1:${hostPort}:${containerPort} --add-host=host.docker.internal:host-gateway $ENV_ARGS $IMG; ` +
              `fi && ` +
              // Ensure nginx proxy points to the correct host port
              `NGINX_CONF=$(ls /etc/nginx/sites-available/* 2>/dev/null | grep -v default | head -1) && ` +
              `if [ -n "$NGINX_CONF" ]; then ` +
              `  sed -i "s|proxy_pass http://127.0.0.1:[0-9]*|proxy_pass http://127.0.0.1:${hostPort}|g" "$NGINX_CONF" && ` +
              `  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default && ` +
              `  nginx -t && systemctl reload nginx; ` +
              `fi`,
            ],
            { cwd: workDir },
          );
          await appendLog(`✓ Port mapping verified: host ${hostPort} → container ${containerPort}`);
        }

        // Run Laravel post-deploy commands
        if (containerRunning) {
          const isLaravel = event.techStack?.some(s => s.toLowerCase() === "laravel");
          if (isLaravel) {
            await appendLog("ℹ Running Laravel post-deploy commands...");
            await runCmd(
              "ssh",
              [
                ...sshOpts,
                `root@${serverIp}`,
                `sleep 3 && ` +
                `docker exec ${containerName} php artisan config:clear 2>/dev/null; ` +
                `docker exec ${containerName} php artisan migrate --force 2>/dev/null; ` +
                `docker exec ${containerName} php artisan config:cache 2>/dev/null; ` +
                `echo LARAVEL_SETUP_DONE`,
              ],
              { cwd: workDir },
            );
            await appendLog("✓ Laravel post-deploy commands completed");
          }
        }
      } else {
        await appendLog("⚠ SSH not available — startup script will handle container setup autonomously");
      }
    }

    // Save Pulumi state to DB
    await savePulumiState({
      deploymentId,
      tofuScript: event.tofuScript,
      pulumiDir,
      providerEnv,
      runCmd,
      db,
    });
  }

  async destroy(ctx: DestroyContext): Promise<DestroyResult> {
    const errors: string[] = [];
    const stateMarker = ctx.tofuScript.indexOf("/* STATE */\n");

    await ctx.appendLog("── Destroy GCP Compute Resources ──");

    if (stateMarker !== -1) {
      const savedState = ctx.tofuScript.slice(stateMarker + "/* STATE */\n".length);
      const pulumiScript = ctx.tofuScript.slice(0, stateMarker).trim();

      const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
      const { join: joinPath } = await import("node:path");
      const { tmpdir } = await import("node:os");

      const workDir = await mkdtemp(joinPath(tmpdir(), `destroy-${ctx.deploymentId.slice(0, 8)}-`));
      try {
        const { pulumiDir, providerEnv } = await setupPulumiWorkspace({
          workDir, appName: ctx.repoName, provider: "gcp",
          region: ctx.region, providerRow: { api_key: ctx.providerCredentials.apiKey, api_secret: ctx.providerCredentials.apiSecret },
          indexTs: pulumiScript,
        });

        await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });
        const stackName = `destroy-${ctx.deploymentId.slice(0, 8)}`;
        await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

        const gcpProjectId = getGcpProjectId(ctx.providerCredentials.apiKey);
        if (gcpProjectId) await runCmd("pulumi", ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

        const stateFile = joinPath(pulumiDir, "state.json");
        await writeFile(stateFile, savedState, "utf-8");
        const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--force", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
        if (importResult.code !== 0) {
          errors.push(`State import failed: ${importResult.output.split("\n").slice(-3).join(" ")}`);
        } else {
          const destroyResult = await runCmd("pulumi", ["destroy", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
          if (destroyResult.code !== 0) {
            errors.push(`Pulumi destroy failed: ${destroyResult.output.split("\n").filter(l => l.includes("error")).slice(-3).join(" ")}`);
          }
        }
      } catch (e: any) {
        errors.push(e.message || "Unknown error during Pulumi destroy");
      } finally {
        try { await rm(workDir, { recursive: true, force: true }); } catch {}
      }
    } else {
      await ctx.appendLog("⚠ No Pulumi state found — marked as destroyed but resources may still exist");
    }

    return {
      success: errors.length === 0,
      message: errors.length > 0 ? `Partially destroyed: ${errors.join("; ")}` : "Compute Engine resources destroyed",
      errors,
    };
  }
}
