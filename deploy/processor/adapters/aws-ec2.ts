import { join } from "node:path";
import { readFileSync } from "node:fs";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
} from "./types";

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

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "aws" && deployStrategy === "vps";
  }

  /**
   * Push Docker image to AWS ECR.
   *
   * Same ECR push flow as the AWS ECS adapter:
   * 1. Get AWS account ID via STS
   * 2. Create ECR repository if it doesn't exist
   * 3. Login to ECR
   * 4. Tag and push Docker image to ECR
   * 5. Return the ECR image URI
   */
  async pushImage(ctx: AdapterContext, localImage: string): Promise<PushImageResult> {
    const { repoName, shortId, region, providerCredentials, runCmd, appendLog } = ctx;

    const accessKeyId = providerCredentials.apiKey;
    const secretAccessKey = providerCredentials.apiSecret;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS credentials not configured on provider.");
    }

    const credentials = { accessKeyId, secretAccessKey };

    await appendLog("── Push Image to ECR ───────────────");

    // 1. Get AWS account ID via STS
    const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const sts = new STSClient({ region, credentials });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    const accountId = identity.Account || "";
    if (!accountId) {
      throw new Error("Could not determine AWS account ID from credentials");
    }

    const imageRepoName = repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const ecrUri = `${accountId}.dkr.ecr.${region}.amazonaws.com`;
    const remoteImageUri = `${ecrUri}/${imageRepoName}:${shortId}`;

    // 2. Create ECR repository if it doesn't exist
    const { ECRClient, CreateRepositoryCommand, DescribeRepositoriesCommand } = await import(
      "@aws-sdk/client-ecr"
    );
    const ecr = new ECRClient({ region, credentials });

    try {
      await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [imageRepoName] }));
      await appendLog("✓ ECR repository already exists");
    } catch {
      try {
        await ecr.send(new CreateRepositoryCommand({ repositoryName: imageRepoName }));
        await appendLog("✓ ECR repository created");
      } catch (createErr: any) {
        if (!createErr.name?.includes("AlreadyExists")) {
          throw new Error(`Failed to create ECR repository: ${createErr.message}`);
        }
        await appendLog("✓ ECR repository already exists");
      }
    }

    // 3. Login to ECR
    const { GetAuthorizationTokenCommand } = await import("@aws-sdk/client-ecr");
    const authResult = await ecr.send(new GetAuthorizationTokenCommand({}));
    const authData = authResult.authorizationData?.[0];
    if (!authData?.authorizationToken) {
      throw new Error("Failed to get ECR authorization token");
    }

    const decodedToken = Buffer.from(authData.authorizationToken, "base64").toString("utf-8");
    const [username, password] = decodedToken.split(":");

    const loginResult = await runCmd(
      "docker",
      ["login", "--username", username, "--password", password, ecrUri],
    );
    if (loginResult.code !== 0) {
      throw new Error(`ECR login failed: ${loginResult.output.split("\n").slice(-3).join(" ")}`);
    }
    await appendLog("✓ Logged in to ECR");

    // 4. Tag and push Docker image
    const tagResult = await runCmd("docker", ["tag", localImage, remoteImageUri]);
    if (tagResult.code !== 0) {
      throw new Error(`Docker tag failed: ${tagResult.output}`);
    }

    // Also tag as latest
    const latestUri = `${ecrUri}/${imageRepoName}:latest`;
    await runCmd("docker", ["tag", localImage, latestUri]);

    const pushResult = await runCmd("docker", ["push", remoteImageUri]);
    if (pushResult.code !== 0) {
      throw new Error(`Docker push failed: ${pushResult.output.split("\n").slice(-5).join("\n")}`);
    }
    await runCmd("docker", ["push", latestUri]);

    await appendLog(`✓ Image pushed: ${remoteImageUri}`);

    // Store accountId and credentials for provisionInfrastructure
    (ctx as any)._awsAccountId = accountId;
    (ctx as any)._awsCredentials = credentials;

    return { remoteImageUri, skipped: false };
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
    const credentials = (ctx as any)._awsCredentials || { accessKeyId, secretAccessKey };
    const accountId =
      (ctx as any)._awsAccountId || (await this.getAccountId(region, credentials));

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
    const { vpcId, subnetIds } = await this.getDefaultVpcAndSubnets(region, credentials);
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
    const {
      CloudFormationClient,
      CreateStackCommand,
      UpdateStackCommand,
      DescribeStacksCommand,
      DeleteStackCommand,
    } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({ region, credentials });

    // Handle ROLLBACK_COMPLETE state by deleting and recreating
    try {
      const descResult = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      const existingStack = descResult.Stacks?.[0];
      if (existingStack) {
        const stackStatus = existingStack.StackStatus || "";
        if (
          stackStatus === "ROLLBACK_COMPLETE" ||
          stackStatus === "ROLLBACK_FAILED" ||
          stackStatus === "CREATE_FAILED" ||
          stackStatus === "DELETE_FAILED"
        ) {
          await appendLog(`ℹ Stack in ${stackStatus} — deleting before re-create`);
          await cfn.send(new DeleteStackCommand({ StackName: stackName }));
          await this.waitForStackDelete(cfn, stackName, appendLog);
        }
      }
    } catch {
      // Stack doesn't exist yet — that's fine
    }

    // Try create, fall back to update if stack already exists
    let isUpdate = false;
    try {
      await cfn.send(
        new CreateStackCommand({
          StackName: stackName,
          TemplateURL: templateUrl,
          Parameters: params,
          Capabilities: ["CAPABILITY_NAMED_IAM"],
          Tags: [
            { Key: "BuildId", Value: deploymentId },
            { Key: "ManagedBy", Value: "image-builder" },
          ],
          OnFailure: "ROLLBACK",
        }),
      );
      await appendLog("✓ CloudFormation stack creation initiated");
    } catch (createErr: any) {
      if (createErr.name === "AlreadyExistsException" || createErr.message?.includes("already exists")) {
        isUpdate = true;
        try {
          await cfn.send(
            new UpdateStackCommand({
              StackName: stackName,
              TemplateURL: templateUrl,
              Parameters: params,
              Capabilities: ["CAPABILITY_NAMED_IAM"],
            }),
          );
          await appendLog("✓ CloudFormation stack update initiated");
        } catch (updateErr: any) {
          if (updateErr.message?.includes("No updates are to be performed")) {
            await appendLog("ℹ No infrastructure changes needed");
            return await this.extractStackOutputs(cfn, stackName, appendLog);
          }
          throw new Error(`CloudFormation update failed: ${updateErr.message}`);
        }
      } else {
        throw new Error(`CloudFormation create failed: ${createErr.message}`);
      }
    }

    // 7. Poll stack status until complete or failure
    const successStatuses = isUpdate
      ? ["UPDATE_COMPLETE"]
      : ["CREATE_COMPLETE"];
    const failurePatterns = [
      "ROLLBACK_COMPLETE",
      "ROLLBACK_FAILED",
      "CREATE_FAILED",
      "DELETE_COMPLETE",
      "UPDATE_ROLLBACK_COMPLETE",
      "UPDATE_FAILED",
    ];

    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((r) => setTimeout(r, 15_000));

      try {
        const stackResult = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
        const stack = stackResult.Stacks?.[0];
        if (!stack) {
          if (attempt % 4 === 0) {
            await appendLog("ℹ Waiting for CloudFormation stack...");
          }
          continue;
        }

        const stackStatus = stack.StackStatus || "";

        if (successStatuses.includes(stackStatus)) {
          const outputs = Object.fromEntries(
            (stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]),
          );
          const appUrl = outputs.AppUrl || "";
          const publicIp = outputs.PublicIp || "";
          await appendLog(`✓ CloudFormation stack: ${stackStatus}`);
          if (appUrl) {
            await appendLog(`✓ App URL: ${appUrl}`);
          }
          if (publicIp) {
            await appendLog(`✓ Public IP: ${publicIp}`);
          }
          return {
            appUrl,
            serverIp: publicIp,
            outputs,
          };
        }

        if (failurePatterns.some((p) => stackStatus.includes(p))) {
          const reason = stack.StackStatusReason || stackStatus;
          throw new Error(`CloudFormation stack failed: ${stackStatus} — ${reason}`);
        }

        // Log progress periodically
        if (attempt % 4 === 0) {
          await appendLog(`ℹ CloudFormation: ${stackStatus}...`);
        }
      } catch (pollErr: any) {
        if (pollErr.message?.includes("CloudFormation stack failed")) {
          throw pollErr;
        }
        if (attempt % 4 === 0) {
          await appendLog("ℹ Waiting for CloudFormation stack...");
        }
      }
    }

    throw new Error("CloudFormation stack did not complete within timeout (15 minutes)");
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

  // ── Private helpers ──────────────────────────────────────────────

  private async getAccountId(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
  ): Promise<string> {
    const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const sts = new STSClient({ region, credentials });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return identity.Account || "";
  }

  private async getDefaultVpcAndSubnets(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
  ): Promise<{ vpcId: string; subnetIds: string[] }> {
    const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand } = await import(
      "@aws-sdk/client-ec2"
    );
    const ec2 = new EC2Client({ region, credentials });

    const vpcsResult = await ec2.send(
      new DescribeVpcsCommand({
        Filters: [{ Name: "is-default", Values: ["true"] }],
      }),
    );
    const vpcId = vpcsResult.Vpcs?.[0]?.VpcId || "";
    if (!vpcId) return { vpcId: "", subnetIds: [] };

    const subnetsResult = await ec2.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: "vpc-id", Values: [vpcId] }],
      }),
    );
    const subnetIds = (subnetsResult.Subnets || []).map((s) => s.SubnetId || "").filter(Boolean);

    return { vpcId, subnetIds };
  }

  private async waitForStackDelete(
    cfn: any,
    stackName: string,
    appendLog: (line: string) => Promise<void>,
  ): Promise<void> {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5_000));
      try {
        const { DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
        const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
        const stack = result.Stacks?.[0];
        if (!stack || stack.StackStatus === "DELETE_COMPLETE") {
          await appendLog("✓ Previous stack deleted");
          return;
        }
      } catch {
        // Stack no longer exists
        await appendLog("✓ Previous stack deleted");
        return;
      }
    }
    throw new Error("Timed out waiting for stack deletion");
  }

  private async extractStackOutputs(
    cfn: any,
    stackName: string,
    appendLog: (line: string) => Promise<void>,
  ): Promise<ProvisionResult> {
    const { DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
    const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = result.Stacks?.[0];
    const outputs = Object.fromEntries(
      (stack?.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]),
    );
    const appUrl = outputs.AppUrl || "";
    const publicIp = outputs.PublicIp || "";
    if (appUrl) {
      await appendLog(`✓ App URL: ${appUrl}`);
    }
    if (publicIp) {
      await appendLog(`✓ Public IP: ${publicIp}`);
    }
    return { appUrl, serverIp: publicIp, outputs };
  }
}
