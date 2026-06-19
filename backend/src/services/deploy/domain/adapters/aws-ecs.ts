/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AdapterContext,
  ProvisionResult,
} from "./types.js";
import { AwsCloudFormationAdapter } from "./aws-cfn-base.js";
import {
  getDefaultVpcAndSubnets,
  cleanupStuckStack,
  createOrUpdateStack,
  pollStackStatus,
  readCfnTemplate,
  stackNameFor,
} from "../aws-helpers.js";
import { getAwsAccountId } from "../../../../lib/aws.js";

/**
 * AWS ECS Fargate adapter.
 *
 * Handles deployments to AWS ECS Fargate via ECR + CloudFormation.
 * Builds Docker images locally, pushes to ECR, and provisions
 * infrastructure using the ecs-fargate.yml CloudFormation template.
 */
export class AwsEcsAdapter extends AwsCloudFormationAdapter {
  readonly id = "aws-ecs";

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "aws" && deployStrategy === "managed";
  }

  protected getDestroyLogHeader(): string {
    return "AWS ECS Resources";
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
    const credentials = ctx.state.awsCredentials || { accessKeyId, secretAccessKey };
    const accountId = ctx.state.awsAccountId || (await getAwsAccountId(region, credentials));

    await appendLog("── CloudFormation Deploy ──────────");

    const codebuildProject = "image-builder";
    const templateBucket = `${codebuildProject}-templates-${accountId}`;
    const stackName = stackNameFor(repoName);
    const containerPort = ctx.detectedStack.port || 3000;

    // 1. Read the ecs-fargate.yml template
    let templateBody = readCfnTemplate("ecs-fargate.yml");

    // 2. If env vars are present, inject them into the template
    const envVars = ctx.state.pendingEnvVars || [];
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
      const envVarsJson = JSON.stringify(envVars);
      if (envVarsJson.length <= 4000) {
        params.push({
          ParameterKey: "EnvVarsJson",
          ParameterValue: envVarsJson,
        });
      }
      // When > 4000 chars, env vars are already injected into the template YAML above,
      // so we skip the parameter to avoid CloudFormation's 4096 char limit.
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
        } else {
          await appendLog(`⚠ Failed to pre-create log group: ${logErr.message}`);
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
}
