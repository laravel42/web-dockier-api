// Fully adapted to Supabase (no ts-nocheck).
import { join } from "node:path";
import { extractRegionFromScript } from "../infra/gcp-helpers.js";
import { supabaseAdmin } from "../../../../shared/supabase/client.js";
import { toGcpServiceAccountKey } from "../../../../lib/provider-credentials.js";
import {
  getGcpAccessToken,
  getGcpProjectId,
  pushToGcpArtifactRegistry,
} from "../infra/gcp-helpers.js";
import {
  restorePulumiState,
  savePulumiState,
  destroyPulumiStack,
  setupAndInitPulumiStack,
  readPulumiOutput,
} from "../infra/pulumi-workspace.js";
import { replacePulumiPlaceholders } from "../infra/pulumi-placeholders.js";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
  DestroyContext,
  DestroyResult,
} from "./types.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";

const db = supabaseAdmin;

/**
 * GCP Cloud Run adapter.
 *
 * Handles deployments to GCP Cloud Run via Artifact Registry + Pulumi.
 */
export class GcpCloudRunAdapter implements DeployAdapter {
  readonly id = "gcp-cloudrun";

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "gcp" && deployStrategy === "managed";
  }

  /**
   * Push Docker image to GCP Artifact Registry.
   *
   * Uses the shared pushToGcpArtifactRegistry helper with Cloud Run-specific
   * API enablement (run.googleapis.com) and wait time (10s for API propagation).
   */
  async pushImage(ctx: AdapterContext, localImage: string): Promise<PushImageResult> {
    return pushToGcpArtifactRegistry(ctx, localImage, {
      apisToEnable: ["run.googleapis.com"],
      apiWaitMs: 10_000,
    });
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
    _ctx: AdapterContext,
    _envVars: Array<{ name: string; value: string }>,
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
      credential,
      event,
      runCmd,
      appendLog,
      readFile: readFs,
      writeFile: writeFs,
    } = ctx;

    if (!event.tofuScript) {
      throw new Error("No Pulumi program provided. Generate infrastructure code first, then deploy.");
    }

    const serviceAccountKey = toGcpServiceAccountKey(credential);

    // Set up Pulumi workspace, install deps, init stack, set resourceSuffix
    const { pulumiDir, providerEnv, stackName } = await setupAndInitPulumiStack({
      workDir,
      repoName,
      shortId,
      region,
      credential,
      indexTs: event.tofuScript,
      runCmd,
      appendLog,
    });

    // Set GCP project config
    const gcpProjectId = getGcpProjectId(serviceAccountKey);
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

    // Replace user-provided env vars and DB credential placeholders in the Pulumi program
    {
      const indexPath = join(pulumiDir, "index.ts");
      let program = await readFs(indexPath, "utf-8");
      program = replacePulumiPlaceholders(program, ctx.state.pendingEnvVars || []);
      await writeFs(indexPath, program, "utf-8");
    }

    // Restore state from previous deployment
    const { data: prevDeploy } = await db
      .from("deployments")
      .select("tofu_script")
      .eq("repo", event.repo)
      .eq("provider_id", event.providerId)
      .eq("deploy_strategy", event.deployStrategy)
      .neq("id", deploymentId)
      .in("status", ["success", "failed"])
      .like("tofu_script", "%/* STATE */%")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
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
        const accessToken = await getGcpAccessToken(serviceAccountKey);

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
      } catch (e: unknown) {
        await appendLog(`⚠ Cloud Run import check: ${getErrMsg(e)} (continuing)`);
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
      appUrl = await readPulumiOutput({ pulumiDir, providerEnv, name: "appUrl", runCmd });
      if (appUrl && !appUrl.startsWith("http")) {
        appUrl = `https://${appUrl}`;
      }
      await appendLog(`  appUrl = ${appUrl || "(not found)"}`);
    } catch (e: unknown) {
      await appendLog(`  (could not parse outputs: ${getErrMsg(e)})`);
    }

    // Store pulumiDir and providerEnv for runPostDeploy
    ctx.state.pulumiDir = pulumiDir;
    ctx.state.providerEnv = providerEnv;

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
    const pulumiDir = ctx.state.pulumiDir || provision.outputs.pulumiDir;
    const providerEnv = ctx.state.providerEnv
      || JSON.parse(provision.outputs.providerEnvJson || "{}");

    await savePulumiState({
      deploymentId,
      tofuScript: event.tofuScript,
      pulumiDir,
      providerEnv,
      runCmd,
      updateTofuScript: async (id, script) => {
        await db.from("deployments").update({ tofu_script: script }).eq("id", id);
      },
    });
  }

  async destroy(ctx: DestroyContext): Promise<DestroyResult> {
    const errors: string[] = [];
    const serviceAccountKey = toGcpServiceAccountKey(ctx.credential);
    const gcpProjectId = getGcpProjectId(serviceAccountKey);
    const accessToken = await getGcpAccessToken(serviceAccountKey);
    const arRepo = ctx.repoName.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
    const arRegion = extractRegionFromScript(ctx.tofuScript) || ctx.region || "us-central1";

    await ctx.appendLog("── Destroy GCP Cloud Run Resources ─");

    const stateMarker = ctx.tofuScript.indexOf("/* STATE */\n");

    // If we have Pulumi state, use pulumi destroy
    if (stateMarker !== -1) {
      errors.push(...await destroyPulumiStack(ctx, stateMarker));
    } else if (accessToken && gcpProjectId) {
      // No-state fallback: delete resources via direct API calls
      const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

      // Delete Cloud Run service
      const serviceNameMatch = ctx.tofuScript.match(/new gcp\.cloudrunv2\.Service\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
      const serviceName = serviceNameMatch?.[1] || arRepo;
      try {
        const res = await fetch(`https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${arRegion}/services/${serviceName}`, { method: "DELETE", headers: authHeaders });
        if (!res.ok && res.status !== 404) errors.push(`Cloud Run delete: ${res.status} ${(await res.text()).slice(0, 150)}`);
      } catch (e: unknown) { errors.push(`Cloud Run delete: ${getErrMsg(e)}`); }

      // Delete Cloud SQL instance if present
      const dbMatch = ctx.tofuScript.match(/new gcp\.sql\.DatabaseInstance\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
      if (dbMatch) {
        try {
          const res = await fetch(`https://sqladmin.googleapis.com/v1/projects/${gcpProjectId}/instances/${dbMatch[1]}`, { method: "DELETE", headers: authHeaders });
          if (!res.ok && res.status !== 404) errors.push(`Cloud SQL delete: ${res.status} ${(await res.text()).slice(0, 150)}`);
        } catch (e: unknown) { errors.push(`Cloud SQL delete: ${getErrMsg(e)}`); }
      }
    }

    // Clean up Artifact Registry repo (force deletes all images)
    if (accessToken && gcpProjectId) {
      const arBase = `https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories/${arRepo}`;
      try {
        const deleteRes = await fetch(`${arBase}?force=true`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
        if (!deleteRes.ok && deleteRes.status !== 404) errors.push(`AR repo delete: ${deleteRes.status} ${(await deleteRes.text()).slice(0, 150)}`);
      } catch (e: unknown) { errors.push(`AR repo delete: ${getErrMsg(e)}`); }
    }

    return {
      success: errors.length === 0,
      message: errors.length > 0 ? `Partially destroyed: ${errors.join("; ")}` : "Cloud Run resources destroyed",
      errors,
    };
  }

}
