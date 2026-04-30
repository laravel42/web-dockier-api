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
  getAwsAccountId,
  getDefaultVpcAndSubnets,
  cleanupStuckStack,
  createOrUpdateStack,
  pollStackStatus,
  waitForStackDelete,
  type AwsCredentials,
} from "../aws-helpers";

/**
 * AWS EC2 adapter.
 *
 * Handles VPS-style AWS deployments via ECR + CloudFormation.
 * Builds Docker images locally, pushes to ECR, and provisions
 * infrastructure using the ec2.yml CloudFormation template.
 *
 * The ec2.yml template handles self-hosted services, env vars,
 * and post-deploy commands internally via cfn-init steps.
 */
export class AwsEc2Adapter implements DeployAdapter {
  readonly id = "aws-ec2";

  /** Stored env vars from injectEnvVars, used as EnvVarsJson CloudFormation parameter */
  private pendingEnvVars: Array<{ name: string; value: string }> = [];

  /** AWS state populated by pushImage, consumed by provisionInfrastructure */
  private awsAccountId = "";
  private awsCredentials: AwsCredentials | null = null;

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "aws" && deployStrategy === "vps";
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
   * Store env vars for later use as the EnvVarsJson CloudFormation parameter.
   *
   * For EC2, env vars are passed as a JSON string parameter to the CloudFormation
   * template, which uses them in cfn-init scripts to configure the container.
   */
  async injectEnvVars(
    _ctx: AdapterContext,
    envVars: Array<{ name: string; value: string }>,
  ): Promise<void> {
    this.pendingEnvVars = envVars;
  }

  /**
   * Provision EC2 infrastructure via CloudFormation.
   *
   * Steps:
   * 1. Read the ec2.yml CloudFormation template
   * 2. Upload template to S3
   * 3. Build CloudFormation parameters (AppName, ImageUri, ContainerPort,
   *    InstanceType, VpcId, SubnetId, EnvVarsJson, SelfHostedServices,
   *    TechStack, BuildId)
   * 4. Derive SelfHostedServices from event context
   * 5. Handle ROLLBACK_COMPLETE state by deleting and recreating
   * 6. Create or update CloudFormation stack
   * 7. Poll stack status until complete or failure
   * 8. Extract AppUrl and PublicIp from stack outputs
   */
  async provisionInfrastructure(
    ctx: AdapterContext,
    imageUri: string,
  ): Promise<ProvisionResult> {
    const { deploymentId, repoName, region, providerCredentials, event, appendLog } = ctx;

    const accessKeyId = providerCredentials.apiKey;
    const secretAccessKey = providerCredentials.apiSecret;
    const credentials = this.awsCredentials || { accessKeyId, secretAccessKey };
    const accountId = this.awsAccountId || (await getAwsAccountId(region, credentials));

    await appendLog("── CloudFormation Deploy ──────────");

    const codebuildProject = "image-builder";
    const templateBucket = `${codebuildProject}-templates-${accountId}`;
    const stackName = `${codebuildProject}-app-${repoName.replace(/[^a-zA-Z0-9-]/g, "-")}`;
    const containerPort = ctx.detectedStack.port || 3000;

    // 1. Read the ec2.yml template
    let templateBody: string;
    try {
      const templatePath = join(__dirname, "..", "..", "..", "image-builder", "deploy-templates", "ec2.yml");
      templateBody = readFileSync(templatePath, "utf-8");
    } catch {
      // Fallback: try relative to process.cwd()
      const templatePath = join(process.cwd(), "image-builder", "deploy-templates", "ec2.yml");
      templateBody = readFileSync(templatePath, "utf-8");
    }

    // 2. Upload template to S3
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region, credentials });
    const templateKey = "ec2.yml";
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

    // 3. Get default VPC and subnets (EC2 uses a single SubnetId)
    const { vpcId, subnetIds } = await getDefaultVpcAndSubnets(region, credentials);
    if (!vpcId) {
      throw new Error("No default VPC found. Please configure a VPC for EC2 deployment.");
    }
    if (subnetIds.length === 0) {
      throw new Error("No subnets found in the default VPC for EC2 deployment.");
    }

    // 4. Derive SelfHostedServices from event context
    const selfHostedServices: string[] = [];
    const hasDbEnvVars = (event.envVars || []).some((v) =>
      ["DB_CONNECTION", "DB_DATABASE", "DB_HOST"].includes(v.name),
    );
    if (event.techStack?.some((t) => t.toLowerCase() === "laravel") || hasDbEnvVars) {
      selfHostedServices.push("database");
    }

    // 5. Build CloudFormation parameters
    const params: Array<{ ParameterKey: string; ParameterValue: string }> = [
      { ParameterKey: "AppName", ParameterValue: repoName },
      { ParameterKey: "ImageUri", ParameterValue: imageUri },
      { ParameterKey: "ContainerPort", ParameterValue: String(containerPort) },
      { ParameterKey: "InstanceType", ParameterValue: "t3.small" },
      { ParameterKey: "VpcId", ParameterValue: vpcId },
      { ParameterKey: "SubnetId", ParameterValue: subnetIds[0] },
      { ParameterKey: "BuildId", ParameterValue: deploymentId },
    ];

    // Pass env vars as EnvVarsJson
    const envVars = this.pendingEnvVars;
    if (envVars.length > 0) {
      params.push({
        ParameterKey: "EnvVarsJson",
        ParameterValue: JSON.stringify(envVars),
      });
    }

    // Pass SelfHostedServices
    if (selfHostedServices.length > 0) {
      params.push({
        ParameterKey: "SelfHostedServices",
        ParameterValue: selfHostedServices.join(","),
      });
    }

    // Pass TechStack
    if (event.techStack && event.techStack.length > 0) {
      params.push({
        ParameterKey: "TechStack",
        ParameterValue: event.techStack.join(","),
      });
    }

    // 6. Create or update CloudFormation stack
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

    // 7. Poll stack status until complete or failure
    return await pollStackStatus({ cfn, stackName, isUpdate, appendLog });
  }

  /**
   * No additional post-deploy steps for EC2.
   *
   * The ec2.yml template handles everything via cfn-init:
   * - MySQL/PostgreSQL setup
   * - Docker pull and container start
   * - nginx reverse proxy
   * - Laravel migrations, queue workers, scheduler cron
   */
  async runPostDeploy(_ctx: AdapterContext, _provision: ProvisionResult): Promise<void> {
    // EC2 cfn-init handles all post-deploy steps — nothing to do here
  }

  async destroy(ctx: DestroyContext): Promise<DestroyResult> {
    const errors: string[] = [];
    const credentials: AwsCredentials = { accessKeyId: ctx.providerCredentials.apiKey, secretAccessKey: ctx.providerCredentials.apiSecret };
    const stackName = `image-builder-app-${ctx.appName}`;

    await ctx.appendLog("── Destroy AWS EC2 Resources ──────");

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
