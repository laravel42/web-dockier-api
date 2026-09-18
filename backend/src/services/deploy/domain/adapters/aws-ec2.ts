import type {
  AdapterContext,
  ProvisionResult,
} from "./types.js";
import { AwsCloudFormationAdapter } from "./aws-cfn-base.js";
import { getS3, getCfn } from "../../../../lib/aws-sdk.js";
import {
  getDefaultVpcAndSubnets,
  cleanupStuckStack,
  createOrUpdateStack,
  pollStackStatus,
  readCfnTemplate,
} from "../infra/aws-helpers.js";
import { stackNameFor } from "../../../../lib/naming.js";
import { getAwsAccountId, ensureS3Bucket } from "../../../../lib/aws.js";
import { toAwsCredentials } from "../../../../lib/provider-credentials.js";

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
export class AwsEc2Adapter extends AwsCloudFormationAdapter {
  readonly id = "aws-ec2";

  supports(provider: string, deployStrategy: string): boolean {
    return provider === "aws" && deployStrategy === "vps";
  }

  protected getDestroyLogHeader(): string {
    return "AWS EC2 Resources";
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
    const { deploymentId, repoName, region, credential, event, appendLog } = ctx;

    const credentials = ctx.state.awsCredentials || toAwsCredentials(credential);
    const accountId = ctx.state.awsAccountId || (await getAwsAccountId(region, credentials));

    await appendLog("── CloudFormation Deploy ──────────");

    const codebuildProject = "image-builder";
    const templateBucket = `${codebuildProject}-templates-${accountId}`;
    const stackName = stackNameFor(repoName);
    const containerPort = ctx.detectedStack.port || 3000;
    await appendLog(`ℹ Stack: ${stackName} | Port: ${containerPort}`);

    // 1. Read the ec2.yml template
    const templateBody = readCfnTemplate("ec2.yml");

    // 2. Upload template to S3 (ensure bucket exists first)
    const { S3Client, PutObjectCommand } = await getS3();
    const s3 = new S3Client({ region, credentials });

    await ensureS3Bucket(region, credentials, templateBucket);

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
    await appendLog(`✓ VPC: ${vpcId} | Subnet: ${subnetIds[0]}`);


    // 4. Derive SelfHostedServices from event context
    const selfHostedServices: string[] = [];
    const hasDbEnvVars = (ctx.state.pendingEnvVars || []).some((v) =>
      ["DB_CONNECTION", "DB_DATABASE", "DB_HOST"].includes(v.name),
    );
    if (event.techStack?.some((t) => t.toLowerCase() === "laravel") || hasDbEnvVars) {
      selfHostedServices.push("database");
    }

    // Also include services explicitly declared in the deploy event (e.g. from templates)
    if (event.services) {
      for (const svc of event.services) {
        if (svc.mode === "vps" && !selfHostedServices.includes(svc.type)) {
          selfHostedServices.push(svc.type);
        }
      }
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

    // Pass env vars — use S3 if the JSON exceeds CloudFormation's 4096 char limit
    const envVars = ctx.state.pendingEnvVars || [];
    if (envVars.length > 0) {
      const envVarsJson = JSON.stringify(envVars);
      if (envVarsJson.length > 4000) {
        // Upload env vars to S3 and pass the URI as a parameter
        const envVarsKey = `env-vars/${stackName}/${deploymentId}.json`;
        await s3.send(
          new PutObjectCommand({
            Bucket: templateBucket,
            Key: envVarsKey,
            Body: envVarsJson,
            ContentType: "application/json",
          }),
        );
        params.push({
          ParameterKey: "EnvVarsS3Uri",
          ParameterValue: `s3://${templateBucket}/${envVarsKey}`,
        });
        await appendLog("✓ Env vars uploaded to S3 (too large for inline parameter)");
      } else {
        params.push({
          ParameterKey: "EnvVarsJson",
          ParameterValue: envVarsJson,
        });
      }
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
    const { CloudFormationClient } = await getCfn();
    const cfn = new CloudFormationClient({ region, credentials });

    await cleanupStuckStack(cfn, stackName, appendLog);

    await appendLog("ℹ Creating/updating CloudFormation stack...");
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
}
