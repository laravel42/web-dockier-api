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
 * GCP Cloud Run adapter.
 *
 * Handles deployments to GCP Cloud Run via Artifact Registry + Pulumi.
 * Extracted from the `handlePulumiDeploy` function in `pulumi-deploy.ts`.
 */
export class GcpCloudRunAdapter implements DeployAdapter {
  readonly id = "gcp-cloudrun";

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "gcp" && deployStrategy === "managed";
  }

  /**
   * Push Docker image to GCP Artifact Registry.
   *
   * Steps:
   * 1. Get GCP access token from service account key
   * 2. Get GCP project ID
   * 3. Enable artifactregistry.googleapis.com and run.googleapis.com APIs
   * 4. Create Artifact Registry repository (idempotent)
   * 5. Tag and push Docker image to Artifact Registry
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

    // Enable APIs
    await appendLog("ℹ Enabling Artifact Registry API...");
    await enableGcpApis(gcpProjectId, accessToken, [
      "artifactregistry.googleapis.com",
      "run.googleapis.com",
    ]);
    await new Promise((r) => setTimeout(r, 10_000));
    await appendLog("✓ Artifact Registry API enabled");

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

    return { remoteImageUri: arImageUri, skipped: false };
  }

  /**
   * Inject environment variables into the Pulumi program.
   *
   * For Cloud Run, this:
   * 1. Sets `imageUri` in Pulumi config (done in provisionInfrastructure after pushImage)
   * 2. Replaces `__USER_ENV_FLAGS__` placeholder with user env var docker flags
   * 3. Replaces `__DEPLOY_DB_*__` placeholders with user DB credentials (or defaults)
   */
  async injectEnvVars(
    ctx: AdapterContext,
    envVars: Array<{ name: string; value: string }>,
  ): Promise<void> {
    // For Cloud Run, env vars are baked into the Pulumi program's Cloud Run container `envs` array.
    // The Pulumi template already includes env var entries in the container spec.
    // The __USER_ENV_FLAGS__ and __DEPLOY_DB_*__ placeholders are used by VPS deploys,
    // but we still need to handle them if present in the program.

    // Store envVars on the context event for later use during provisionInfrastructure
    // (the actual Pulumi config set happens there after workspace setup)
    // The placeholder replacement also happens during provisionInfrastructure
    // since we need the pulumiDir path.

    // No-op here — Cloud Run env vars are handled via the Pulumi template's `envs` array,
    // and the imageUri config is set during provisionInfrastructure.
    // Placeholder replacement for __USER_ENV_FLAGS__ and __DEPLOY_DB_*__ is done
    // in provisionInfrastructure after the workspace is set up.
  }

  /**
   * Provision Cloud Run infrastructure via Pulumi.
   *
   * Steps:
   * 1. Set up Pulumi workspace with GCP credentials
   * 2. Install npm dependencies
   * 3. Init Pulumi stack
   * 4. Set GCP project config
   * 5. Set imageUri config (from pushImage result)
   * 6. Replace __USER_ENV_FLAGS__ and __DEPLOY_DB_*__ placeholders
   * 7. Restore previous Pulumi state if available
   * 8. Handle Cloud Run service import for first deploys (check if service exists)
   * 9. Run `pulumi up` with retry on 404/409 conflicts
   * 10. Extract appUrl from Pulumi outputs
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

    // Set resource suffix for GCP resource names to avoid 409 collisions
    await runCmd(
      "pulumi",
      ["config", "set", "resourceSuffix", shortId, "--non-interactive"],
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

    // Set imageUri config from pushImage result
    await runCmd(
      "pulumi",
      ["config", "set", "imageUri", imageUri, "--non-interactive"],
      { cwd: pulumiDir, env: providerEnv },
    );

    // Replace user-provided env vars placeholder in the Pulumi program
    {
      const indexPath = join(pulumiDir, "index.ts");
      let program = await readFs(indexPath, "utf-8");
      if (event.envVars?.length) {
        const userEnvFlags = event.envVars
          .map((e) => {
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
      const envMap = new Map((event.envVars || []).map((e) => [e.name, e.value]));
      const dbName = envMap.get("DB_DATABASE") || "forge";
      const dbUser = envMap.get("DB_USERNAME") || "appuser";
      const dbPass = envMap.get("DB_PASSWORD") || "apppass123";
      program = program.replace(/__DEPLOY_DB_NAME__/g, dbName);
      program = program.replace(/__DEPLOY_DB_USER__/g, dbUser);
      program = program.replace(/__DEPLOY_DB_PASS__/g, dbPass);
      await writeFs(indexPath, program, "utf-8");
    }

    // Restore state from previous deployment
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

    // For Cloud Run: if no previous state was restored, check if the service already exists
    // and inject import directives so Pulumi adopts existing resources instead of failing with 409
    if (!prevDeploy?.tofu_script) {
      try {
        const accessToken = await getGcpAccessToken(providerCredentials.apiKey);

        if (accessToken && gcpProjectId) {
          const arRegion = extractRegionFromScript(event.tofuScript) || region;
          const serviceName = repoName.toLowerCase().replace(/[^a-z0-9.-]/g, "-");

          const checkRes = await fetch(
            `https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${arRegion}/services/${serviceName}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (checkRes.ok) {
            await appendLog("ℹ Existing Cloud Run service found — importing");
            const indexPath = join(pulumiDir, "index.ts");
            let program = await readFs(indexPath, "utf-8");
            program = program.replace(
              /}, \{ dependsOn: \[cloudRunApi\] \}\);(\s*\/\/ ── Allow unauthenticated)/,
              `}, { dependsOn: [cloudRunApi], import: \`projects/\${project}/locations/\${region}/services/${serviceName}\` });$1`,
            );
            await writeFs(indexPath, program, "utf-8");
          }
        }
      } catch (e: any) {
        await appendLog(`⚠ Cloud Run import check: ${e.message} (continuing)`);
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
      await runCmd(
        "pulumi",
        ["config", "set", "imageUri", imageUri, "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
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
    try {
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
      if (appUrl && !appUrl.startsWith("http")) {
        appUrl = `https://${appUrl}`;
      }
      await appendLog(`  appUrl = ${appUrl || "(not found)"}`);
    } catch (e: any) {
      await appendLog(`  (could not parse outputs: ${e.message})`);
    }

    // Store pulumiDir and providerEnv for runPostDeploy
    (ctx as any)._pulumiDir = pulumiDir;
    (ctx as any)._providerEnv = providerEnv;

    return {
      appUrl,
      outputs: { pulumiDir, providerEnvJson: JSON.stringify(providerEnv) },
    };
  }

  /**
   * Save Pulumi state to DB (embed in tofu_script column).
   */
  async runPostDeploy(ctx: AdapterContext, provision: ProvisionResult): Promise<void> {
    const { deploymentId, event, runCmd } = ctx;
    const pulumiDir = (ctx as any)._pulumiDir || provision.outputs.pulumiDir;
    const providerEnv = (ctx as any)._providerEnv
      ? (ctx as any)._providerEnv
      : JSON.parse(provision.outputs.providerEnvJson || "{}");

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
