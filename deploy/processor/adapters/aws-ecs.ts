import { join } from "node:path";
import { readFileSync } from "node:fs";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
  DestroyContext,
  DestroyResult,
} from "./types";
import {
  pushToEcr,
  getDefaultVpcAndSubnets,
  cleanupStuckStack,
  createOrUpdateStack,
  pollStackStatus,
  waitForStackDelete,
  type AwsCredentials,
} from "../aws-helpers";

/**
 * AWS ECS Fargate adapter.
 *
 * Handles deployments to AWS ECS Fargate via ECR + CloudFormation.
 * Builds Docker images locally, pushes to ECR, and provisions
 * infrastructure using the ecs-fargate.yml CloudFormation template.
 */
export class AwsEcsAdapter implements DeployAdapter {
  readonly id = "aws-ecs";

  /** Stored env vars from injectEnvVars, used during provisionInfrastructure */
  private pendingEnvVars: Array<{ name: string; value: string }> = [];

  /** AWS state populated by pushImage, consumed by provisionInfrastructure */
  private awsAccountId = "";
  private awsCredentials: AwsCredentials | null = null;

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "aws" && deployStrategy === "managed";
  }

  /**
   * Push Docker image to AWS ECR.
   */
  async pushImage(ctx: AdapterContext, localImage: string): Promise<PushImageResult> {
    const { repoName, shortId, region, providerCredentials, runCmd, appendLog } = ctx;

    const accessKeyId = providerCredentials.apiKey;
    const secretAccessKey = providerCredentials.apiSecret;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS credentials not configured on provider.");
    }

    const result = await pushToEcr({
      localImage,
      repoName,
      shortId,
      region,
      credentials: { accessKeyId, secretAccessKey },
      runCmd,
      appendLog,
    });

    // Store for provisionInfrastructure
    this.awsAccountId = result.accountId;
    this.awsCredentials = result.credentials;

    return { remoteImageUri: result.remoteImageUri, skipped: false };
  }

  /**
   * Store env vars for later injection into the CloudFormation template.
   *
   * For ECS, env vars are injected into the task definition's container
   * Environment section by modifying the CloudFormation template before upload.
   */
  async injectEnvVars(
    _ctx: AdapterContext,
    envVars: Array<{ name: string; value: string }>,
  ): Promise<void> {
    this.pendingEnvVars = envVars;
  }

  /**
   * Provision ECS Fargate infrastructure via CloudFormation.
   *
   * Steps:
   * 1. Read the ecs-fargate.yml CloudFormation template
   * 2. If env vars are present, inject them into the template's container definition
   * 3. Upload the (possibly modified) template to S3
   * 4. Create or update CloudFormation stack
   * 5. Handle ROLLBACK_COMPLETE state by deleting and recreating
   * 6. Poll stack status until complete or failure
   * 7. Extract AppUrl from stack outputs
   */
  async provisionInfrastructure(
    ctx: AdapterContext,
    imageUri: string,
  ): Promise<ProvisionResult> {
    const { deploymentId, repoName, region, providerCredentials, appendLog } = ctx;

    const accessKeyId = providerCredentials.apiKey;
    const secretAccessKey = providerCredentials.apiSecret;
    const credentials = this.awsCredentials || { accessKeyId, secretAccessKey };
    const accountId = this.awsAccountId || (await import("../aws-helpers").then(m => m.getAwsAccountId(region, credentials)));

    await appendLog("── CloudFormation Deploy ──────────");

    const codebuildProject = "image-builder";
    const templateBucket = `${codebuildProject}-templates-${accountId}`;
    const stackName = `${codebuildProject}-app-${repoName.replace(/[^a-zA-Z0-9-]/g, "-")}`;
    const containerPort = ctx.detectedStack.port || 3000;

    // 1. Read the ecs-fargate.yml template
    let templateBody: string;
    try {
      const templatePath = join(__dirname, "..", "..", "..", "image-builder", "deploy-templates", "ecs-fargate.yml");
      templateBody = readFileSync(templatePath, "utf-8");
    } catch {
      // Fallback: try relative to process.cwd()
      const templatePath = join(process.cwd(), "image-builder", "deploy-templates", "ecs-fargate.yml");
      templateBody = readFileSync(templatePath, "utf-8");
    }

    // 2. If env vars are present, inject them into the template
    const envVars = this.pendingEnvVars;
    let templateKey = "ecs-fargate.yml";

    if (envVars.length > 0) {
      let envYaml = "\n          Environment:";
      for (const ev of envVars) {
        const val = String(ev.value).replace(/"/g, '\\"');
        envYaml += `\n            - Name: ${ev.name}\n              Value: "${val}"`;
      }
      templateBody = templateBody.replace(
        "          Essential: true",
        "          Essential: true" + envYaml,
      );
      templateKey = `_tmp/${repoName}-${deploymentId.slice(0, 8)}.yml`;
      await appendLog(`ℹ Injected ${envVars.length} env vars into template`);
    }

    // 3. Upload template to S3
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region, credentials });
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

    // 4. Get default VPC and subnets
    const { vpcId, subnetIds } = await getDefaultVpcAndSubnets(region, credentials);
    if (!vpcId) {
      throw new Error("No default VPC found. Please configure a VPC for ECS deployment.");
    }
    if (subnetIds.length < 2) {
      throw new Error("At least 2 subnets in different AZs are required for ECS deployment.");
    }

    // Build CloudFormation parameters
    const params = [
      { ParameterKey: "AppName", ParameterValue: repoName },
      { ParameterKey: "ImageUri", ParameterValue: imageUri },
      { ParameterKey: "ContainerPort", ParameterValue: String(containerPort) },
      { ParameterKey: "Cpu", ParameterValue: "512" },
      { ParameterKey: "Memory", ParameterValue: "1024" },
      { ParameterKey: "VpcId", ParameterValue: vpcId },
      { ParameterKey: "SubnetIds", ParameterValue: subnetIds.join(",") },
      { ParameterKey: "BuildId", ParameterValue: deploymentId },
    ];

    if (envVars.length > 0) {
      params.push({
        ParameterKey: "EnvVarsJson",
        ParameterValue: JSON.stringify(envVars),
      });
    }

    // 5. Create or update CloudFormation stack
    const { CloudFormationClient } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({ region, credentials });

    // Pre-create the ECS log group to avoid AlreadyExists errors in CFN
    try {
      const { CloudWatchLogsClient, CreateLogGroupCommand, PutRetentionPolicyCommand } = await import(
        "@aws-sdk/client-cloudwatch-logs"
      );
      const logs = new CloudWatchLogsClient({ region, credentials });
      const logGroupName = `/ecs/${repoName}`;
      try {
        await logs.send(new CreateLogGroupCommand({ logGroupName }));
        await logs.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays: 14 }));
        await appendLog(`✓ Created log group ${logGroupName}`);
      } catch (logErr: any) {
        if (logErr.name === "ResourceAlreadyExistsException") {
          await appendLog(`ℹ Log group ${logGroupName} already exists`);
        }
      }
    } catch {
      // CloudWatch Logs client not available — continue without pre-creating
    }

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

    // 6. Poll stack status
    return await pollStackStatus({ cfn, stackName, isUpdate, appendLog });
  }

  /**
   * No additional post-deploy steps for ECS.
   * The container starts automatically once the ECS service is created/updated.
   */
  async runPostDeploy(_ctx: AdapterContext, _provision: ProvisionResult): Promise<void> {
    // ECS containers start automatically — nothing to do here
  }

  async destroy(ctx: DestroyContext): Promise<DestroyResult> {
    const errors: string[] = [];
    const credentials: AwsCredentials = { accessKeyId: ctx.providerCredentials.apiKey, secretAccessKey: ctx.providerCredentials.apiSecret };
    const stackName = `image-builder-app-${ctx.appName}`;

    await ctx.appendLog("── Destroy AWS ECS Resources ──────");

    // Delete CloudFormation stack
    try {
      const { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
      const cfn = new CloudFormationClient({ region: ctx.region, credentials });
      try {
        await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
        await cfn.send(new DeleteStackCommand({ StackName: stackName }));
        await waitForStackDelete(cfn, stackName, ctx.appendLog);
      } catch (e: any) { if (!e.message?.includes("does not exist")) throw e; }
    } catch (e: any) { errors.push(`CloudFormation: ${e.message}`); }

    // Delete ECR repos
    await this.deleteEcrRepo(ctx.appName, ctx.region, credentials, errors);
    await this.deleteEcrRepo(`${ctx.appName}-cache`, ctx.region, credentials, []);

    return {
      success: errors.length === 0,
      message: errors.length > 0 ? `Partially destroyed: ${errors.join("; ")}` : `Destroyed stack ${stackName}, ECR repo ${ctx.appName}`,
      errors,
    };
  }

  private async deleteEcrRepo(repoName: string, region: string, credentials: AwsCredentials, errors: string[]): Promise<void> {
    try {
      const { ECRClient, DeleteRepositoryCommand, BatchDeleteImageCommand, ListImagesCommand } = await import("@aws-sdk/client-ecr");
      const ecr = new ECRClient({ region, credentials });
      try {
        const listed = await ecr.send(new ListImagesCommand({ repositoryName: repoName }));
        if (listed.imageIds && listed.imageIds.length > 0) {
          await ecr.send(new BatchDeleteImageCommand({ repositoryName: repoName, imageIds: listed.imageIds }));
        }
      } catch {}
      await ecr.send(new DeleteRepositoryCommand({ repositoryName: repoName, force: true }));
    } catch (e: any) {
      if (!e.name?.includes("RepositoryNotFoundException")) errors.push(`ECR ${repoName}: ${e.message}`);
    }
  }
}
