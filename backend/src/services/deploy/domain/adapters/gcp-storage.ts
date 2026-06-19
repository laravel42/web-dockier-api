/* eslint-disable @typescript-eslint/no-explicit-any */
import { join } from "node:path";
import { supabaseAdmin } from "../../../../shared/supabase/client.js";

const db = supabaseAdmin;
import {
  getGcpAccessToken,
  getGcpProjectId,
  enableGcpApis,
} from "../gcp-helpers.js";
import {
  setupPulumiWorkspace,
  restorePulumiState,
  savePulumiState,
} from "../pulumi-workspace.js";
import { installDeps, buildSite, findOutputDir, ensureIndexHtml, getMimeType, SKIP_DIRS } from "../static-site-builder.js";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
  DestroyContext,
  DestroyResult,
} from "./types.js";
import { runCmd } from "../run-cmd.js";

/**
 * GCP Cloud Storage + CDN adapter.
 *
 * Handles static site deployments to GCP Cloud Storage with a CDN frontend.
 * No Docker image is needed — the adapter builds the static site locally
 * and uploads the output files to a GCS bucket via the GCS JSON API.
 */
export class GcpStorageAdapter implements DeployAdapter {
  readonly id = "gcp-storage";

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "gcp" && deployStrategy === "static";
  }

  /**
   * No Docker image needed for static sites.
   */
  async pushImage(_ctx: AdapterContext, _localImage: string): Promise<PushImageResult> {
    return { skipped: true, remoteImageUri: "" };
  }

  /**
   * No-op for static sites — there is no container to inject env vars into.
   */
  async injectEnvVars(
    _ctx: AdapterContext,
    _envVars: Array<{ name: string; value: string }>,
  ): Promise<void> {
    // Static sites have no runtime container, so env var injection is a no-op.
  }

  /**
   * Provision GCS bucket + CDN infrastructure via Pulumi.
   *
   * Steps:
   * 1. Get GCP access token and project ID from service account key
   * 2. Enable `compute.googleapis.com` API
   * 3. Set up Pulumi workspace with GCP credentials
   * 4. Install npm dependencies, init stack, set resourceSuffix
   * 5. Set GCP project config
   * 6. Restore previous Pulumi state if available
   * 7. Run `pulumi up` with 404/409 retry
   * 8. Extract cdnIp, appUrl, and bucketName from outputs
   */
  async provisionInfrastructure(
    ctx: AdapterContext,
    _imageUri: string,
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
    } = ctx;

    if (!event.tofuScript) {
      throw new Error("No Pulumi program provided. Generate infrastructure code first, then deploy.");
    }

    // Get GCP credentials
    const gcpProjectId = getGcpProjectId(providerCredentials.apiKey);
    if (!gcpProjectId) {
      throw new Error("Could not determine GCP project ID from service account key");
    }

    // Enable Compute Engine API (required for CDN / load balancer resources)
    await appendLog("── GCP Static Site Setup ──────────");
    const gcpAccessToken = await getGcpAccessToken(providerCredentials.apiKey);
    if (gcpAccessToken) {
      await enableGcpApis(gcpProjectId, gcpAccessToken, ["compute.googleapis.com"]);
      await appendLog("✓ Compute Engine API enabled");
    }
    await appendLog("ℹ Static site — skipping Docker build");

    // Set up Pulumi workspace
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

    // Set GCP project config
    await runCmd(
      "pulumi",
      ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"],
      { cwd: pulumiDir, env: providerEnv },
    );

    // Restore state from previous deployment (prefer successful, fall back to failed with partial state)
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
      await runCmd(
        "pulumi",
        ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
      await runCmd(
        "pulumi",
        ["config", "set", "resourceSuffix", shortId, "--non-interactive"],
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
    let cdnIp = "";
    let bucketName = "";
    try {
      const cdnResult = await runCmd(
        "pulumi",
        ["stack", "output", "cdnIp", "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
      cdnIp =
        cdnResult.output
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

      if (!appUrl && cdnIp) appUrl = `http://${cdnIp}`;
      if (appUrl && !appUrl.startsWith("http")) appUrl = `http://${appUrl}`;

      await appendLog(`  cdnIp = ${cdnIp || "(not found)"}`);
      await appendLog(`  appUrl = ${appUrl || "(not found)"}`);

      // Get bucket name for file upload in runPostDeploy
      const bucketResult = await runCmd(
        "pulumi",
        ["stack", "output", "bucketName", "--non-interactive"],
        { cwd: pulumiDir, env: providerEnv },
      );
      bucketName =
        bucketResult.output
          .trim()
          .split("\n")
          .pop()
          ?.trim() || "";
      await appendLog(`  bucketName = ${bucketName || "(not found)"}`);
    } catch (e: any) {
      await appendLog(`  (could not parse outputs: ${e.message})`);
    }

    // Store pulumiDir and providerEnv for runPostDeploy
    ctx.state.pulumiDir = pulumiDir;
    ctx.state.providerEnv = providerEnv;

    return {
      appUrl,
      outputs: {
        pulumiDir,
        providerEnvJson: JSON.stringify(providerEnv),
        cdnIp,
        bucketName,
      },
    };
  }

  /**
   * Build the static site locally and upload files to GCS bucket.
   *
   * Steps:
   * 1. Get GCS upload token
   * 2. Install dependencies using the detected package manager (npm/pnpm/yarn)
   * 3. Build the static site (framework-specific: Nuxt generate, Next.js export, generic npm run build)
   * 4. Identify the output directory (.output/public, dist, build, out, etc.)
   * 5. Ensure index.html exists (fall back to 200.html for Nuxt SPA)
   * 6. Upload files recursively to GCS bucket using the GCS JSON API
   * 7. Save Pulumi state to DB
   */
  async runPostDeploy(ctx: AdapterContext, provision: ProvisionResult): Promise<void> {
    const {
      deploymentId,
      repoDir,
      providerCredentials,
      event,
      runCmd,
      appendLog,
    } = ctx;

    const pulumiDir = ctx.state.pulumiDir || provision.outputs.pulumiDir;
    const providerEnv = ctx.state.providerEnv
      || JSON.parse(provision.outputs.providerEnvJson || "{}");
    const gcsBucket = provision.outputs.bucketName || "";

    // Upload static files to GCS bucket
    await appendLog("── Upload Static Files to GCS ─────");
    try {
      if (!gcsBucket) {
        await appendLog("⚠ Could not determine bucket name from Pulumi outputs");
      } else {
        // Get access token for GCS upload
        const uploadToken = await getGcpAccessToken(
          providerCredentials.apiKey,
          "https://www.googleapis.com/auth/devstorage.read_write",
        );

        if (!uploadToken) {
          await appendLog("⚠ Could not get upload token — files not uploaded");
        } else {
          // Detect package manager from the context
          const packageManager = ("packageManager" in ctx.detectedStack ? ctx.detectedStack.packageManager : null) || "npm";

          // Install dependencies and build the static site
          await installDeps({ repoDir, packageManager, runCmd, appendLog });
          await buildSite({ repoDir, techStack: event.techStack || [], runCmd, appendLog, packageManager });

          // Find the build output directory
          const uploadDir = findOutputDir(repoDir);

          // Ensure index.html exists
          await ensureIndexHtml(uploadDir, appendLog);

          await appendLog(`ℹ Uploading from: ${uploadDir.replace(repoDir, ".")}`);

          // Upload files recursively using GCS JSON API
          const { readdirSync, statSync, readFileSync } = await import("node:fs");

          const uploadFile = async (filePath: string, objectName: string) => {
            const content = readFileSync(filePath);
            const contentType = getMimeType(filePath);
            await fetch(
              `https://storage.googleapis.com/upload/storage/v1/b/${gcsBucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${uploadToken}`,
                  "Content-Type": contentType,
                },
                body: content,
              },
            );
          };

          const filesToUpload: Array<{ fullPath: string; objectName: string }> = [];
          const collectFiles = (dir: string, prefix: string) => {
            const entries = readdirSync(dir);
            for (const entry of entries) {
              if (SKIP_DIRS.has(entry)) continue;
              const fullPath = join(dir, entry);
              const objectName = prefix ? `${prefix}/${entry}` : entry;
              if (statSync(fullPath).isDirectory()) {
                collectFiles(fullPath, objectName);
              } else {
                filesToUpload.push({ fullPath, objectName });
              }
            }
          };
          collectFiles(uploadDir, "");

          const concurrencyLimit = 10;
          for (let i = 0; i < filesToUpload.length; i += concurrencyLimit) {
            const batch = filesToUpload.slice(i, i + concurrencyLimit);
            await Promise.all(batch.map((file) => uploadFile(file.fullPath, file.objectName)));
          }
          await appendLog(`✓ Static files uploaded to gs://${gcsBucket}`);
        }
      }
    } catch (e: any) {
      await appendLog(`⚠ Static file upload error: ${e.message}`);
    }


    // Save Pulumi state to DB
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
    const gcpProjectId = getGcpProjectId(ctx.providerCredentials.apiKey);
    const accessToken = await getGcpAccessToken(ctx.providerCredentials.apiKey);
    const stateMarker = ctx.tofuScript.indexOf("/* STATE */\n");

    await ctx.appendLog("── Destroy GCP Storage + CDN ──────");

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
    } else if (accessToken && gcpProjectId) {
      // No-state fallback: delete GCS bucket + CDN resources via API
      const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

      // Delete GCS bucket
      const bucketPattern = /new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s;
      const bucketMatch = ctx.tofuScript.match(bucketPattern);
      const bucketName = bucketMatch?.[1] || bucketMatch?.[2];
      if (bucketName) {
        try {
          let pageToken: string | undefined;
          do {
            const listUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o` + (pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "");
            const listRes = await fetch(listUrl, { headers: authHeaders });
            if (!listRes.ok) break;
            const objData = await listRes.json() as { items?: { name: string }[]; nextPageToken?: string };
            const items = objData.items || [];
            const concurrencyLimit = 10;
            for (let i = 0; i < items.length; i += concurrencyLimit) {
              const batch = items.slice(i, i + concurrencyLimit);
              await Promise.all(
                batch.map((obj) =>
                  fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(obj.name)}`, {
                    method: "DELETE",
                    headers: authHeaders,
                  }),
                ),
              );
            }
            pageToken = objData.nextPageToken;
          } while (pageToken);
          const deleteRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}`, { method: "DELETE", headers: authHeaders });
          if (!deleteRes.ok && deleteRes.status !== 404) errors.push(`Bucket delete: ${(await deleteRes.text()).slice(0, 150)}`);
        } catch (e: any) { errors.push(`Bucket delete: ${e.message}`); }
      }

      // Delete CDN / LB resources
      const resourceTypes = ["globalForwardingRules", "targetHttpProxies", "urlMaps", "backendBuckets", "globalAddresses"];
      const resourcePatterns: Record<string, RegExp> = {
        globalForwardingRules: /new gcp\.compute\.GlobalForwardingRule\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s,
        targetHttpProxies: /new gcp\.compute\.TargetHttpProxy\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s,
        urlMaps: /new gcp\.compute\.URLMap\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s,
        backendBuckets: /new gcp\.compute\.BackendBucket\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s,
        globalAddresses: /new gcp\.compute\.GlobalAddress\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s,
      };

      for (const type of resourceTypes) {
        const match = ctx.tofuScript.match(resourcePatterns[type]);
        if (!match) continue;
        const name = (match[1] || match[2] || "").replace(/\$\{[^}]+\}/g, "").replace(/-+$/, "");
        if (!name) continue;
        try {
          const listRes = await fetch(`https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/global/${type}`, { headers: authHeaders });
          if (listRes.ok) {
            const listData = await listRes.json() as { items?: { name: string }[] };
            const matching = (listData.items || []).filter((r: { name: string }) => r.name.startsWith(name));
            const results = await Promise.allSettled(
              matching.map(async (r) => {
                const delRes = await fetch(`https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/global/${type}/${r.name}`, { method: "DELETE", headers: authHeaders });
                if (!delRes.ok && delRes.status !== 404) errors.push(`${type} delete ${r.name}: ${(await delRes.text()).slice(0, 150)}`);
              })
            );
            for (const result of results) {
              if (result.status === "rejected") errors.push(`${type} delete: ${result.reason?.message || "Unknown error"}`);
            }
          }
        } catch (e: any) { errors.push(`${type} delete: ${e.message}`); }
      }
    } else {
      await ctx.appendLog("⚠ No Pulumi state and no GCP credentials — marked as destroyed");
    }

    return {
      success: errors.length === 0,
      message: errors.length > 0 ? `Partially destroyed: ${errors.join("; ")}` : "Cloud Storage + CDN resources destroyed",
      errors,
    };
  }
}
