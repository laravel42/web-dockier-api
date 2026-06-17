/**
 * CloudFormation Deploy Orchestrator
 *
 * Extracted from the deploy-status route handler. Encapsulates all logic for:
 * - Checking existing CloudFormation stack status
 * - Fallback stack creation when the deploy Lambda fails or SNS doesn't fire
 * - Resolving image URIs from build metadata
 * - Caching deploy results back to the builds table
 *
 * This module is pure business logic — no Fastify request/reply coupling.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAwsAccountId } from "../../../lib/aws.js";
import type { ResolvedCredentials } from "../../../lib/provider-credentials.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeployStatusResult {
  status: "success" | "failed" | "deploying";
  appUrl: string;
  stackName: string;
}

export interface BuildRecord {
  id: string;
  sourceRepo: string;
  commitSha: string;
  status: string;
  buildMetadata: Record<string, any>;
  imageUri: string;
}

export interface BuildRow {
  id: string;
  source_repo: string;
  commit_sha: string;
  image_uri: string;
  status: string;
  build_metadata: string;
  provider_id: string;
  finished_at: string | null;
}

export interface Logger {
  debug(msg: string): void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function deriveAppName(sourceRepo: string): string {
  return sourceRepo.split("/").pop()?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "";
}

export function deriveStackName(appName: string): string {
  return `image-builder-app-${appName}`;
}

function parseBuildMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseDeployParams(metadata: Record<string, unknown>): Record<string, unknown> {
  const raw = metadata.deployParams;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

function normalizeEnvVars(rawEnvVars: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(rawEnvVars)) return [];
  return rawEnvVars
    .map((v: unknown) => {
      if (typeof v === "string") {
        const idx = v.indexOf("=");
        return idx > 0 ? { name: v.slice(0, idx), value: v.slice(idx + 1) } : { name: v, value: "" };
      }
      if (v && typeof v === "object" && "name" in v && typeof (v as Record<string, unknown>).name === "string") {
        const obj = v as Record<string, unknown>;
        return { name: obj.name as string, value: String(obj.value ?? "") };
      }
      return null;
    })
    .filter((v): v is { name: string; value: string } => v !== null && v.name.length > 0);
}

function readCfnTemplate(): string {
  // __dirname resolves to services/image-builder/domain/ at runtime (tsx supports it)
  try {
    return readFileSync(join(__dirname, "../../deploy/domain/cfn-templates/ec2.yml"), "utf-8");
  } catch {
    // Fallback for compiled output where __dirname may differ
    return readFileSync(join(process.cwd(), "src/services/deploy/domain/cfn-templates/ec2.yml"), "utf-8");
  }
}

// ─── Stack Status Check ──────────────────────────────────────────────────────

export interface CheckStackStatusParams {
  buildId: string;
  buildRow: BuildRow;
  build: BuildRecord;
  credentials: ResolvedCredentials;
  logger: Logger;
}

/**
 * Poll CloudFormation for the deploy status of a build.
 *
 * Handles three scenarios:
 * 1. Stack exists and is complete → returns success with appUrl
 * 2. Stack exists but is in progress or failed → returns appropriate status
 * 3. Stack doesn't exist → triggers fallback creation if conditions are met
 */
export async function checkDeployStatus(params: CheckStackStatusParams): Promise<DeployStatusResult> {
  const { buildId, buildRow, build, credentials, logger } = params;

  const appName = deriveAppName(build.sourceRepo);
  const stackName = deriveStackName(appName);

  const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
  const cfn = new CloudFormationClient({
    region: credentials.region,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
  });

  // Try to describe the existing stack
  let stack: any = null;
  try {
    const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    stack = result.Stacks?.[0] || null;
  } catch {
    // Stack doesn't exist
  }

  if (!stack) {
    await attemptFallbackStackCreation({
      buildId,
      buildRow,
      build,
      credentials,
      appName,
      stackName,
      cfn,
      logger,
    });
    return { status: "deploying", appUrl: "", stackName };
  }

  // Stack exists — check its status
  const stackStatus: string = stack.StackStatus || "";

  if (stackStatus === "CREATE_COMPLETE" || stackStatus === "UPDATE_COMPLETE") {
    const outputs = Object.fromEntries(
      (stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]),
    );
    const appUrl = outputs.AppUrl || "";

    // Cache the result so future polls are instant
    await cacheDeployResult(buildId, buildRow.build_metadata, { appUrl, stackName }, logger);
    return { status: "success", appUrl, stackName };
  }

  if (stackStatus.includes("ROLLBACK") || stackStatus.includes("FAILED")) {
    const { error } = await supabaseAdmin.from("builds").update({
      status: "failed",
      status_reason: `CloudFormation: ${stackStatus}`,
      updated_at: new Date().toISOString(),
    }).eq("id", buildId);
    if (error) {
      logger.debug(`Failed to update build status to failed in DB: ${error.message}`);
    }
    return { status: "failed", appUrl: "", stackName };
  }

  return { status: "deploying", appUrl: "", stackName };
}

// ─── Fallback Stack Creation ─────────────────────────────────────────────────

interface FallbackParams {
  buildId: string;
  buildRow: BuildRow;
  build: BuildRecord;
  credentials: ResolvedCredentials;
  appName: string;
  stackName: string;
  cfn: any;
  logger: Logger;
}

async function attemptFallbackStackCreation(params: FallbackParams): Promise<void> {
  const { buildId, buildRow, build, credentials, appName, stackName, cfn, logger } = params;

  logger.debug(`No stack found. build.status=${build.status}, image_uri=${buildRow.image_uri || ""}, buildMetadata.imageUri=${build.buildMetadata.imageUri || ""}`);

  const shouldAttempt =
    build.buildMetadata.imageUri ||
    buildRow.image_uri ||
    build.status === "succeeded" ||
    build.status === "submitted" ||
    build.status === "in_progress";

  if (!shouldAttempt) return;

  // Resolve image URI
  let imageUri = build.buildMetadata.imageUri || buildRow.image_uri || "";
  if (!imageUri && build.status === "succeeded") {
    const accountId = await getAwsAccountId(credentials.region, {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    });
    const commitSha = build.commitSha || buildRow.commit_sha || "";
    const shortTag = commitSha ? commitSha.slice(0, 12) : "latest";
    imageUri = `${accountId}.dkr.ecr.${credentials.region}.amazonaws.com/${appName}:${shortTag}`;
  }

  const metadata = parseBuildMetadata(buildRow.build_metadata);
  const containerPort = (metadata.containerPort as string) || "3000";
  const deployParams = parseDeployParams(metadata);

  logger.debug(`deployParams keys: ${Object.keys(deployParams).join(",")}, envVars count: ${((deployParams.envVars as unknown[]) || []).length}, raw deployParams field: ${metadata.deployParams ? "present" : "MISSING"}`);

  // Only attempt creation if the build finished (give Lambda a few seconds)
  const finishedAt = buildRow.finished_at ? new Date(buildRow.finished_at).getTime() : 0;
  const elapsed = finishedAt > 0 ? Math.abs(Date.now() - finishedAt) : 999_999;

  if (elapsed <= 30_000 || !imageUri) {
    logger.debug(`Fallback skipped — imageUri="${imageUri}", elapsed=${elapsed}ms`);
    return;
  }

  logger.debug(`Fallback triggered — imageUri=${imageUri}, elapsed=${elapsed}ms`);

  try {
    await createOrUpdateStack({
      buildId,
      credentials,
      appName,
      stackName,
      imageUri,
      containerPort,
      deployParams,
      cfn,
      logger,
    });
  } catch (err: any) {
    if (!err.name?.includes("AlreadyExists") && !err.message?.includes("already exists")) {
      logger.debug(`Fallback stack creation failed: ${err.message}`);
    } else {
      logger.debug(`Stack already exists (race with Lambda)`);
    }
  }
}

// ─── Stack Create/Update ─────────────────────────────────────────────────────

interface CreateStackParams {
  buildId: string;
  credentials: ResolvedCredentials;
  appName: string;
  stackName: string;
  imageUri: string;
  containerPort: string;
  deployParams: Record<string, unknown>;
  cfn: any;
  logger: Logger;
}

async function createOrUpdateStack(params: CreateStackParams): Promise<void> {
  const { buildId, credentials, appName, stackName, imageUri, containerPort, deployParams, cfn, logger } = params;

  // Discover VPC and subnet
  const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand } = await import("@aws-sdk/client-ec2");
  const ec2 = new EC2Client({
    region: credentials.region,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
  });

  const vpcsResult = await ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: "is-default", Values: ["true"] }] }));
  const vpcId = vpcsResult.Vpcs?.[0]?.VpcId || "";
  const subnetsResult = vpcId
    ? await ec2.send(new DescribeSubnetsCommand({ Filters: [{ Name: "vpc-id", Values: [vpcId] }] }))
    : { Subnets: [] };
  const subnetId = (subnetsResult.Subnets || [])[0]?.SubnetId || "";

  if (!vpcId || !subnetId) {
    logger.debug(`Fallback stack creation aborted: Default VPC or Subnet not found. vpcId=${vpcId}, subnetId=${subnetId}`);
    return;
  }

  // Upload CFN template to S3
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const accountId = await getAwsAccountId(credentials.region, {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
  });
  const templateBucket = `image-builder-templates-${accountId}`;
  const templateBody = readCfnTemplate();

  const s3 = new S3Client({
    region: credentials.region,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
  });
  await s3.send(new PutObjectCommand({
    Bucket: templateBucket,
    Key: "ec2.yml",
    Body: templateBody,
    ContentType: "text/yaml",
  }));
  const templateUrl = `https://${templateBucket}.s3.amazonaws.com/ec2.yml`;

  // Build CloudFormation parameters
  const cfnParams = buildCfnParameters({
    buildId,
    appName,
    imageUri,
    containerPort,
    deployParams,
    vpcId,
    subnetId,
  });

  // Handle env vars (S3 upload if too large)
  await appendEnvVarsParameter(cfnParams, deployParams, s3, templateBucket, stackName, buildId, logger);

  // Append optional parameters
  const selfHostedServices = (deployParams.selfHostedServices as string[]) || [];
  if (selfHostedServices.length > 0) {
    cfnParams.push({ ParameterKey: "SelfHostedServices", ParameterValue: selfHostedServices.join(",") });
  }
  const techStack = (deployParams.techStack as string[]) || [];
  if (techStack.length > 0) {
    cfnParams.push({ ParameterKey: "TechStack", ParameterValue: techStack.join(",") });
  }

  // Create or update the stack
  const { CreateStackCommand, UpdateStackCommand } = await import("@aws-sdk/client-cloudformation");

  try {
    await cfn.send(new CreateStackCommand({
      StackName: stackName,
      TemplateURL: templateUrl,
      Parameters: cfnParams,
      Capabilities: ["CAPABILITY_NAMED_IAM"],
      Tags: [
        { Key: "BuildId", Value: buildId },
        { Key: "ManagedBy", Value: "image-builder" },
      ],
      OnFailure: "ROLLBACK",
    }));
    logger.debug(`Created CloudFormation stack ${stackName} as fallback`);
  } catch (createErr: any) {
    if (createErr.name?.includes("AlreadyExists") || createErr.message?.includes("already exists")) {
      try {
        await cfn.send(new UpdateStackCommand({
          StackName: stackName,
          TemplateURL: templateUrl,
          Parameters: cfnParams,
          Capabilities: ["CAPABILITY_NAMED_IAM"],
        }));
        logger.debug(`Updated existing CloudFormation stack ${stackName}`);
      } catch (updateErr: any) {
        if (updateErr.message?.includes("No updates")) {
          logger.debug(`Stack ${stackName} already up to date`);
        } else {
          logger.debug(`Stack update failed: ${updateErr.message}`);
        }
      }
    } else {
      throw createErr;
    }
  }
}

// ─── Parameter Builders ──────────────────────────────────────────────────────

interface CfnParameterInput {
  buildId: string;
  appName: string;
  imageUri: string;
  containerPort: string;
  deployParams: Record<string, unknown>;
  vpcId: string;
  subnetId: string;
}

function buildCfnParameters(input: CfnParameterInput): Array<{ ParameterKey: string; ParameterValue: string }> {
  return [
    { ParameterKey: "AppName", ParameterValue: input.appName },
    { ParameterKey: "ImageUri", ParameterValue: input.imageUri },
    { ParameterKey: "ContainerPort", ParameterValue: input.containerPort },
    { ParameterKey: "InstanceType", ParameterValue: (input.deployParams.instanceType as string) || "t3.small" },
    { ParameterKey: "VpcId", ParameterValue: input.vpcId },
    { ParameterKey: "SubnetId", ParameterValue: input.subnetId },
    { ParameterKey: "BuildId", ParameterValue: input.buildId },
  ];
}

async function appendEnvVarsParameter(
  cfnParams: Array<{ ParameterKey: string; ParameterValue: string }>,
  deployParams: Record<string, unknown>,
  s3: any,
  templateBucket: string,
  stackName: string,
  buildId: string,
  logger: Logger,
): Promise<void> {
  const rawEnvVars: unknown[] = Array.isArray(deployParams.envVars) ? deployParams.envVars : [];
  const envVars = normalizeEnvVars(rawEnvVars);

  if (envVars.length === 0) return;

  const envVarsJson = JSON.stringify(envVars);

  if (envVarsJson.length > 4000) {
    // Upload to S3 — CloudFormation parameter limit is 4096 chars
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const envVarsKey = `env-vars/${stackName}/${buildId}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: templateBucket,
      Key: envVarsKey,
      Body: envVarsJson,
      ContentType: "application/json",
    }));
    cfnParams.push({ ParameterKey: "EnvVarsS3Uri", ParameterValue: `s3://${templateBucket}/${envVarsKey}` });
    logger.debug(`Env vars uploaded to S3 (${envVarsJson.length} chars)`);
  } else {
    cfnParams.push({ ParameterKey: "EnvVarsJson", ParameterValue: envVarsJson });
  }
}

// ─── Cache Helpers ───────────────────────────────────────────────────────────

async function cacheDeployResult(
  buildId: string,
  rawMetadata: string | null | undefined,
  result: { appUrl: string; stackName: string },
  logger: Logger,
): Promise<void> {
  const existingMetadata = parseBuildMetadata(rawMetadata);
  const { error } = await supabaseAdmin.from("builds").update({
    status: "succeeded",
    build_metadata: JSON.stringify({ ...existingMetadata, ...result }),
    updated_at: new Date().toISOString(),
  }).eq("id", buildId);
  if (error) {
    logger.debug(`Failed to cache deploy result in DB: ${error.message}`);
  }
}
