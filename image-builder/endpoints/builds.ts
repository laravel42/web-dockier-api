// ─── Build Endpoints ───

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { v4 as uuidv4 } from "uuid";
import { git_integration } from "~encore/clients";
import { readFileSync } from "node:fs";
import {
  db, AwsAccessKeyId, AwsSecretAccessKey, getAwsRegion, getCodeBuildProject, getCallbackUrl,
  deriveImageRepo, getAwsAccountId, rowToBuild, refreshBuildStatus, buildToStatusResponse,
  type StartBuildParams, type BuildRecord, type BuildStatusResponse, type BuildLogsResponse,
} from "../shared";
import { bundleAndUploadSource } from "../source-bundler";

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
      INSERT INTO builds (id, app_id, project_id, source_repo, source_ref, commit_sha,
        dockerfile_path, build_context, image_repo, cache_repo_uri, status, tags, created_at, updated_at)
      VALUES (${id}, ${authData.appId}, ${params.projectId || ""}, ${params.sourceRepo},
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
        params.deployTarget,
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
      rows = db.query`SELECT * FROM builds WHERE app_id = ${authData.appId} AND source_repo = ${params.sourceRepo} AND status = ${params.status} ORDER BY created_at DESC LIMIT ${limit}`;
    } else if (params.sourceRepo) {
      rows = db.query`SELECT * FROM builds WHERE app_id = ${authData.appId} AND source_repo = ${params.sourceRepo} ORDER BY created_at DESC LIMIT ${limit}`;
    } else if (params.status) {
      rows = db.query`SELECT * FROM builds WHERE app_id = ${authData.appId} AND status = ${params.status} ORDER BY created_at DESC LIMIT ${limit}`;
    } else {
      rows = db.query`SELECT * FROM builds WHERE app_id = ${authData.appId} ORDER BY created_at DESC LIMIT ${limit}`;
    }

    const builds: BuildStatusResponse[] = [];
    for await (const row of rows) {
      builds.push(buildToStatusResponse(rowToBuild(row)));
    }
    return { builds };
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
