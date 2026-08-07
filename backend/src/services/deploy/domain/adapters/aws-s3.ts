/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, extname } from "node:path";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { getS3, getCfn } from "../../../../lib/aws-sdk.js";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
  DestroyContext,
  DestroyResult,
} from "./types.js";
import {
  cleanupStuckStack,
  createOrUpdateStack,
  pollStackStatus,
  readCfnTemplate,
  destroyCfnStack,
} from "../infra/aws-helpers.js";
import { stackNameFor } from "../../../../lib/naming.js";
import { getAwsAccountId, type AwsCredentials } from "../../../../lib/aws.js";
import { installDeps, buildSite, findOutputDir, ensureIndexHtml, getStaticDeployBlockReason, MIME_TYPES, SKIP_DIRS } from "../planning/static-site-builder.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";

/**
 * Sanitize a name for use as an S3 bucket name.
 * S3 bucket naming rules:
 * - 3–63 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must start and end with a letter or number
 * - No consecutive periods or hyphens adjacent to periods
 */
function sanitizeBucketName(name: string): string {
  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")  // Replace invalid chars (underscores, dots, etc.) with hyphens
    .replace(/-{2,}/g, "-")        // Collapse consecutive hyphens
    .replace(/^-+|-+$/g, "");      // Trim leading/trailing hyphens

  // Ensure minimum length
  if (sanitized.length < 3) {
    sanitized = sanitized.padEnd(3, "0");
  }

  // Truncate to leave room for the "-static-site" suffix (63 - 12 = 51)
  if (sanitized.length > 51) {
    sanitized = sanitized.slice(0, 51).replace(/-+$/, "");
  }

  return sanitized;
}

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
    const blockReason = getStaticDeployBlockReason({
      detectedStack: ctx.detectedStack,
      repoDir,
      techStack: ctx.event.techStack || [],
    });
    if (blockReason) {
      throw new Error(blockReason);
    }

    const packageManager = ("packageManager" in ctx.detectedStack ? ctx.detectedStack.packageManager : null) || "npm";
    await installDeps({ repoDir, packageManager, runCmd: ctx.runCmd, appendLog });
    const buildOk = await buildSite({ repoDir, techStack: ctx.event.techStack || [], runCmd: ctx.runCmd, appendLog, packageManager });
    if (!buildOk) {
      throw new Error("Static site build failed. Fix build errors before deploying to S3.");
    }

    // 3. Identify the output directory
    const uploadDir = findOutputDir(repoDir);
    await appendLog(`ℹ Build output: ${uploadDir.replace(repoDir, ".")}`);

    const hasIndex = await ensureIndexHtml(uploadDir, appendLog);
    if (!hasIndex) {
      throw new Error(
        "No index.html in build output. Static S3 hosting requires exported HTML (e.g. Next.js output: 'export', Vite dist/, or Nuxt generate).",
      );
    }
    // 4. Create S3 bucket if it doesn't exist
    const websiteBucket = `${sanitizeBucketName(repoName)}-static-site`;
    await appendLog("── Upload to S3 ───────────────────");

    const { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, PutPublicAccessBlockCommand } = await import(
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
      } catch (bucketErr: unknown) {
        // BucketAlreadyOwnedByYou is fine
        if (!(bucketErr instanceof Error && bucketErr.name?.includes("BucketAlreadyOwnedByYou"))) {
          throw new Error(`Failed to create S3 bucket: ${getErrMsg(bucketErr)}`);
        }
        await appendLog("✓ S3 bucket already exists");
      }
    }

    // Allow CloudFormation to attach a bucket policy for CloudFront OAC access.
    // We keep BlockPublicAcls and IgnorePublicAcls true (no public ACLs), but
    // allow bucket policies so CloudFront can read via OAC.
    await s3.send(new PutPublicAccessBlockCommand({
      Bucket: websiteBucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }));

    // 5. Sync static files to S3 with correct content types and cache headers
    await this.syncFilesToS3(s3, websiteBucket, uploadDir, appendLog);

    // 6. Read the s3.yml CloudFormation template
    await appendLog("── CloudFormation Deploy ──────────");
    const templateBody = readCfnTemplate("s3.yml");

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
    const sanitizedName = sanitizeBucketName(repoName);
    const stackName = stackNameFor(repoName);
    const params = [
      { ParameterKey: "AppName", ParameterValue: sanitizedName },
      { ParameterKey: "SourceBucket", ParameterValue: websiteBucket },
      { ParameterKey: "BuildId", ParameterValue: deploymentId },
    ];

    // 9. Create or update CloudFormation stack
    const { CloudFormationClient } = await getCfn();
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
    const { PutObjectCommand } = await getS3();

    let fileCount = 0;
    const filesToUpload: Array<{ fullPath: string; objectKey: string }> = [];

    const collectFiles = (dir: string, prefix: string) => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;

        const fullPath = join(dir, entry);
        const objectKey = prefix ? `${prefix}/${entry}` : entry;

        if (statSync(fullPath).isDirectory()) {
          collectFiles(fullPath, objectKey);
        } else {
          filesToUpload.push({ fullPath, objectKey });
        }
      }
    };

    collectFiles(uploadDir, "");

    const uploadFile = async (file: { fullPath: string; objectKey: string }) => {
      const content = readFileSync(file.fullPath);
      const ext = extname(file.fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      const isHtml = ext === ".html";
      const cacheControl = isHtml
        ? "no-cache"
        : "public, max-age=31536000, immutable";

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: file.objectKey,
          Body: content,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      );
      fileCount++;
    };

    const concurrencyLimit = 10;
    for (let i = 0; i < filesToUpload.length; i += concurrencyLimit) {
      const batch = filesToUpload.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(uploadFile));
    }
    await appendLog(`✓ ${fileCount} files uploaded to s3://${bucket}`);
  }

  async destroy(ctx: DestroyContext): Promise<DestroyResult> {
    const errors: string[] = [];
    const credentials: AwsCredentials = { accessKeyId: ctx.providerCredentials.apiKey, secretAccessKey: ctx.providerCredentials.apiSecret };
    const stackName = stackNameFor(ctx.appName);

    await ctx.appendLog("── Destroy AWS S3 Resources ───────");

    // Delete CloudFormation stack (fire and forget — CloudFront distributions take 15-20 min to delete)
    await destroyCfnStack(stackName, ctx.region, credentials, ctx.appendLog, errors);

    // Delete S3 static site bucket (empty objects first, do this before stack finishes deleting)
    try {
      const { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = await getS3();
      const s3 = new S3Client({ region: ctx.region, credentials });
      const bucketName = `${sanitizeBucketName(ctx.appName)}-static-site`;
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
