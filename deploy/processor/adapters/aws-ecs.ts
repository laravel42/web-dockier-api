import { join } from "node:path";
import { readFileSync } from "node:fs";
import type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
} from "./types";

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

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "aws" && deployStrategy === "managed";
  }

  /**
   * Push Docker image to AWS ECR.
   *
   * Steps:
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
        // If it already exists (race condition), that's fine
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

    // runCmd doesn't support stdin, so pass password via --password flag
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

    // Store accountId for provisionInfrastructure
    (ctx as any)._awsAccountId = accountId;
    (ctx as any)._awsCredentials = credentials;

    return { remoteImageUri, skipped: false };
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
    const { vpcId, subnetIds } = await this.getDefaultVpcAndSubnets(region, credentials);
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
    const {
      CloudFormationClient,
      CreateStackCommand,
      UpdateStackCommand,
      DescribeStacksCommand,
      DeleteStackCommand,
    } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({ region, credentials });

    // Check for stuck stacks that need cleanup
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
          // Wait for delete to complete
          await this.waitForStackDelete(cfn, stackName, appendLog);
        }
      }
    } catch {
      // Stack doesn't exist yet — that's fine
    }

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
          // "No updates are to be performed" is not an error
          if (updateErr.message?.includes("No updates are to be performed")) {
            await appendLog("ℹ No infrastructure changes needed");
            // Extract outputs from existing stack
            return await this.extractStackOutputs(cfn, stackName, appendLog);
          }
          throw new Error(`CloudFormation update failed: ${updateErr.message}`);
        }
      } else {
        throw new Error(`CloudFormation create failed: ${createErr.message}`);
      }
    }

    // 6. Poll stack status
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

    let appUrl = "";
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
          appUrl = outputs.AppUrl || "";
          await appendLog(`✓ CloudFormation stack: ${stackStatus}`);
          if (appUrl) {
            await appendLog(`✓ App URL: ${appUrl}`);
          }
          return {
            appUrl,
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
   * No additional post-deploy steps for ECS.
   * The container starts automatically once the ECS service is created/updated.
   */
  async runPostDeploy(_ctx: AdapterContext, _provision: ProvisionResult): Promise<void> {
    // ECS containers start automatically — nothing to do here
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
    if (appUrl) {
      await appendLog(`✓ App URL: ${appUrl}`);
    }
    return { appUrl, outputs };
  }
}
