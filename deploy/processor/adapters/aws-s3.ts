import { join, extname } from "node:path";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
  DestroyContext,
  DestroyResult,
} from "./types";
import {
  getAwsAccountId,
  cleanupStuckStack,
  createOrUpdateStack,
  pollStackStatus,
  waitForStackDelete,
  type AwsCredentials,
} from "../aws-helpers";

/**
 * AWS S3 + CloudFront adapter.
 *
 * Handles static site deployments to AWS S3 with CloudFront CDN.
 * No Docker image is needed — the adapter builds the static site locally,
 * uploads the output files to an S3 bucket, and provisions a CloudFront
 * distribution using the s3.yml CloudFormation template.
 */
export class AwsS3Adapter implements DeployAdapter {
  readonly id = "aws-s3";

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "aws" && deployStrategy === "static";
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
   * Build static site, upload to S3, and provision CloudFront via CloudFormation.
   *
   * Steps:
   * 1. Get AWS account ID via STS
   * 2. Build the static site locally using the detected package manager
   * 3. Identify the output directory (dist, build, out, .output/public, etc.)
   * 4. Create S3 bucket if it doesn't exist
   * 5. Sync static files to S3 with correct content types and cache headers
   * 6. Read the s3.yml CloudFormation template
   * 7. Upload template to S3
   * 8. Create or update CloudFormation stack with parameters
   * 9. Handle ROLLBACK_COMPLETE state
   * 10. Poll stack status
   * 11. Extract AppUrl (CloudFront domain) from stack outputs
   */
  async provisionInfrastructure(
    ctx: AdapterContext,
    _imageUri: string,
  ): Promise<ProvisionResult> {
    const { deploymentId, repoName, repoDir, region, providerCredentials, appendLog } =
      ctx;

    const accessKeyId = providerCredentials.apiKey;
    const secretAccessKey = providerCredentials.apiSecret;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS credentials not configured on provider.");
    }

    const credentials: AwsCredentials = { accessKeyId, secretAccessKey };

    // 1. Get AWS account ID via STS
    await appendLog("── AWS S3 Static Site Deploy ──────");
    const accountId = await getAwsAccountId(region, credentials);
    if (!accountId) {
      throw new Error("Could not determine AWS account ID from credentials");
    }
    await appendLog("ℹ Static site — skipping Docker build");

    // 2. Build the static site locally
    await appendLog("── Build Static Site ──────────────");
    await this.buildStaticSite(ctx);

    // 3. Identify the output directory
    const uploadDir = this.findBuildOutputDir(repoDir);
    await appendLog(`ℹ Build output: ${uploadDir.replace(repoDir, ".")}`);

    // 4. Create S3 bucket if it doesn't exist
    const websiteBucket = `${repoName}-static-site`;
    await appendLog("── Upload to S3 ───────────────────");

    const { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } = await import(
      "@aws-sdk/client-s3"
    );
    const s3 = new S3Client({ region, credentials });

    try {
      await s3.send(new HeadBucketCommand({ Bucket: websiteBucket }));
      await appendLog("✓ S3 bucket already exists");
    } catch {
      try {
        // us-east-1 doesn't accept a LocationConstraint
        const createParams: any = { Bucket: websiteBucket };
        if (region !== "us-east-1") {
          createParams.CreateBucketConfiguration = { LocationConstraint: region };
        }
        await s3.send(new CreateBucketCommand(createParams));
        await appendLog("✓ S3 bucket created");
      } catch (bucketErr: any) {
        // BucketAlreadyOwnedByYou is fine
        if (!bucketErr.name?.includes("BucketAlreadyOwnedByYou")) {
          throw new Error(`Failed to create S3 bucket: ${bucketErr.message}`);
        }
        await appendLog("✓ S3 bucket already exists");
      }
    }

    // 5. Sync static files to S3 with correct content types and cache headers
    await this.syncFilesToS3(s3, websiteBucket, uploadDir, appendLog);

    // 6. Read the s3.yml CloudFormation template
    await appendLog("── CloudFormation Deploy ──────────");
    let templateBody: string;
    try {
      const templatePath = join(
        __dirname,
        "..",
        "..",
        "..",
        "image-builder",
        "deploy-templates",
        "s3.yml",
      );
      templateBody = readFileSync(templatePath, "utf-8");
    } catch {
      // Fallback: try relative to process.cwd()
      const templatePath = join(process.cwd(), "image-builder", "deploy-templates", "s3.yml");
      templateBody = readFileSync(templatePath, "utf-8");
    }

    // 7. Upload template to S3
    const codebuildProject = "image-builder";
    const templateBucket = `${codebuildProject}-templates-${accountId}`;
    const templateKey = "s3.yml";

    await s3.send(
      new PutObjectCommand({
        Bucket: templateBucket,
        Key: templateKey,
        Body: templateBody,
        ContentType: "text/yaml",
      }),
    );
    const templateUrl = `https://${templateBucket}.s3.amazonaws.com/${templateKey}`;
    await appendLog("✓ Template uploaded to S3");

    // 8. Build CloudFormation parameters
    const stackName = `${codebuildProject}-app-${repoName.replace(/[^a-zA-Z0-9-]/g, "-")}`;
    const params = [
      { ParameterKey: "AppName", ParameterValue: repoName },
      { ParameterKey: "SourceBucket", ParameterValue: websiteBucket },
      { ParameterKey: "BuildId", ParameterValue: deploymentId },
    ];

    // 9. Create or update CloudFormation stack
    const { CloudFormationClient } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({ region, credentials });

    await cleanupStuckStack(cfn, stackName, appendLog);

    const { isUpdate, noUpdatesResult } = await createOrUpdateStack({
      cfn,
      stackName,
      templateUrl,
      params,
      deploymentId,
      appendLog,
    });

    if (noUpdatesResult) return noUpdatesResult;

    // 10. Poll stack status
    return await pollStackStatus({ cfn, stackName, isUpdate, appendLog });
  }

  /**
   * No additional post-deploy steps for S3 static sites.
   * Files are already uploaded and CloudFront is provisioned during provisionInfrastructure.
   */
  async runPostDeploy(_ctx: AdapterContext, _provision: ProvisionResult): Promise<void> {
    // Static files are uploaded during provisionInfrastructure — nothing to do here
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Build the static site locally using the detected package manager.
   */
  private async buildStaticSite(ctx: AdapterContext): Promise<void> {
    const { repoDir, event, runCmd, appendLog } = ctx;
    const packageManager = ("packageManager" in ctx.detectedStack ? ctx.detectedStack.packageManager : null) || "npm";

    // Install dependencies
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

    if (installOk) {
      await appendLog("✓ Dependencies installed");
    } else {
      await appendLog("⚠ Dependency installation had issues — attempting build anyway");
    }

    // Build the static site
    await appendLog("ℹ Building static site...");

    const isNuxt = event.techStack.some((t) => t.toLowerCase().includes("nuxt"));
    const isNext = event.techStack.some((t) => t.toLowerCase().includes("next"));
    let buildOk = false;

    if (isNuxt) {
      const genResult = await runCmd("npx", ["nuxt", "generate"], {
        cwd: repoDir,
        env: { NITRO_PRESET: "static" },
      });
      if (genResult.code === 0) {
        buildOk = true;
        await appendLog("✓ Nuxt static site generated");
      } else {
        await appendLog("ℹ nuxt generate failed, falling back to npm run build...");
        const buildRes = await runCmd("npm", ["run", "build"], { cwd: repoDir });
        buildOk = buildRes.code === 0;
        if (buildOk) await appendLog("✓ Nuxt site built");
      }
    } else if (isNext) {
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
  }

  /**
   * Find the build output directory from the repo.
   * Checks common framework output directories in priority order.
   */
  private findBuildOutputDir(repoDir: string): string {

    const possibleDirs = [
      ".output/public", // Nuxt
      "out",            // Next.js
      "dist",           // Vite (React/Vue/Svelte), Astro, Angular
      "build",          // Create React App, SvelteKit
      ".next/out",      // Next.js (older)
      "output",         // Generic
      "public",         // Hugo, some configs
    ];

    // Prefer a dir that has index.html
    for (const dir of possibleDirs) {
      const candidate = join(repoDir, dir);
      if (existsSync(join(candidate, "index.html"))) {
        return candidate;
      }
    }

    // If none had index.html, pick the first that exists
    for (const dir of possibleDirs) {
      if (existsSync(join(repoDir, dir))) {
        return join(repoDir, dir);
      }
    }

    // For Angular, check dist/<project-name>/browser or dist/<project-name>
    if (existsSync(join(repoDir, "dist"))) {
      const distEntries = readdirSync(join(repoDir, "dist"));
      for (const entry of distEntries) {
        const candidate = join(repoDir, "dist", entry);
        if (statSync(candidate).isDirectory()) {
          if (existsSync(join(candidate, "browser", "index.html"))) {
            return join(candidate, "browser");
          }
          if (existsSync(join(candidate, "index.html"))) {
            return candidate;
          }
        }
      }
    }

    // Fallback to repo root
    return repoDir;
  }

  /**
   * Sync files from a local directory to an S3 bucket.
   * Uploads with correct MIME types and cache headers:
   * - HTML files: no-cache (always revalidate)
   * - All other files: long-lived immutable cache (1 year)
   */
  private async syncFilesToS3(
    s3: any,
    bucket: string,
    uploadDir: string,
    appendLog: (line: string) => Promise<void>,
  ): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");

    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".mjs": "application/javascript",
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
      ".eot": "application/vnd.ms-fontobject",
      ".txt": "text/plain",
      ".xml": "application/xml",
      ".webp": "image/webp",
      ".avif": "image/avif",
      ".map": "application/json",
      ".webmanifest": "application/manifest+json",
    };

    const skipDirs = new Set([
      "node_modules",
      ".git",
      ".nuxt",
      ".output",
      ".next",
      ".cache",
      "__pycache__",
    ]);

    let fileCount = 0;

    const uploadRecursive = async (dir: string, prefix: string) => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (skipDirs.has(entry)) continue;

        const fullPath = join(dir, entry);
        const objectKey = prefix ? `${prefix}/${entry}` : entry;

        if (statSync(fullPath).isDirectory()) {
          await uploadRecursive(fullPath, objectKey);
        } else {
          const content = readFileSync(fullPath);
          const ext = extname(fullPath).toLowerCase();
          const contentType = mimeTypes[ext] || "application/octet-stream";

          // HTML files get no-cache, everything else gets long-lived immutable cache
          const isHtml = ext === ".html";
          const cacheControl = isHtml
            ? "no-cache"
            : "public, max-age=31536000, immutable";

          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: objectKey,
              Body: content,
              ContentType: contentType,
              CacheControl: cacheControl,
            }),
          );
          fileCount++;
        }
      }
    };

    await uploadRecursive(uploadDir, "");
    await appendLog(`✓ ${fileCount} files uploaded to s3://${bucket}`);
  }

  async destroy(ctx: DestroyContext): Promise<DestroyResult> {
    const errors: string[] = [];
    const credentials: AwsCredentials = { accessKeyId: ctx.providerCredentials.apiKey, secretAccessKey: ctx.providerCredentials.apiSecret };
    const stackName = `image-builder-app-${ctx.appName}`;

    await ctx.appendLog("── Destroy AWS S3 Resources ───────");

    // Delete CloudFormation stack (fire and forget — CloudFront distributions take 15-20 min to delete)
    try {
      const { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
      const cfn = new CloudFormationClient({ region: ctx.region, credentials });
      try {
        await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
        await cfn.send(new DeleteStackCommand({ StackName: stackName }));
        await ctx.appendLog(`✓ Stack deletion initiated: ${stackName}`);
      } catch (e: any) { if (!e.message?.includes("does not exist")) throw e; }
    } catch (e: any) { errors.push(`CloudFormation: ${e.message}`); }

    // Delete S3 static site bucket (empty objects first, do this before stack finishes deleting)
    try {
      const { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({ region: ctx.region, credentials });
      const bucketName = `${ctx.appName}-static-site`;
      let continuationToken: string | undefined;
      do {
        const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucketName, ContinuationToken: continuationToken }));
        if (listed.Contents && listed.Contents.length > 0) {
          await s3.send(new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: listed.Contents.map(o => ({ Key: o.Key! })) } }));
        }
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (continuationToken);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
      await ctx.appendLog(`✓ S3 bucket ${bucketName} deleted`);
    } catch {}

    return {
      success: errors.length === 0,
      message: errors.length > 0 ? `Partially destroyed: ${errors.join("; ")}` : `Destroyed stack ${stackName}, S3 bucket`,
      errors,
    };
  }
}
