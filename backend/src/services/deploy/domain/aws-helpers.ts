import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
} from "@aws-sdk/client-ec2";
import {
  ECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
  GetAuthorizationTokenCommand,
  DeleteRepositoryCommand,
} from "@aws-sdk/client-ecr";
import {
  CloudFormationClient,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  type Output,
} from "@aws-sdk/client-cloudformation";
import type { RunCmdFn } from "./run-cmd.js";
import type { ProvisionResult } from "./adapters/types.js";
import { getAwsAccountId, type AwsCredentials } from "../../../lib/aws.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PushToEcrResult {
  /** Full ECR image URI with tag (e.g., 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:abc12345) */
  remoteImageUri: string;
  /** AWS account ID resolved via STS */
  accountId: string;
  /** Credentials used (passed through for downstream use) */
  credentials: AwsCredentials;
}

// ─── CloudFormation Template Reader ────────────────────────────────

/**
 * Read a CloudFormation template from the cfn-templates directory.
 *
 * Tries __dirname-relative path first (co-located in domain/cfn-templates/),
 * then falls back to process.cwd()-relative path (works in local dev).
 */
export function readCfnTemplate(templateName: string): string {
  try {
    const templatePath = join(__dirname, "cfn-templates", templateName);
    return readFileSync(templatePath, "utf-8");
  } catch {
    const templatePath = join(process.cwd(), "src", "services", "deploy", "domain", "cfn-templates", templateName);
    return readFileSync(templatePath, "utf-8");
  }
}

// ─── ECR Helpers ───────────────────────────────────────────────────

/**
 * Get the default VPC and its subnets for a given region.
 * Returns empty values if no default VPC exists.
 */
export async function getDefaultVpcAndSubnets(
  region: string,
  credentials: AwsCredentials,
): Promise<{ vpcId: string; subnetIds: string[] }> {
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

/**
 * Push a Docker image to AWS ECR.
 *
 * Handles the full flow: STS identity → create repo → login → tag → push.
 * Returns the remote image URI, account ID, and credentials for downstream use.
 */
export async function pushToEcr(opts: {
  localImage: string;
  repoName: string;
  shortId: string;
  region: string;
  credentials: AwsCredentials;
  runCmd: RunCmdFn;
  appendLog: (line: string) => Promise<void>;
}): Promise<PushToEcrResult> {
  const { localImage, repoName, shortId, region, credentials, runCmd, appendLog } = opts;

  await appendLog("── Push Image to ECR ───────────────");

  // 1. Get AWS account ID via STS
  const accountId = await getAwsAccountId(region, credentials);
  if (!accountId) {
    throw new Error("Could not determine AWS account ID from credentials");
  }

  const imageRepoName = repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const ecrUri = `${accountId}.dkr.ecr.${region}.amazonaws.com`;
  const remoteImageUri = `${ecrUri}/${imageRepoName}:${shortId}`;

  // 2. Create ECR repository if it doesn't exist
  const ecr = new ECRClient({ region, credentials });

  try {
    await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [imageRepoName] }));
    await appendLog("✓ ECR repository already exists");
  } catch {
    try {
      await ecr.send(new CreateRepositoryCommand({ repositoryName: imageRepoName }));
      await appendLog("✓ ECR repository created");
    } catch (createErr: unknown) {
      if (!(createErr instanceof Error) || !createErr.name?.includes("AlreadyExists")) {
        const msg = createErr instanceof Error ? createErr.message : String(createErr);
        throw new Error(`Failed to create ECR repository: ${msg}`);
      }
      await appendLog("✓ ECR repository already exists");
    }
  }

  // 3. Login to ECR
  const authResult = await ecr.send(new GetAuthorizationTokenCommand({}));
  const authData = authResult.authorizationData?.[0];
  if (!authData?.authorizationToken) {
    throw new Error("Failed to get ECR authorization token");
  }

  const decodedToken = Buffer.from(authData.authorizationToken, "base64").toString("utf-8");
  const [username, password] = decodedToken.split(":");

  const loginResult = await runCmd(
    "docker",
    ["login", "--username", username, "--password-stdin", ecrUri],
    { stdin: password },
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

  return { remoteImageUri, accountId, credentials };
}

// ─── CloudFormation Helpers ────────────────────────────────────────

/** Status values that indicate a stack needs cleanup before re-creation. */
export const CFN_STUCK_STATUSES = [
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "CREATE_FAILED",
  "DELETE_FAILED",
] as const;

/** Status patterns that indicate a stack operation has failed. */
export const CFN_FAILURE_PATTERNS = [
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "CREATE_FAILED",
  "DELETE_COMPLETE",
  "UPDATE_ROLLBACK_COMPLETE",
  "UPDATE_FAILED",
] as const;

/**
 * Wait for a CloudFormation stack to finish deleting.
 * Polls every 5 seconds for up to 5 minutes.
 */
export async function waitForStackDelete(
  cfn: CloudFormationClient,
  stackName: string,
  appendLog: (line: string) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    try {
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

/**
 * Wait for a CloudFormation stack to reach a stable (non-IN_PROGRESS) state.
 * Polls every 15 seconds for up to 30 minutes.
 * Returns the final stack status, or throws on timeout.
 */
export async function waitForStackStable(
  cfn: CloudFormationClient,
  stackName: string,
  appendLog: (line: string) => Promise<void>,
): Promise<string> {

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    try {
      const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = result.Stacks?.[0];
      if (!stack) return "DELETE_COMPLETE";

      const status = stack.StackStatus || "";
      if (!status.endsWith("_IN_PROGRESS")) {
        await appendLog(`✓ Stack reached ${status}`);
        return status;
      }

      await appendLog(`ℹ Waiting for stack: ${status}...`);
    } catch {
      // Stack may have been deleted
      return "DELETE_COMPLETE";
    }
  }
  throw new Error(`Stack ${stackName} did not stabilize within 30 minutes`);
}

/**
 * Extract outputs from an existing CloudFormation stack.
 * Used when a stack already exists and no updates are needed.
 */
export async function extractStackOutputs(
  cfn: CloudFormationClient,
  stackName: string,
  appendLog: (line: string) => Promise<void>,
): Promise<ProvisionResult> {
  const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = result.Stacks?.[0];
  const outputs = Object.fromEntries(
    (stack?.Outputs || []).map((o: Output) => [o.OutputKey, o.OutputValue]),
  );
  const appUrl = outputs.AppUrl || "";
  const publicIp = outputs.PublicIp || "";
  if (appUrl) {
    await appendLog(`✓ App URL: ${appUrl}`);
  }
  if (publicIp) {
    await appendLog(`✓ Public IP: ${publicIp}`);
  }
  return { appUrl, serverIp: publicIp || undefined, outputs };
}

/**
 * Handle a CloudFormation stack that's in a stuck or in-progress state.
 * - Stuck states (ROLLBACK_COMPLETE, CREATE_FAILED, etc.): deletes the stack
 * - In-progress states (CREATE_IN_PROGRESS, UPDATE_IN_PROGRESS, etc.): waits for completion
 * - No-op if the stack doesn't exist or is in a healthy completed state.
 */
export async function cleanupStuckStack(
  cfn: CloudFormationClient,
  stackName: string,
  appendLog: (line: string) => Promise<void>,
): Promise<void> {
  try {
    const descResult = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const existingStack = descResult.Stacks?.[0];
    if (existingStack) {
      const stackStatus = existingStack.StackStatus || "";

      // Stack is stuck in a non-recoverable state — delete it
      if ((CFN_STUCK_STATUSES as readonly string[]).includes(stackStatus)) {
        await appendLog(`ℹ Stack in ${stackStatus} — deleting before re-create`);
        await cfn.send(new DeleteStackCommand({ StackName: stackName }));
        await waitForStackDelete(cfn, stackName, appendLog);
        return;
      }

      // Stack has an operation in progress — wait for it to finish
      if (stackStatus.endsWith("_IN_PROGRESS")) {
        await appendLog(`ℹ Stack in ${stackStatus} — waiting for current operation to complete`);
        await waitForStackStable(cfn, stackName, appendLog);
      }
    }
  } catch (err: unknown) {
    // Stack doesn't exist yet — that's fine (ValidationError with "does not exist")
    // But log unexpected errors so they're not silently swallowed
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("does not exist")) {
      await appendLog(`⚠ Stack check error (non-fatal): ${msg.slice(0, 200)}`);
    }
  }
}

/**
 * Create or update a CloudFormation stack.
 * Tries create first, falls back to update if the stack already exists.
 * Returns whether this was an update (true) or create (false).
 *
 * If the update results in "No updates are to be performed", returns the
 * existing stack outputs via the `onNoUpdates` callback pattern — the caller
 * should check the return value.
 */
export async function createOrUpdateStack(opts: {
  cfn: CloudFormationClient;
  stackName: string;
  templateUrl: string;
  params: Array<{ ParameterKey: string; ParameterValue: string }>;
  deploymentId: string;
  appendLog: (line: string) => Promise<void>;
}): Promise<{ isUpdate: boolean; noUpdatesResult?: ProvisionResult }> {
  const { cfn, stackName, templateUrl, params, deploymentId, appendLog } = opts;

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
    return { isUpdate: false };
  } catch (createErr: unknown) {
    if (
      (createErr instanceof Error && (createErr.name === "AlreadyExistsException" ||
      createErr.message?.includes("already exists")))
    ) {
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
        return { isUpdate: true };
      } catch (updateErr: unknown) {
        const updateMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);
        if (updateMsg.includes("No updates are to be performed")) {
          await appendLog("ℹ No infrastructure changes needed");
          const result = await extractStackOutputs(cfn, stackName, appendLog);
          return { isUpdate: true, noUpdatesResult: result };
        }
        throw new Error(`CloudFormation update failed: ${updateMsg}`);
      }
    }
    const createMsg = createErr instanceof Error ? createErr.message : String(createErr);
    throw new Error(`CloudFormation create failed: ${createMsg}`);
  }
}

// ─── Shared Destroy Helpers ─────────────────────────────────────────

/** Canonical CloudFormation stack name for an app deployed by this platform. */
export function stackNameFor(appName: string): string {
  return "image-builder-app-" + appName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/**
 * Delete an ECR repository by name (idempotent — ignores RepositoryNotFoundException).
 * Collects errors into the provided array instead of throwing.
 */
export async function deleteEcrRepo(
  repoName: string,
  region: string,
  credentials: AwsCredentials,
  errors: string[],
): Promise<void> {
  try {
    const ecr = new ECRClient({ region, credentials });
    await ecr.send(new DeleteRepositoryCommand({ repositoryName: repoName, force: true }));
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (!err.name?.includes("RepositoryNotFoundException")) {
      errors.push(`ECR ${repoName}: ${err.message}`);
    }
  }
}

/**
 * Delete a CloudFormation stack (fire-and-forget).
 * Ignores "does not exist" errors. Collects other errors into the provided array.
 */
export async function destroyCfnStack(
  stackName: string,
  region: string,
  credentials: AwsCredentials,
  appendLog: (line: string) => Promise<void>,
  errors: string[],
): Promise<void> {
  try {
    const cfn = new CloudFormationClient({ region, credentials });
    await cfn.send(new DeleteStackCommand({ StackName: stackName }));
    await appendLog(`✓ Stack deletion initiated: ${stackName}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // DeleteStackCommand throws if the stack doesn't exist — that's fine
    if (!msg.includes("does not exist")) {
      errors.push(`CloudFormation: ${msg}`);
    }
  }
}

// ─── CloudFormation Polling ────────────────────────────────────────

/**
 * Poll a CloudFormation stack until it reaches a success or failure state.
 * Polls every 15 seconds for up to 25 minutes.
 *
 * The timeout here must exceed the CFN CreationPolicy timeout (PT20M)
 * so the pipeline waits for CloudFormation to report success/failure
 * rather than giving up prematurely.
 */
export async function pollStackStatus(opts: {
  cfn: CloudFormationClient;
  stackName: string;
  isUpdate: boolean;
  appendLog: (line: string) => Promise<void>;
}): Promise<ProvisionResult> {
  const { cfn, stackName, isUpdate, appendLog } = opts;

  const successStatuses = isUpdate ? ["UPDATE_COMPLETE"] : ["CREATE_COMPLETE"];

  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise((r) => setTimeout(r, 15_000));

    try {
      const stackResult = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = stackResult.Stacks?.[0];
      if (!stack) {
        if (attempt % 8 === 0) {
          await appendLog("ℹ Waiting for CloudFormation stack to appear...");
        }
        continue;
      }

      const stackStatus = stack.StackStatus || "";

      if (successStatuses.includes(stackStatus)) {
        const outputs = Object.fromEntries(
          (stack.Outputs || []).map((o: Output) => [o.OutputKey, o.OutputValue]),
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
        return { appUrl, serverIp: publicIp || undefined, outputs };
      }

      if (CFN_FAILURE_PATTERNS.some((p) => stackStatus.includes(p))) {
        const reason = stack.StackStatusReason || stackStatus;
        throw new Error(`CloudFormation stack failed: ${stackStatus} — ${reason}`);
      }

      // Log progress periodically
      await appendLog(`ℹ CloudFormation: ${stackStatus}...`);
    } catch (pollErr: unknown) {
      if (pollErr instanceof Error && pollErr.message?.includes("CloudFormation stack failed")) {
        throw pollErr;
      }
      if (attempt % 8 === 0) {
        await appendLog("ℹ Waiting for CloudFormation stack to appear...");
      }
    }
  }

  throw new Error("CloudFormation stack did not complete within timeout (25 minutes)");
}
