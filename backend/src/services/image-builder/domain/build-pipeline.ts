/**
 * Image build pipeline executor.
 *
 * Extracted from the inline setImmediate() in routes.ts.
 * Handles the full build flow: resolve credentials → bundle source → publish to SNS.
 * Updates the build record in the DB as it progresses.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { nowIso } from "../../../shared/utils/time.js";
import { env } from "../../../shared/config.js";
import { bundleAndUploadSource } from "./source-bundler.js";
import { getAwsAccountId } from "../../../lib/aws.js";
import { resolveAwsCredentials } from "../../../lib/provider-credentials.js";
import { getSns } from "../../../lib/aws-sdk.js";

const db = supabaseAdmin;

// ─── Types ─────────────────────────────────────────────────────────

export interface BuildJobInput {
  buildId: string;
  sourceRepo: string;
  sourceRef: string;
  commitSha: string;
  imageRepo: string;
  dockerfilePath: string;
  buildContext: string;
  tags: string[];
  providerId: string;
  gitConnectionId: string;
  deployTarget: string;
  deployParams: Record<string, unknown>;
  /** Request ID from the originating HTTP request — used for log correlation. */
  correlationId?: string;
}

// ─── Pipeline ──────────────────────────────────────────────────────

export async function executeBuild(input: BuildJobInput): Promise<void> {
  const { buildId, providerId, gitConnectionId } = input;

  try {
    // 1. Resolve AWS credentials from provider
    const credentials = await resolveAwsCredentials(providerId);
    if (!credentials) {
      await db.from("builds").update({
        status: "failed",
        status_reason: "AWS credentials not configured on provider",
        updated_at: nowIso(),
      }).eq("id", buildId);
      return;
    }
    const { accessKeyId, secretAccessKey, region } = credentials;

    // 2. Get AWS account ID
    const accountId = await getAwsAccountId(region, { accessKeyId, secretAccessKey });

    // 3. Get git token for private repo access
    let gitToken: string | undefined;
    let gitProvider: string | undefined;
    let gitEndpoint: string | undefined;
    if (gitConnectionId) {
      const { getGitConnectionCredentials } = await import("../../../shared/service-clients/git-connections.js");
      const creds = await getGitConnectionCredentials(gitConnectionId);
      if (creds?.token) {
        gitToken = creds.token;
        gitProvider = creds.provider;
        gitEndpoint = creds.endpoint;
      }
    }

    // 4. Bundle source (clone → analyze → zip → upload to S3)
    const codebuildProject = env.IMAGE_BUILDER_CODEBUILD_PROJECT;
    const bucketName = `${codebuildProject}-source-${accountId}`;
    const useRepoDockerfile = input.deployParams?.useRepoDockerfile === true
      || input.deployParams?.useRepoDockerfile === "true";
    const { s3Key, detectedRuntime, detectedPort } = await bundleAndUploadSource(
      input.sourceRepo,
      input.sourceRef,
      buildId,
      accessKeyId,
      secretAccessKey,
      region,
      bucketName,
      gitToken,
      gitProvider,
      gitEndpoint,
      input.deployTarget as "ecs" | "ec2" | "s3" | undefined,
      { skipExistingDockerfile: useRepoDockerfile },
    );

    // 5. Publish to SNS to trigger CodeBuild via Lambda
    const deployParams = { ...input.deployParams, containerPort: detectedPort };
    const callbackUrl = env.DEPLOY_CALLBACK_URL ?? "";
    const webhookSecret = env.WEBHOOK_SECRET ?? "";

    const { SNSClient, PublishCommand } = await getSns();
    const sns = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });
    const buildRequestTopicArn = `arn:aws:sns:${region}:${accountId}:${codebuildProject}-build-request`;

    await sns.send(new PublishCommand({
      TopicArn: buildRequestTopicArn,
      Subject: "build-request",
      Message: JSON.stringify({
        buildId,
        sourceRepo: input.sourceRepo,
        sourceRef: input.sourceRef,
        commitSha: input.commitSha || "unknown",
        imageRepoName: input.imageRepo,
        cacheRepoName: `${input.imageRepo}-cache`,
        s3Bucket: bucketName,
        s3Key,
        accountId,
        region,
        codebuildProject,
        deployTarget: input.deployTarget || "",
        deployParams,
        callbackUrl,
        webhookSecret,
      }),
    }));

    // 6. Update status to submitted
    await db.from("builds").update({
      status: "submitted",
      status_reason: `Build submitted to CodeBuild (${detectedRuntime} runtime, port ${detectedPort})`,
      updated_at: nowIso(),
    }).eq("id", buildId);

  } catch (e: unknown) {
    const message = getErrMsg(e);
    logger.error({ err: message }, `[image-build-worker] Failed to trigger CodeBuild for ${buildId}`);
    await db.from("builds").update({
      status: "failed",
      status_reason: `Failed to queue build: ${message}`,
      updated_at: nowIso(),
    }).eq("id", buildId);
    // Rethrow so pg-boss marks the job as failed and retries it
    throw e;
  }
}
