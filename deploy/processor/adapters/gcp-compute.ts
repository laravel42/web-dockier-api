import { join } from "node:path";
import { db, extractRegionFromScript } from "../../shared";
import {
  getGcpAccessToken,
  getGcpProjectId,
  enableGcpApis,
  ensureArtifactRegistryRepo,
  pushToArtifactRegistry,
} from "../gcp-helpers";
import {
  setupPulumiWorkspace,
  restorePulumiState,
  savePulumiState,
} from "../pulumi-workspace";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
} from "./types";

/**
 * GCP Compute Engine (VPS) adapter.
 *
 * Handles deployments to GCP Compute Engine via Artifact Registry + Pulumi,
 * including SCP image transfer and container startup on the provisioned VM.
 * Extracted from the `handlePulumiDeploy` function in `pulumi-deploy.ts`.
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
    (ctx as any)._gcpAccessToken = accessToken;
    (ctx as any)._arImageUri = arImageUri;

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
    (ctx as any)._envVars = envVars;
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

    // Combine user SSH key + deploy key so both can access the server
    const sshKeyRow = await db.queryRow<{ public_key: string }>`
      SELECT public_key FROM ssh_keys WHERE app_id = ${event.appId}
      ORDER BY created_at DESC LIMIT 1`;
    if (!sshKeyRow) {
      throw new Error(
        "No SSH key found. Go to Settings → SSH Keys and add your public key before deploying to a VPS.",
      );
    }
    const combinedKeys = `${sshKeyRow.public_key.trim()}\n${deployPubKey}`;
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
      const arImageUri = (ctx as any)._arImageUri || imageUri;
      const accessToken = (ctx as any)._gcpAccessToken || "";
      program = program.replace(/__AR_IMAGE_URI__/g, arImageUri);
      program = program.replace(/__AR_TOKEN__/g, accessToken);
      await writeFs(indexPath, program, "utf-8");
    }

    // Replace user-provided env vars placeholder in the Pulumi program
    {
      const indexPath = join(pulumiDir, "index.ts");
      let program = await readFs(indexPath, "utf-8");
      const envVars = (ctx as any)._envVars || event.envVars || [];
      if (envVars.length) {
        // Escape values for embedding inside a JS template literal that becomes a bash script:
        // - Use single quotes to prevent bash variable expansion
        // - $ must be \$ so JS doesn't interpret ${...} as template interpolation
        // - backticks must be \` so they don't break the template literal
        // - single quotes in values are escaped with '\'' (end quote, escaped quote, start quote)
        const userEnvFlags = envVars
          .map((e: { name: string; value: string }) => {
            const escaped = e.value
              .replace(/\\/g, "\\\\")
              .replace(/`/g, "\\`")
              .replace(/\$/g, "\\$")
              .replace(/'/g, "'\\''");
            return `-e ${e.name}='${escaped}'`;
          })
          .join(" ");
        program = program.replace(/__USER_ENV_FLAGS__/g, userEnvFlags);
      } else {
        program = program.replace(/__USER_ENV_FLAGS__/g, "");
      }
      await writeFs(indexPath, program, "utf-8");
    }

    // Replace database credential placeholders with user's actual values
    {
      const indexPath = join(pulumiDir, "index.ts");
      let program = await readFs(indexPath, "utf-8");
      const envVars = (ctx as any)._envVars || event.envVars || [];
      const envMap = new Map(envVars.map((e: { name: string; value: string }) => [e.name, e.value]));
      const dbName = envMap.get("DB_DATABASE") || "forge";
      const dbUser = envMap.get("DB_USERNAME") || "appuser";
      const dbPass = envMap.get("DB_PASSWORD") || "apppass123";
      program = program.replace(/__DEPLOY_DB_NAME__/g, dbName);
      program = program.replace(/__DEPLOY_DB_USER__/g, dbUser);
      program = program.replace(/__DEPLOY_DB_PASS__/g, dbPass);
      await writeFs(indexPath, program, "utf-8");
    }

    // Restore state from previous deployment (prefer successful, fall back to failed with partial state)
    const prevDeploy = await db.queryRow<{ tofu_script: string }>`
      SELECT tofu_script FROM deployments WHERE repo = ${event.repo} AND provider_id = ${event.providerId}
        AND deploy_strategy = ${event.deployStrategy}
        AND tofu_script LIKE '%/* STATE */%' AND id != ${deploymentId}
        AND status IN ('success', 'failed')
        ORDER BY (CASE WHEN status = 'success' THEN 0 ELSE 1 END), created_at DESC LIMIT 1`;
    if (prevDeploy?.tofu_script) {
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

    // Run pulumi up
    await appendLog("── Pulumi Up ──────────────────────");
    let upResult = await runCmd(
      "pulumi",
      ["up", "--yes", "--non-interactive", "--skip-preview"],
      { cwd: pulumiDir, env: providerEnv },
    );

    // If pulumi up fails because a resource in state no longer exists (404/notFound)
    // or a resource already exists outside of state (409/alreadyExists),
    // wipe the stack state entirely and retry as a fresh deploy.
    if (
      upResult.code !== 0 &&
      /was not found|notFound|Error 404|already exists|alreadyExists|Error 409/.test(
        upResult.output,
      )
    ) {
      await appendLog("⚠ Resource conflict — wiping state and retrying fresh...");
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
      // Re-set SSH key config
      const sshKeyRow2 = await db.queryRow<{ public_key: string }>`
        SELECT public_key FROM ssh_keys WHERE app_id = ${event.appId}
        ORDER BY created_at DESC LIMIT 1`;
      if (sshKeyRow2) {
        const combinedKeys2 = `${sshKeyRow2.public_key.trim()}\n${deployPubKey}`;
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
    (ctx as any)._pulumiDir = pulumiDir;
    (ctx as any)._providerEnv = providerEnv;
    (ctx as any)._deployKeyPath = deployKeyPath;

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

    const pulumiDir = (ctx as any)._pulumiDir || provision.outputs.pulumiDir;
    const providerEnv = (ctx as any)._providerEnv
      ? (ctx as any)._providerEnv
      : JSON.parse(provision.outputs.providerEnvJson || "{}");
    const deployKeyPath = (ctx as any)._deployKeyPath || provision.outputs.deployKeyPath;
    const serverIp = provision.serverIp || "";

    // Transfer Docker image to server (VPS providers with a server IP)
    if (serverIp && !event.registryUrl) {
      // All runtimes (including PHP/Laravel) listen on their configured app port inside
      // the container (e.g. php artisan serve --port=8080). The host nginx reverse-proxies
      // to the same port on 127.0.0.1, so we always map APP_PORT → APP_PORT.
      const containerPort = 0; // 0 means "use APP_PORT from nginx config"

      await appendLog("── Transfer Docker Image ──────────");

      // Determine the actual image name (could be the local image or a cached one)
      const actualImage = (ctx as any)._actualImage || `${repoName}:${ctx.shortId}`;
      const tarPath = join(workDir, `${actualImage.replace(":", "-")}.tar`);
      const saveResult = await runCmd("docker", ["save", "-o", tarPath, actualImage], {
        cwd: workDir,
      });

      if (saveResult.code === 0) {
        await appendLog("ℹ Waiting for server SSH to be ready...");
        await new Promise((r) => setTimeout(r, 30_000));

        const scpResult = await runCmd(
          "scp",
          [
            "-i", deployKeyPath,
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=30",
            tarPath,
            `root@${serverIp}:/tmp/app-image.tar`,
          ],
          { cwd: workDir },
        );

        if (scpResult.code === 0) {
          // Wait for Docker to be installed by the startup script
          await appendLog("ℹ Waiting for Docker to be ready on server...");
          for (let i = 0; i < 30; i++) {
            const check = await runCmd(
              "ssh",
              [
                "-i", deployKeyPath,
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-o", "ConnectTimeout=10",
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
                "-i", deployKeyPath,
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-o", "ConnectTimeout=10",
                `root@${serverIp}`,
                "grep -q proxy_pass /etc/nginx/sites-available/* 2>/dev/null && echo READY || echo WAITING",
              ],
              { cwd: workDir },
            );
            if (check2.output.includes("READY")) break;
            await new Promise((r) => setTimeout(r, 10_000));
          }

          // Build the port mapping: map host APP_PORT → container APP_PORT
          const portMapping = containerPort
            ? `127.0.0.1:\${APP_PORT}:${containerPort}`
            : `127.0.0.1:\${APP_PORT}:\${APP_PORT}`;

          // Build env flags from wizard-provided env vars (user vars first, then infra overrides)
          const userEnvFlags = (event.envVars || [])
            .map((e) => `-e ${e.name}='${e.value.replace(/'/g, "'\\''")}'`)
            .join(" ");

          // Infrastructure env vars that must override user values
          // (e.g. DB_HOST must point to host, not localhost)
          const infraEnvFlags = ["-e APP_ENV=production", `-e PORT=\${APP_PORT}`];

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
                  "-i", deployKeyPath,
                  "-o", "StrictHostKeyChecking=no",
                  "-o", "UserKnownHostsFile=/dev/null",
                  "-o", "ConnectTimeout=10",
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
              "-i", deployKeyPath,
              "-o", "StrictHostKeyChecking=no",
              "-o", "UserKnownHostsFile=/dev/null",
              `root@${serverIp}`,
              `docker load -i /tmp/app-image.tar && rm /tmp/app-image.tar && ` +
              `APP_PORT=$(grep proxy_pass /etc/nginx/sites-available/* 2>/dev/null | head -1 | sed 's/.*://;s/;.*//') && ` +
              `APP_PORT=\${APP_PORT:-3000} && ` +
              `docker stop ${repoName} 2>/dev/null; docker rm ${repoName} 2>/dev/null; ` +
              `docker run -d --name ${repoName} --restart=always -p ${portMapping} --add-host=host.docker.internal:host-gateway ${allEnvStr} ${actualImage} && ` +
              // Ensure the nginx proxy is active (handles both fresh deploys and redeploys
              // where the startup script may not have re-run)
              `sleep 2 && NGINX_CONF=$(ls /etc/nginx/sites-available/* 2>/dev/null | grep -v default | head -1) && ` +
              `if [ -n "$NGINX_CONF" ]; then ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx; fi`,
            ],
            { cwd: workDir },
          );

          if (loadResult.code === 0) {
            await appendLog("✓ Docker image transferred and running on server");

            // Run Laravel post-deploy commands if applicable (clear cached config, run migrations)
            const isLaravel = event.techStack?.some(s => s.toLowerCase() === "laravel");
            if (isLaravel) {
              await appendLog("ℹ Running Laravel post-deploy commands...");
              await runCmd(
                "ssh",
                [
                  "-i", deployKeyPath,
                  "-o", "StrictHostKeyChecking=no",
                  "-o", "UserKnownHostsFile=/dev/null",
                  `root@${serverIp}`,
                  `sleep 3 && ` +
                  `docker exec ${repoName} php artisan config:clear 2>/dev/null; ` +
                  `docker exec ${repoName} php artisan migrate --force 2>/dev/null; ` +
                  `docker exec ${repoName} php artisan config:cache 2>/dev/null; ` +
                  `echo LARAVEL_SETUP_DONE`,
                ],
                { cwd: workDir },
              );
              await appendLog("✓ Laravel post-deploy commands completed");
            }
          } else {
            await appendLog("⚠ Failed to load image on server");
          }
        } else {
          await appendLog("⚠ SCP failed");
        }
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
}
