import { join } from "node:path";
import { db, extractRegionFromScript } from "../../shared";
import {
  getGcpAccessToken,
  getGcpProjectId,
  enableGcpApis,
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
    (ctx as any)._pulumiDir = pulumiDir;
    (ctx as any)._providerEnv = providerEnv;

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

    const pulumiDir = (ctx as any)._pulumiDir || provision.outputs.pulumiDir;
    const providerEnv = (ctx as any)._providerEnv
      ? (ctx as any)._providerEnv
      : JSON.parse(provision.outputs.providerEnvJson || "{}");
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

          // Install dependencies using the detected package manager
          await appendLog("ℹ Installing dependencies...");
          let installOk = false;
          if (packageManager === "pnpm") {
            const result = await runCmd("pnpm", ["install", "--frozen-lockfile"], { cwd: repoDir });
            installOk = result.code === 0;
            if (!installOk) {
              await appendLog("⚠ pnpm install --frozen-lockfile failed, trying pnpm install...");
              const fallback = await runCmd("pnpm", ["install"], { cwd: repoDir });
              installOk = fallback.code === 0;
            }
          } else if (packageManager === "yarn") {
            const result = await runCmd("yarn", ["install", "--frozen-lockfile"], { cwd: repoDir });
            installOk = result.code === 0;
            if (!installOk) {
              await appendLog("⚠ yarn install --frozen-lockfile failed, trying yarn install...");
              const fallback = await runCmd("yarn", ["install"], { cwd: repoDir });
              installOk = fallback.code === 0;
            }
          } else {
            // Default to npm
            const result = await runCmd("npm", ["ci"], { cwd: repoDir });
            installOk = result.code === 0;
            if (!installOk) {
              await appendLog("⚠ npm ci failed, trying npm install...");
              const fallback = await runCmd("npm", ["install"], { cwd: repoDir });
              installOk = fallback.code === 0;
            }
          }

          // Build the static site
          await appendLog("ℹ Building static site...");
          const { existsSync, writeFileSync, readdirSync, statSync, readFileSync, copyFileSync, mkdirSync } = await import("node:fs");
          const { extname } = await import("node:path");
          const isNuxt = event.techStack.some((t) => t.toLowerCase().includes("nuxt"));
          const isNext = event.techStack.some((t) => t.toLowerCase().includes("next"));

          // ── Step 1: Build the project ──
          // Each framework has its own build command and output directory.
          // We try the most specific approach first, then fall back to generic `npm run build`.
          let buildOk = false;

          if (isNuxt) {
            // Nuxt: try `nuxt generate` for full SSG, fall back to normal build for SPA
            const genResult = await runCmd("npx", ["nuxt", "generate"], {
              cwd: repoDir,
              env: { NITRO_PRESET: "static" },
            });
            if (genResult.code === 0) {
              buildOk = true;
              await appendLog("✓ Nuxt static site generated");
            } else {
              await appendLog("ℹ nuxt generate failed (likely API deps), building as SPA...");
              // Save the 200.html produced by the failed generate — it has correct script/link tags
              const outputPublicDir = join(repoDir, ".output/public");
              const saved200 = existsSync(join(outputPublicDir, "200.html"))
                ? readFileSync(join(outputPublicDir, "200.html"), "utf-8")
                : null;
              // Normal build produces client assets without triggering prerender
              const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
              if (
                buildRes.code === 0 ||
                existsSync(join(outputPublicDir, "_nuxt")) ||
                existsSync(join(repoDir, ".nuxt/dist/client/_nuxt"))
              ) {
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
                  writeFileSync(join(outputPublicDir, "index.html"), saved200, "utf-8");
                }
                buildOk = existsSync(join(outputPublicDir, "_nuxt"));
                if (buildOk) await appendLog("✓ Nuxt SPA built");
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
              await appendLog("✓ Next.js static site built");
            }
          }

          // Generic fallback for React (CRA/Vite), Vue, Svelte, Angular, Astro, etc.
          if (!buildOk) {
            const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
            if (buildRes.code === 0) {
              buildOk = true;
              await appendLog("✓ Static site built");
            } else {
              // Last resort: try generate script if it exists
              const genRes = await runCmd("npm", ["run", "generate", "--if-present"], { cwd: repoDir });
              if (genRes.code === 0) {
                buildOk = true;
                await appendLog("✓ Static site generated");
              } else {
                await appendLog("⚠ Build failed — uploading source files as fallback");
              }
            }
          }

          // ── Step 2: Find the build output directory ──
          // Frameworks output to different directories:
          //   Nuxt: .output/public    Next.js: out         Astro: dist
          //   React/Vue/Svelte: dist  Angular: dist/<name>  SvelteKit: build
          const possibleDirs = [
            ".output/public", // Nuxt
            "out",            // Next.js
            "dist",           // Vite (React/Vue/Svelte), Astro, Angular
            "build",          // Create React App, SvelteKit
            ".next/out",      // Next.js (older)
            "output",         // Generic
            "public",         // Hugo, some configs
          ];
          let uploadDir = repoDir;
          // Prefer a dir that has index.html
          for (const dir of possibleDirs) {
            const candidate = join(repoDir, dir);
            if (existsSync(join(candidate, "index.html"))) {
              uploadDir = candidate;
              break;
            }
          }
          // If none had index.html, pick the first that exists
          if (uploadDir === repoDir) {
            for (const dir of possibleDirs) {
              if (existsSync(join(repoDir, dir))) {
                uploadDir = join(repoDir, dir);
                break;
              }
            }
          }
          // For Angular, check dist/<project-name>/browser or dist/<project-name>
          if (uploadDir === repoDir && existsSync(join(repoDir, "dist"))) {
            const distEntries = readdirSync(join(repoDir, "dist"));
            for (const entry of distEntries) {
              const candidate = join(repoDir, "dist", entry);
              if (statSync(candidate).isDirectory()) {
                if (existsSync(join(candidate, "browser", "index.html"))) {
                  uploadDir = join(candidate, "browser");
                  break;
                }
                if (existsSync(join(candidate, "index.html"))) {
                  uploadDir = candidate;
                  break;
                }
              }
            }
          }

          // ── Step 3: Ensure index.html exists ──
          if (!existsSync(join(uploadDir, "index.html"))) {
            // Check for 200.html (Nuxt SPA fallback)
            if (existsSync(join(uploadDir, "200.html"))) {
              copyFileSync(join(uploadDir, "200.html"), join(uploadDir, "index.html"));
              await appendLog("✓ Using 200.html as index.html");
            } else {
              await appendLog("⚠ No index.html found in build output");
            }
          }

          await appendLog(`ℹ Uploading from: ${uploadDir.replace(repoDir, ".")}`);

          // ── Step 4: Upload files recursively using GCS JSON API ──
          const mimeTypes: Record<string, string> = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ttf": "font/ttf",
            ".txt": "text/plain",
            ".xml": "application/xml",
            ".webp": "image/webp",
            ".map": "application/json",
          };

          const uploadFile = async (filePath: string, objectName: string) => {
            const content = readFileSync(filePath);
            const ext = extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || "application/octet-stream";
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

          const uploadDirRecursive = async (dir: string, prefix: string) => {
            const entries = readdirSync(dir);
            for (const entry of entries) {
              // Skip non-deployable directories
              if (
                ["node_modules", ".git", ".nuxt", ".output", ".next", ".cache", "__pycache__"].includes(
                  entry,
                )
              ) {
                continue;
              }
              const fullPath = join(dir, entry);
              const objectName = prefix ? `${prefix}/${entry}` : entry;
              if (statSync(fullPath).isDirectory()) {
                await uploadDirRecursive(fullPath, objectName);
              } else {
                await uploadFile(fullPath, objectName);
              }
            }
          };

          await uploadDirRecursive(uploadDir, "");
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
      db,
    });
  }
}
