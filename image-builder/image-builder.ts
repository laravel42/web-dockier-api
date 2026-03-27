// ─── Image Builder Service ───
// Pulls repo code (via git integration), bundles with buildspec.yml,
// uploads to S3, and queues a CodeBuild job via SNS.
// CodeBuild builds the Docker image with buildx, pushes to ECR.
// On completion, SNS triggers deploy via CloudFormation.

import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { git_integration } from "~encore/clients";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read buildspec.yml at module load time — at runtime __dirname points to
// the Encore build output, so we resolve relative to the source tree instead.
// We try multiple possible locations.
let _buildspecContent: string | null = null;
function getBuildspecContent(): string {
  if (_buildspecContent) return _buildspecContent;
  const candidates = [
    join(__dirname, "buildspec.yml"),
    join(__dirname, "..", "image-builder", "buildspec.yml"),
    join(process.cwd(), "image-builder", "buildspec.yml"),
  ];
  for (const p of candidates) {
    try {
      _buildspecContent = readFileSync(p, "utf-8");
      console.log(`Loaded buildspec.yml from: ${p}`);
      return _buildspecContent;
    } catch { /* try next */ }
  }
  throw new Error(`buildspec.yml not found in any of: ${candidates.join(", ")}`);
}

// ─── Secrets ───

const AwsAccessKeyId = secret("ImageBuilderAwsAccessKeyId");
const AwsSecretAccessKey = secret("ImageBuilderAwsSecretAccessKey");
const AwsRegion = secret("ImageBuilderAwsRegion");
const CodeBuildProjectName = secret("ImageBuilderCodeBuildProject");
const CallbackUrlSecret = secret("ImageBuilderCallbackUrl");

function getAwsRegion(): string {
  try { return AwsRegion() || "us-east-1"; } catch { return "us-east-1"; }
}
function getCodeBuildProject(): string {
  try { return CodeBuildProjectName() || "image-builder"; } catch { return "image-builder"; }
}
function getCallbackUrl(): string {
  try { return CallbackUrlSecret() || ""; } catch { return ""; }
}

// ─── Database ───

const db = new SQLDatabase("imagebuilder", { migrations: "./migrations" });

// ─── Interfaces ───

interface StartBuildParams {
  sourceRepo: string;
  sourceRef?: string;
  commitSha?: string;
  imageRepo?: string;
  dockerfilePath?: string;
  buildContext?: string;
  tags?: string[];
  projectId?: string;
  gitConnectionId?: string;
  deployTarget?: "ecs" | "apprunner" | "ec2";
  deployParams?: {
    appName?: string;
    containerPort?: number;
    cpu?: string;
    memory?: string;
    desiredCount?: number;
    maxCount?: number;
    minInstances?: number;
    maxInstances?: number;
    instanceType?: string;
    vpcId?: string;
    subnetIds?: string[];
    envVars?: Array<{ name: string; value: string }>;
  };
}

interface BuildRecord {
  id: string;
  codebuildId: string;
  userId: string;
  projectId: string;
  sourceRepo: string;
  sourceRef: string;
  commitSha: string;
  dockerfilePath: string;
  buildContext: string;
  imageRepo: string;
  imageUri: string;
  cacheRepoUri: string;
  status: "pending" | "submitted" | "in_progress" | "succeeded" | "failed" | "stopped";
  statusReason: string;
  logsUrl: string;
  tags: string[];
  buildMetadata: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface BuildStatusResponse {
  id: string;
  codebuildId: string;
  sourceRepo: string;
  sourceRef: string;
  commitSha: string;
  imageUri: string;
  status: string;
  statusReason: string;
  logsUrl: string;
  tags: string[];
  buildMetadata: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
}

interface ImageForRevisionResponse {
  imageUri: string;
  buildId: string;
  commitSha: string;
  status: string;
  createdAt: string;
}

// ─── Helpers ───

function deriveImageRepo(sourceRepo: string): string {
  const parts = sourceRepo.split("/");
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

async function getAwsAccountId(accessKeyId: string, secretAccessKey: string, region: string): Promise<string> {
  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  const sts = new STSClient({ region, credentials: { accessKeyId, secretAccessKey } });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  return identity.Account || "";
}

function rowToBuild(row: any): BuildRecord {
  return {
    id: row.id, codebuildId: row.codebuild_id, userId: row.user_id,
    projectId: row.project_id, sourceRepo: row.source_repo, sourceRef: row.source_ref,
    commitSha: row.commit_sha, dockerfilePath: row.dockerfile_path,
    buildContext: row.build_context, imageRepo: row.image_repo, imageUri: row.image_uri,
    cacheRepoUri: row.cache_repo_uri, status: row.status, statusReason: row.status_reason,
    logsUrl: row.logs_url, tags: safeJsonParse(row.tags, []),
    buildMetadata: safeJsonParse(row.build_metadata, {}),
    startedAt: row.started_at ? row.started_at.toISOString() : "",
    finishedAt: row.finished_at ? row.finished_at.toISOString() : "",
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

function safeJsonParse<T>(val: string, fallback: T): T {
  try { return JSON.parse(val); } catch { return fallback; }
}


// ─── Source bundling ───
// Downloads repo from GitHub, injects buildspec.yml, creates zip, uploads to S3

async function bundleAndUploadSource(
  sourceRepo: string,
  sourceRef: string,
  buildId: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  bucketName: string,
  gitToken?: string,
  gitProvider?: string,
  gitEndpoint?: string,
): Promise<{ s3Key: string; detectedRuntime: string; detectedPort: number }> {
  const { execSync } = await import("node:child_process");
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { readdirSync } = await import("node:fs");

  // Build clone URL with auth (same pattern as deploy/code-analysis)
  let cloneUrl: string;
  if (gitToken && gitProvider === "github") {
    cloneUrl = `https://x-access-token:${gitToken}@github.com/${sourceRepo}.git`;
  } else if (gitToken && (gitProvider === "gitlab" || gitProvider === "gitlab_self_hosted")) {
    const host = new URL(gitEndpoint || "https://gitlab.com").host;
    cloneUrl = `https://oauth2:${gitToken}@${host}/${sourceRepo}.git`;
  } else if (gitToken && gitProvider === "bitbucket") {
    cloneUrl = `https://x-token-auth:${gitToken}@bitbucket.org/${sourceRepo}.git`;
  } else {
    cloneUrl = `https://github.com/${sourceRepo}.git`;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), `ib-${buildId}-`));
  try {
    console.log(`Cloning ${sourceRepo}@${sourceRef} (provider: ${gitProvider || "public"})`);
    execSync(
      `git clone --depth 1 --branch ${JSON.stringify(sourceRef)} ${JSON.stringify(cloneUrl)} repo`,
      { cwd: tmpDir, timeout: 120_000, stdio: "pipe" },
    );

    const repoDir = join(tmpDir, "repo");

    // Detect tech stack and inject tailored buildspec + Dockerfile
    const { detectStack, generateBuildspec, generateDockerfile: genDF } = await import("./buildspecs");
    const { existsSync } = await import("node:fs");
    const stack = detectStack(repoDir);
    console.log(`Detected stack: ${stack.runtime}${stack.subDir ? ` (subDir: ${stack.subDir})` : ""}`);

    // Generate stack-specific buildspec
    const buildspecContent = generateBuildspec(stack);
    writeFileSync(join(repoDir, "buildspec.yml"), buildspecContent);

    // Generate Dockerfile if the repo doesn't already have one
    let generatedDockerfile = false;
    let detectedPort = 3000;
    if (!existsSync(join(repoDir, "Dockerfile"))) {
      const dockerfile = genDF(stack, repoDir);
      if (dockerfile) {
        writeFileSync(join(repoDir, "Dockerfile"), dockerfile);
        generatedDockerfile = true;
        // Extract port from generated Dockerfile
        const exposeMatch = dockerfile.match(/EXPOSE\s+(\d+)/);
        if (exposeMatch) detectedPort = parseInt(exposeMatch[1]);
        console.log(`Generated Dockerfile for ${stack.runtime} (port: ${detectedPort})`);
      } else {
        const fallbackBuildspec = getBuildspecContent();
        writeFileSync(join(repoDir, "buildspec.yml"), fallbackBuildspec);
        console.log("Unknown stack, falling back to generic buildspec with auto-detection");
      }
    } else {
      // Detect port from existing Dockerfile
      try {
        const df = readFileSync(join(repoDir, "Dockerfile"), "utf-8");
        const exposeMatch = df.match(/EXPOSE\s+(\d+)/);
        if (exposeMatch) detectedPort = parseInt(exposeMatch[1]);
      } catch {}
      console.log(`Repo already has a Dockerfile, using it as-is (port: ${detectedPort})`);
    }

    // Generate .dockerignore if not present
    if (!existsSync(join(repoDir, ".dockerignore"))) {
      const dockerignore = [
        "node_modules", ".next", ".git", ".gitignore",
        "dist", "build", "out", "output", ".turbo", ".cache", ".pnpm-store",
        "vendor", ".env", ".env.*", "*.log",
        "coverage", ".nyc_output", "__pycache__", "*.pyc", ".venv", "venv",
        "*.md", "*.mdx", "LICENSE", ".vscode", ".idea", ".cursor",
      ].join("\n");
      writeFileSync(join(repoDir, ".dockerignore"), dockerignore);
    }

    // Remove .git directory (not needed in build)
    rmSync(join(repoDir, ".git"), { recursive: true, force: true });

    // Create zip
    const { default: AdmZip } = await import("adm-zip");
    const zip = new AdmZip();
    const skipDirs = new Set(["node_modules", ".git", ".pnpm-store", ".turbo", ".cache", "__pycache__", ".venv", "venv", "vendor"]);
    const addDir = (dirPath: string, zipPrefix: string) => {
      const items = readdirSync(dirPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && skipDirs.has(item.name)) continue;
        const fullPath = join(dirPath, item.name);
        if (item.isDirectory()) {
          addDir(fullPath, zipPrefix ? `${zipPrefix}/${item.name}` : item.name);
        } else {
          zip.addLocalFile(fullPath, zipPrefix || undefined);
        }
      }
    };
    addDir(repoDir, "");
    const zipBuffer = zip.toBuffer();
    console.log(`Created zip: ${zipBuffer.length} bytes`);

    // Upload to S3
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    const s3Key = `${buildId}.zip`;

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: zipBuffer,
      ContentType: "application/zip",
    }));

    return { s3Key, detectedRuntime: stack.runtime, detectedPort };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}


// ─── API: Start Build ───

export const startBuild = api(
  { method: "POST", path: "/image-builder/builds", auth: true },
  async (params: StartBuildParams): Promise<BuildRecord> => {
    const authData = getAuthData()!;

    if (!params.sourceRepo) throw APIError.invalidArgument("sourceRepo is required");
    const sourceRef = params.sourceRef || "main";
    const dockerfilePath = params.dockerfilePath || "Dockerfile";
    const buildContext = params.buildContext || ".";
    const imageRepo = params.imageRepo || deriveImageRepo(params.sourceRepo);
    const tags = params.tags || [];

    const accessKeyId = AwsAccessKeyId();
    const secretAccessKey = AwsSecretAccessKey();
    const region = getAwsRegion();
    const codebuildProject = getCodeBuildProject();

    if (!accessKeyId || !secretAccessKey) {
      throw APIError.failedPrecondition("AWS credentials not configured.");
    }

    let accountId: string;
    try {
      accountId = await getAwsAccountId(accessKeyId, secretAccessKey, region);
    } catch (e: any) {
      throw APIError.internal(`Failed to get AWS account ID: ${e.message}`);
    }

    const ecrBase = `${accountId}.dkr.ecr.${region}.amazonaws.com`;
    const cacheRepoName = `${imageRepo}-cache`;

    const id = uuidv4();
    const callbackUrl = getCallbackUrl();

    await db.exec`
      INSERT INTO builds (id, user_id, project_id, source_repo, source_ref, commit_sha,
        dockerfile_path, build_context, image_repo, cache_repo_uri, status, tags, created_at, updated_at)
      VALUES (${id}, ${authData.userID}, ${params.projectId || ""}, ${params.sourceRepo},
        ${sourceRef}, ${params.commitSha || ""}, ${dockerfilePath}, ${buildContext},
        ${imageRepo}, ${`${ecrBase}/${cacheRepoName}`}, 'pending', ${JSON.stringify(tags)}, NOW(), NOW())`;

    try {
      // 0. Get git token for private repo access
      let gitToken: string | undefined;
      let gitProvider: string | undefined;
      let gitEndpoint: string | undefined;
      if (params.gitConnectionId) {
        try {
          const conn = await git_integration.getConnectionForScan({ connectionId: params.gitConnectionId });
          if (conn.token) gitToken = conn.token;
          gitProvider = conn.provider;
          gitEndpoint = conn.endpoint;
          console.log(`Git token retrieved for connection ${params.gitConnectionId}, provider: ${conn.provider}, token length: ${conn.token?.length || 0}`);
        } catch (e: any) {
          console.warn(`Failed to get git token for connection ${params.gitConnectionId}: ${e.message}`);
        }
      } else {
        console.warn(`No gitConnectionId provided, attempting public download for ${params.sourceRepo}`);
      }

      // 1. Pull repo, inject buildspec.yml, upload to S3
      const bucketName = `${codebuildProject}-source-${accountId}`;
      const { s3Key, detectedRuntime, detectedPort } = await bundleAndUploadSource(
        params.sourceRepo, sourceRef, id,
        accessKeyId, secretAccessKey, region, bucketName,
        gitToken, gitProvider, gitEndpoint,
      );

      // Always use the detected port from the Dockerfile (generated or existing)
      const deployParams = { ...params.deployParams };
      deployParams.containerPort = detectedPort;

      // 2. Publish to SNS to queue the CodeBuild job
      const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns");
      const sns = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });

      const buildRequestTopicArn = `arn:aws:sns:${region}:${accountId}:${codebuildProject}-build-request`;

      await sns.send(new PublishCommand({
        TopicArn: buildRequestTopicArn,
        Subject: "build-request",
        Message: JSON.stringify({
          buildId: id,
          sourceRepo: params.sourceRepo,
          sourceRef,
          commitSha: params.commitSha || "unknown",
          imageRepoName: imageRepo,
          cacheRepoName,
          s3Bucket: bucketName,
          s3Key,
          accountId,
          region,
          codebuildProject,
          deployTarget: params.deployTarget || "",
          deployParams: deployParams,
          callbackUrl,
        }),
      }));

      await db.exec`
        UPDATE builds SET status = 'submitted', updated_at = NOW()
        WHERE id = ${id}`;

      const row = await db.queryRow`SELECT * FROM builds WHERE id = ${id}`;
      return rowToBuild(row);
    } catch (e: any) {
      await db.exec`
        UPDATE builds SET status = 'failed', status_reason = ${e.message || "Failed to queue build"},
          updated_at = NOW()
        WHERE id = ${id}`;
      throw APIError.internal(`Failed to queue build: ${e.message}`);
    }
  }
);


// ─── API: Get Build Status ───

export const getBuildStatus = api(
  { method: "GET", path: "/image-builder/builds/:buildId", auth: true },
  async (params: { buildId: string }): Promise<BuildStatusResponse> => {
    const row = await db.queryRow`SELECT * FROM builds WHERE id = ${params.buildId}`;
    if (!row) throw APIError.notFound("Build not found");
    const build = rowToBuild(row);

    // If codebuildId is missing but build was submitted, try to find it
    if (!build.codebuildId && (build.status === "submitted" || build.status === "pending")) {
      try {
        const { CodeBuildClient, ListBuildsForProjectCommand, BatchGetBuildsCommand } = await import("@aws-sdk/client-codebuild");
        const cb = new CodeBuildClient({
          region: getAwsRegion(),
          credentials: { accessKeyId: AwsAccessKeyId(), secretAccessKey: AwsSecretAccessKey() },
        });
        const listResult = await cb.send(new ListBuildsForProjectCommand({
          projectName: getCodeBuildProject(),
          sortOrder: "DESCENDING",
        }));
        const buildIds = (listResult.ids || []).slice(0, 10);
        if (buildIds.length > 0) {
          const batchResult = await cb.send(new BatchGetBuildsCommand({ ids: buildIds }));
          const match = (batchResult.builds || []).find(b => {
            const loc = b.source?.location || "";
            return loc.includes(`${params.buildId}.zip`);
          });
          if (match?.id) {
            build.codebuildId = match.id;
            await db.exec`UPDATE builds SET codebuild_id = ${match.id}, updated_at = NOW() WHERE id = ${params.buildId}`;
          }
        }
      } catch { /* best effort */ }
    }

    if (build.codebuildId && (build.status === "submitted" || build.status === "in_progress")) {
      try {
        const refreshed = await refreshBuildStatus(build);
        return buildToStatusResponse(refreshed);
      } catch { /* return cached */ }
    }
    return buildToStatusResponse(build);
  }
);

// ─── API: Get Build Logs (from CloudWatch) ───

interface BuildLogsResponse {
  buildId: string;
  logs: string[];
  nextToken?: string;
}

export const getBuildLogs = api(
  { method: "GET", path: "/image-builder/builds/:buildId/logs", auth: true },
  async (params: { buildId: string; nextToken?: string }): Promise<BuildLogsResponse> => {
    const row = await db.queryRow`SELECT * FROM builds WHERE id = ${params.buildId}`;
    if (!row) throw APIError.notFound("Build not found");
    const build = rowToBuild(row);

    if (!build.codebuildId) {
      // Try to find the CodeBuild build ID by listing recent builds
      try {
        const { CodeBuildClient, ListBuildsForProjectCommand, BatchGetBuildsCommand } = await import("@aws-sdk/client-codebuild");
        const cb = new CodeBuildClient({
          region: getAwsRegion(),
          credentials: { accessKeyId: AwsAccessKeyId(), secretAccessKey: AwsSecretAccessKey() },
        });
        const listResult = await cb.send(new ListBuildsForProjectCommand({
          projectName: getCodeBuildProject(),
          sortOrder: "DESCENDING",
        }));
        const buildIds = (listResult.ids || []).slice(0, 10);
        if (buildIds.length > 0) {
          const batchResult = await cb.send(new BatchGetBuildsCommand({ ids: buildIds }));
          const match = (batchResult.builds || []).find(b => {
            const loc = b.source?.location || "";
            return loc.includes(`${params.buildId}.zip`);
          });
          if (match?.id) {
            await db.exec`UPDATE builds SET codebuild_id = ${match.id}, updated_at = NOW() WHERE id = ${params.buildId}`;
            build.codebuildId = match.id;
          }
        }
      } catch (e: any) {
        console.warn(`Failed to look up CodeBuild ID: ${e.message}`);
      }
    }

    if (!build.codebuildId) {
      return { buildId: params.buildId, logs: ["Build not yet started in CodeBuild"] };
    }

    try {
      const { CloudWatchLogsClient, GetLogEventsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
      const cwl = new CloudWatchLogsClient({
        region: getAwsRegion(),
        credentials: { accessKeyId: AwsAccessKeyId(), secretAccessKey: AwsSecretAccessKey() },
      });

      // CodeBuild log stream name is the build ID after the project name
      // e.g. codebuildId = "image-builder:abcd-1234" → stream = "abcd-1234"
      const logStreamName = build.codebuildId.includes(":")
        ? build.codebuildId.split(":")[1]
        : build.codebuildId;

      const logGroupName = `/aws/codebuild/${getCodeBuildProject()}`;

      const result = await cwl.send(new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        startFromHead: true,
        nextToken: params.nextToken || undefined,
        limit: 200,
      }));

      const logs = (result.events || []).map(e => {
        const ts = e.timestamp ? new Date(e.timestamp).toISOString().replace("T", " ").slice(0, 19) : "";
        const msg = (e.message || "").replace(/\n$/, "");
        return `[${ts}] ${msg}`;
      });

      return {
        buildId: params.buildId,
        logs,
        nextToken: result.nextForwardToken || undefined,
      };
    } catch (e: any) {
      console.warn(`Failed to fetch CloudWatch logs: ${e.message}`);
      return { buildId: params.buildId, logs: [`Unable to fetch logs: ${e.message}`] };
    }
  }
);

// ─── API: List Builds ───

export const listBuilds = api(
  { method: "GET", path: "/image-builder/builds", auth: true },
  async (params: { sourceRepo?: string; status?: string; limit?: number }): Promise<{ builds: BuildStatusResponse[] }> => {
    const authData = getAuthData()!;
    const limit = Math.min(params.limit || 50, 100);

    let rows;
    if (params.sourceRepo && params.status) {
      rows = db.query`SELECT * FROM builds WHERE user_id = ${authData.userID} AND source_repo = ${params.sourceRepo} AND status = ${params.status} ORDER BY created_at DESC LIMIT ${limit}`;
    } else if (params.sourceRepo) {
      rows = db.query`SELECT * FROM builds WHERE user_id = ${authData.userID} AND source_repo = ${params.sourceRepo} ORDER BY created_at DESC LIMIT ${limit}`;
    } else if (params.status) {
      rows = db.query`SELECT * FROM builds WHERE user_id = ${authData.userID} AND status = ${params.status} ORDER BY created_at DESC LIMIT ${limit}`;
    } else {
      rows = db.query`SELECT * FROM builds WHERE user_id = ${authData.userID} ORDER BY created_at DESC LIMIT ${limit}`;
    }

    const builds: BuildStatusResponse[] = [];
    for await (const row of rows) {
      builds.push(buildToStatusResponse(rowToBuild(row)));
    }
    return { builds };
  }
);

// ─── API: Get Image for Revision ───

export const getImageForRevision = api(
  { method: "GET", path: "/image-builder/images/:revision", auth: true },
  async (params: { revision: string }): Promise<ImageForRevisionResponse> => {
    const row = await db.queryRow`
      SELECT * FROM builds
      WHERE (commit_sha LIKE ${params.revision + "%"} OR source_ref = ${params.revision})
        AND status = 'succeeded' AND image_uri != ''
      ORDER BY created_at DESC LIMIT 1`;
    if (!row) throw APIError.notFound(`No successful build found for revision: ${params.revision}`);
    const build = rowToBuild(row);
    return { imageUri: build.imageUri, buildId: build.id, commitSha: build.commitSha, status: build.status, createdAt: build.createdAt };
  }
);

// ─── API: Cancel Build ───

export const cancelBuild = api(
  { method: "POST", path: "/image-builder/builds/:buildId/cancel", auth: true },
  async (params: { buildId: string }): Promise<BuildStatusResponse> => {
    const row = await db.queryRow`SELECT * FROM builds WHERE id = ${params.buildId}`;
    if (!row) throw APIError.notFound("Build not found");
    const build = rowToBuild(row);
    if (build.status !== "submitted" && build.status !== "in_progress") {
      throw APIError.failedPrecondition(`Cannot cancel build in status: ${build.status}`);
    }
    if (build.codebuildId) {
      try {
        const { CodeBuildClient, StopBuildCommand } = await import("@aws-sdk/client-codebuild");
        const cb = new CodeBuildClient({ region: getAwsRegion(), credentials: { accessKeyId: AwsAccessKeyId(), secretAccessKey: AwsSecretAccessKey() } });
        await cb.send(new StopBuildCommand({ id: build.codebuildId }));
      } catch { /* best-effort */ }
    }
    await db.exec`UPDATE builds SET status = 'stopped', status_reason = 'Cancelled by user', updated_at = NOW() WHERE id = ${params.buildId}`;
    return buildToStatusResponse({ ...build, status: "stopped", statusReason: "Cancelled by user" });
  }
);

// ─── API: Webhook (called by Lambda when deploy completes) ───

interface WebhookPayload {
  buildId: string;
  stackName?: string;
  status: "deploying" | "success" | "failed";
  appUrl?: string;
  cfnStatus?: string;
  deployTarget?: string;
  codebuildId?: string;
}

export const webhook = api(
  { method: "POST", path: "/image-builder/webhook", auth: false },
  async (params: WebhookPayload): Promise<{ ok: boolean }> => {
    if (!params.buildId) return { ok: false };
    const row = await db.queryRow`SELECT * FROM builds WHERE id = ${params.buildId}`;
    if (!row) return { ok: false };

    if (params.codebuildId) {
      await db.exec`UPDATE builds SET codebuild_id = ${params.codebuildId}, updated_at = NOW() WHERE id = ${params.buildId}`;
    }

    if (params.status === "success") {
      await db.exec`UPDATE builds SET status = 'succeeded', build_metadata = ${JSON.stringify({ appUrl: params.appUrl || "", stackName: params.stackName || "" })}, updated_at = NOW() WHERE id = ${params.buildId}`;
    } else if (params.status === "failed") {
      await db.exec`UPDATE builds SET status = 'failed', status_reason = ${`Deploy failed: ${params.cfnStatus || "unknown"}`}, updated_at = NOW() WHERE id = ${params.buildId}`;
    } else {
      await db.exec`UPDATE builds SET status = 'in_progress', status_reason = ${`Deploying (${params.deployTarget || ""})`}, updated_at = NOW() WHERE id = ${params.buildId}`;
    }
    return { ok: true };
  }
);

// ─── API: Get Deploy Status (polls CloudFormation for stack status) ───

export const getDeployStatus = api(
  { method: "GET", path: "/image-builder/builds/:buildId/deploy-status", auth: true },
  async (params: { buildId: string }): Promise<{ status: string; appUrl: string; stackName: string }> => {
    const row = await db.queryRow`SELECT * FROM builds WHERE id = ${params.buildId}`;
    if (!row) throw APIError.notFound("Build not found");
    const build = rowToBuild(row);

    // Check if webhook already set the metadata
    if (build.buildMetadata?.appUrl) {
      return { status: "success", appUrl: build.buildMetadata.appUrl, stackName: build.buildMetadata.stackName || "" };
    }
    if (build.status === "failed") {
      return { status: "failed", appUrl: "", stackName: "" };
    }

    // Poll CloudFormation directly
    const appName = build.sourceRepo.split("/").pop()?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "";
    const stackName = `image-builder-app-${appName}`;
    try {
      const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
      const cfn = new CloudFormationClient({
        region: getAwsRegion(),
        credentials: { accessKeyId: AwsAccessKeyId(), secretAccessKey: AwsSecretAccessKey() },
      });
      const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = result.Stacks?.[0];
      if (!stack) return { status: "pending", appUrl: "", stackName };

      const stackStatus = stack.StackStatus || "";
      if (stackStatus === "CREATE_COMPLETE" || stackStatus === "UPDATE_COMPLETE") {
        const outputs = Object.fromEntries((stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]));
        const appUrl = outputs.AppUrl || "";
        // Update the build record so future polls are fast
        await db.exec`UPDATE builds SET status = 'succeeded', build_metadata = ${JSON.stringify({ appUrl, stackName })}, updated_at = NOW() WHERE id = ${params.buildId}`;
        return { status: "success", appUrl, stackName };
      }
      if (stackStatus.includes("ROLLBACK") || stackStatus.includes("FAILED")) {
        return { status: "failed", appUrl: "", stackName };
      }
      return { status: "deploying", appUrl: "", stackName };
    } catch {
      return { status: "pending", appUrl: "", stackName };
    }
  }
);

// ─── Internal: Refresh build status from CodeBuild ───

async function refreshBuildStatus(build: BuildRecord): Promise<BuildRecord> {
  const { CodeBuildClient, BatchGetBuildsCommand } = await import("@aws-sdk/client-codebuild");
  const cb = new CodeBuildClient({ region: getAwsRegion(), credentials: { accessKeyId: AwsAccessKeyId(), secretAccessKey: AwsSecretAccessKey() } });
  const result = await cb.send(new BatchGetBuildsCommand({ ids: [build.codebuildId] }));
  const cbBuild = result.builds?.[0];
  if (!cbBuild) return build;

  const statusMap: Record<string, BuildRecord["status"]> = {
    SUCCEEDED: "succeeded", FAILED: "failed", FAULT: "failed",
    TIMED_OUT: "failed", STOPPED: "stopped", IN_PROGRESS: "in_progress",
  };
  const newStatus = statusMap[cbBuild.buildStatus || ""] || build.status;
  const statusReason = cbBuild.phases?.find(p => p.phaseStatus === "FAILED")?.contexts?.[0]?.message || "";

  let imageUri = build.imageUri;
  if (newStatus === "succeeded" && !imageUri) {
    // Try exported env vars first
    const imageVar = (cbBuild.exportedEnvironmentVariables || []).find(v => v.name === "IMAGE_URI");
    if (imageVar?.value) {
      imageUri = imageVar.value;
    } else {
      // Construct from known data: {accountId}.dkr.ecr.{region}.amazonaws.com/{imageRepo}:latest
      try {
        const accountId = await getAwsAccountId(AwsAccessKeyId(), AwsSecretAccessKey(), getAwsRegion());
        imageUri = `${accountId}.dkr.ecr.${getAwsRegion()}.amazonaws.com/${build.imageRepo}:latest`;
      } catch { /* best effort */ }
    }
  }

  const startedAt = cbBuild.startTime?.toISOString() || build.startedAt;
  const finishedAt = cbBuild.endTime?.toISOString() || build.finishedAt;

  await db.exec`UPDATE builds SET status = ${newStatus}, status_reason = ${statusReason}, image_uri = ${imageUri},
    started_at = ${startedAt ? new Date(startedAt) : null}, finished_at = ${finishedAt ? new Date(finishedAt) : null}, updated_at = NOW()
    WHERE id = ${build.id}`;

  return { ...build, status: newStatus, statusReason, imageUri, startedAt, finishedAt };
}

function buildToStatusResponse(build: BuildRecord): BuildStatusResponse {
  return {
    id: build.id, codebuildId: build.codebuildId, sourceRepo: build.sourceRepo,
    sourceRef: build.sourceRef, commitSha: build.commitSha, imageUri: build.imageUri,
    status: build.status, statusReason: build.statusReason, logsUrl: build.logsUrl,
    tags: build.tags, buildMetadata: build.buildMetadata,
    startedAt: build.startedAt, finishedAt: build.finishedAt, createdAt: build.createdAt,
  };
}
