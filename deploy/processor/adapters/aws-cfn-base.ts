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
  stackNameFor,
  deleteEcrRepo,
  destroyCfnStack,
} from "../aws-helpers";
import { type AwsCredentials } from "../../../lib/aws";

/**
 * Abstract base class for AWS CloudFormation-based adapters.
 *
 * Provides shared implementations of pushImage() and destroy() that are
 * identical across all AWS CFN adapters (ECS, EC2, and future strategies).
 * Subclasses only need to implement provisionInfrastructure(), injectEnvVars(),
 * and runPostDeploy() — the parts that actually differ between strategies.
 */
export abstract class AwsCloudFormationAdapter implements DeployAdapter {
  abstract readonly id: string;

  abstract supports(provider: string, deployStrategy: string): boolean;

  /**
   * Push Docker image to AWS ECR.
   *
   * Shared across all AWS adapters — the ECR push flow is identical regardless
   * of whether the downstream infrastructure is ECS, EC2, or something else.
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

    // Store for provisionInfrastructure via typed state
    ctx.state.awsAccountId = result.accountId;
    ctx.state.awsCredentials = result.credentials;

    return { remoteImageUri: result.remoteImageUri, skipped: false };
  }

  /**
   * Store env vars for later use during provisionInfrastructure.
   *
   * Default implementation stores them on ctx.state.pendingEnvVars.
   * Subclasses can override if they need different behavior.
   */
  async injectEnvVars(
    ctx: AdapterContext,
    envVars: Array<{ name: string; value: string }>,
  ): Promise<void> {
    ctx.state.pendingEnvVars = envVars;
  }

  abstract provisionInfrastructure(
    ctx: AdapterContext,
    imageUri: string,
  ): Promise<ProvisionResult>;

  abstract runPostDeploy(ctx: AdapterContext, provision: ProvisionResult): Promise<void>;

  /**
   * Destroy AWS resources: CloudFormation stack + ECR repositories.
   *
   * Shared across all AWS CFN adapters — the teardown flow is identical.
   * Subclasses can override getDestroyLogHeader() to customize the log prefix.
   */
  async destroy(ctx: DestroyContext): Promise<DestroyResult> {
    const errors: string[] = [];
    const credentials: AwsCredentials = {
      accessKeyId: ctx.providerCredentials.apiKey,
      secretAccessKey: ctx.providerCredentials.apiSecret,
    };
    const stackName = stackNameFor(ctx.repoName);

    await ctx.appendLog(`── Destroy ${this.getDestroyLogHeader()} ──────`);

    await destroyCfnStack(stackName, ctx.region, credentials, ctx.appendLog, errors);

    // Delete ECR repos — sanitize the same way pushToEcr does during provisioning
    const ecrRepoName = ctx.repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    await deleteEcrRepo(ecrRepoName, ctx.region, credentials, errors);
    await deleteEcrRepo(`${ecrRepoName}-cache`, ctx.region, credentials, errors);

    return {
      success: errors.length === 0,
      message: errors.length > 0
        ? `Partially destroyed: ${errors.join("; ")}`
        : `Destroyed stack ${stackName} and ECR repositories`,
      errors,
    };
  }

  /**
   * Override in subclasses to customize the destroy log header.
   * Default: "AWS Resources"
   */
  protected getDestroyLogHeader(): string {
    return "AWS Resources";
  }
}
