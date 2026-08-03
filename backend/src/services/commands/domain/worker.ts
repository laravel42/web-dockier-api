/**
 * Command execution worker.
 *
 * Uses the generic createWorker factory from shared/queue.ts.
 * When a command is submitted, a job is enqueued and this worker picks it up,
 * resolves the target server from the project's active deployment, and executes
 * the command via SSH, SSM, ECS RunTask, or Cloud Run Jobs.
 *
 * Supported provider/strategy matrix:
 * - AWS EC2 (vps)       → SSM SendCommand (docker exec on instance)
 * - AWS ECS (managed)   → ECS RunTask (one-off container with the command)
 * - GCP Compute (vps)   → SSH (docker exec on instance)
 * - GCP Cloud Run (managed) → Cloud Run Jobs (one-off execution)
 * - Static (s3/storage) → Not supported (no container to run commands in)
 */

import { createWorker, COMMAND_EXEC_QUEUE } from "../../../shared/database/queue.js";
import { getCfn, getEc2 } from "../../../lib/aws-sdk.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { nowIso } from "../../../shared/utils/time.js";
import { executeCommand, type ExecutionTarget } from "./executor.js";
import { deriveContainerName, deriveRepoName, stackNameFor } from "../../../lib/naming.js";
import { getProviderCredentialsSafe } from "../../../lib/provider-credentials.js";
import { getActiveDeployment } from "../../../shared/service-clients/deployments.js";
import type { InfraMetadata } from "../../deploy/types.js";

export interface CommandJobInput {
  commandId: string;
  tenantId: string;
  projectId: string;
  command: string;
  /** Request ID from the originating HTTP request — used for log correlation. */
  correlationId?: string;
}

interface DeploymentInfo {
  id: string;
  provider_id: string;
  deploy_strategy: string;
  app_url: string;
  docker_image: string;
  repo: string;
  infra: Record<string, unknown> | null;
}

interface ProviderInfo {
  provider: string;
  api_key: string;
  api_secret: string;
  region: string;
}

/**
 * Resolve the execution target for a project by finding its active deployment
 * and looking up the server connection details.
 */
export async function resolveExecutionTarget(
  projectId: string,
  tenantId: string,
): Promise<{ target: ExecutionTarget | null; errorMessage?: string }> {
  const deployment = await getActiveDeployment(projectId, tenantId);

  if (!deployment) {
    return { target: null, errorMessage: "No active deployment found for this project. Deploy the project first to enable command execution." };
  }

  // Static deploys have no container to run commands in
  if (deployment.deployStrategy === "static") {
    return { target: null, errorMessage: "Commands are not supported for static site deployments (S3/Cloud Storage). There is no running container to execute commands in." };
  }

  // Get provider credentials for the server connection
  const creds = await getProviderCredentialsSafe(deployment.providerId);
  if (!creds) {
    return { target: null, errorMessage: "Server provider not found. The provider may have been deleted." };
  }
  const provider: ProviderInfo = {
    provider: creds.provider,
    api_key: creds.apiKey,
    api_secret: creds.apiSecret,
    region: creds.region,
  };

  // Build the legacy DeploymentInfo shape needed by helper functions
  const deploymentInfo: DeploymentInfo = {
    id: deployment.id,
    provider_id: deployment.providerId,
    deploy_strategy: deployment.deployStrategy,
    app_url: deployment.appUrl,
    docker_image: deployment.dockerImage,
    repo: deployment.repo,
    infra: deployment.infra as unknown as Record<string, unknown> | null,
  };

  // ── Fast path: use stored infra metadata (populated on deploys after migration 0047)
  const infra = deployment.infra;
  if (infra) {
    return resolveFromInfra(infra, provider, deploymentInfo);
  }

  // ── Fallback: infer from deployment data (legacy deployments before infra column)
  logger.info(`[command-exec] No infra metadata on deployment ${deployment.id}, using legacy resolution`);

  const containerName = deriveContainerName(deployment.repo);
  if (!containerName) {
    return { target: null, errorMessage: "Cannot determine container name from deployment." };
  }

  if (deployment.deployStrategy === "vps") {
    return resolveVpsTarget(deploymentInfo, provider, containerName, tenantId);
  }

  if (deployment.deployStrategy === "managed") {
    return resolveManagedTarget(deploymentInfo, provider, containerName);
  }

  return { target: null, errorMessage: `Unsupported deploy strategy: ${deployment.deployStrategy}` };
}

// ─── Infra-based resolution (preferred) ────────────────────────────

function resolveFromInfra(
  infra: InfraMetadata,
  provider: ProviderInfo,
  deployment: DeploymentInfo,
): { target: ExecutionTarget | null; errorMessage?: string } {
  const credentials = { apiKey: provider.api_key, apiSecret: provider.api_secret };
  const { region, containerName } = infra;

  switch (infra.service) {
    case "ec2":
      if (!infra.instanceId) {
        return { target: null, errorMessage: "EC2 deployment missing instanceId in infra metadata. Re-deploy to populate." };
      }
      return {
        target: { instanceId: infra.instanceId, containerName, credentials, region },
      };

    case "ecs":
      return {
        target: {
          containerName,
          credentials,
          region,
          ecsCluster: infra.ecsCluster || containerName,
          ecsTaskFamily: infra.ecsTaskFamily || containerName,
          dockerImage: deployment.docker_image,
        },
      };

    case "cloud-run":
      return {
        target: {
          containerName,
          credentials,
          region,
          cloudRunService: infra.cloudRunService || containerName,
          gcpProjectId: infra.gcpProjectId,
          dockerImage: deployment.docker_image,
        },
      };

    case "gce":
      if (!infra.serverIp) {
        return { target: null, errorMessage: "GCP Compute deployment missing serverIp in infra metadata." };
      }
      // GCP VPS — SSH keys are ephemeral, not currently supported post-deploy
      return {
        target: null,
        errorMessage: "GCP Compute VPS command execution requires a persistent SSH key. Re-deploy to regenerate access or use the GCP console.",
      };

    case "s3":
    case "gcs":
      return { target: null, errorMessage: "Commands are not supported for static site deployments." };

    default:
      return { target: null, errorMessage: `Unknown infra service: "${infra.service}" (provider: ${infra.provider})` };
  }
}

// ─── VPS Resolution (EC2 / GCP Compute) ────────────────────────────

async function resolveVpsTarget(
  deployment: DeploymentInfo,
  provider: ProviderInfo,
  containerName: string,
  tenantId: string,
): Promise<{ target: ExecutionTarget | null; errorMessage?: string }> {
  if (provider.provider === "aws") {
    // AWS EC2 always uses SSM — SSH is not viable because we don't store private keys
    // Resolve region: provider may have empty region, infer from app_url if needed
    const region = provider.region || inferAwsRegionFromUrl(deployment.app_url) || "us-east-1";

    const instanceId = await resolveEc2InstanceId(deployment, { ...provider, region });
    if (instanceId) {
      return {
        target: {
          instanceId,
          containerName,
          credentials: { apiKey: provider.api_key, apiSecret: provider.api_secret },
          region,
        },
      };
    }

    // SSM resolution failed — provide diagnostic info
    const extractedIp = extractIpFromUrl(deployment.app_url);
    return {
      target: null,
      errorMessage: `Could not resolve EC2 instance ID. CFN stack lookup and EC2 IP lookup both failed. app_url="${deployment.app_url}", extracted_ip="${extractedIp || "none"}", repo="${deployment.repo}", region="${region}". Check server logs for details.`,
    };
  }

  // GCP Compute: use SSH via server IP
  const serverIp = extractIpFromUrl(deployment.app_url);
  if (!serverIp) {
    return {
      target: null,
      errorMessage: `Cannot determine server IP from deployment URL "${deployment.app_url}". The deployment may not have a publicly accessible IP.`,
    };
  }

  // For GCP, the deploy key was generated during provisioning and stored in
  // the Pulumi state. We need to retrieve it. Check if the deploy key file
  // exists from a recent deployment, or fall back to error.
  const { data: keys } = await supabaseAdmin
    .from("ssh_keys")
    .select("id")
    .eq("organization_id", tenantId)
    .limit(1);

  if (!keys || keys.length === 0) {
    return { target: null, errorMessage: "No SSH key configured. Add an SSH key in Settings → SSH Keys to enable remote command execution on GCP VPS deployments." };
  }

  // Note: For GCP Compute, the deploy pipeline generates an ephemeral key pair
  // and stores it in the Pulumi workspace dir. Since we don't persist private keys
  // in the DB (correct security practice), GCP VPS commands require the original
  // deploy workspace to still be available or a re-deploy to regenerate keys.
  // TODO: Implement persistent secure key storage for GCP VPS command execution.
  return {
    target: null,
    errorMessage: "SSH key for GCP VPS command execution is not currently persisted between deployments. Re-deploy the project or use the GCP console to run commands.",
  };
}

// ─── Managed Resolution (ECS / Cloud Run) ──────────────────────────

async function resolveManagedTarget(
  deployment: DeploymentInfo,
  provider: ProviderInfo,
  containerName: string,
): Promise<{ target: ExecutionTarget | null; errorMessage?: string }> {
  if (provider.provider === "aws") {
    // AWS ECS: use ECS RunTask
    return {
      target: {
        containerName,
        credentials: { apiKey: provider.api_key, apiSecret: provider.api_secret },
        region: provider.region,
        ecsCluster: containerName,
        ecsTaskFamily: containerName,
        dockerImage: deployment.docker_image,
      },
    };
  }

  if (provider.provider === "gcp") {
    // GCP Cloud Run: use Cloud Run Jobs
    return {
      target: {
        containerName,
        credentials: { apiKey: provider.api_key, apiSecret: provider.api_secret },
        region: provider.region,
        cloudRunService: containerName,
        gcpProjectId: undefined, // Will be derived from credentials
        dockerImage: deployment.docker_image,
      },
    };
  }

  return { target: null, errorMessage: `Unsupported managed provider: ${provider.provider}` };
}

// ─── AWS EC2 Instance ID Resolution ────────────────────────────────

async function resolveEc2InstanceId(
  deployment: DeploymentInfo,
  provider: ProviderInfo,
): Promise<string | undefined> {
  const credentials = { accessKeyId: provider.api_key, secretAccessKey: provider.api_secret };

  // Strategy 1: Look up the CloudFormation stack by name
  try {
    const { CloudFormationClient, DescribeStacksCommand } = await getCfn();
    const cfn = new CloudFormationClient({ region: provider.region, credentials });

    const repoName = deriveRepoName(deployment.repo);
    const stackName = stackNameFor(repoName);

    logger.info(`[command-exec] Looking up CFN stack: ${stackName}`);

    const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = result.Stacks?.[0];
    if (stack?.Outputs) {
      const instanceOutput = stack.Outputs.find((o) => o.OutputKey === "InstanceId");
      if (instanceOutput?.OutputValue) {
        logger.info(`[command-exec] Resolved EC2 instance from CFN: ${instanceOutput.OutputValue}`);
        return instanceOutput.OutputValue;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info(`[command-exec] CFN lookup failed: ${msg}`);
  }

  // Strategy 2: Look up instance by public IP using EC2 API
  const serverIp = extractIpFromUrl(deployment.app_url);
  if (serverIp) {
    try {
      const { EC2Client, DescribeInstancesCommand } = await getEc2();
      const ec2 = new EC2Client({ region: provider.region, credentials });

      const descResult = await ec2.send(new DescribeInstancesCommand({
        Filters: [{ Name: "ip-address", Values: [serverIp] }],
      }));

      const instance = descResult.Reservations?.[0]?.Instances?.[0];
      if (instance?.InstanceId) {
        logger.info(`[command-exec] Resolved EC2 instance from IP ${serverIp}: ${instance.InstanceId}`);
        return instance.InstanceId;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.info(`[command-exec] EC2 IP lookup failed: ${msg}`);
    }
  }

  return undefined;
}

// ─── Utilities ─────────────────────────────────────────────────────

/**
 * Extract an IP address from a URL.
 * Handles both dotted IP (http://12.34.56.78:3000) and
 * AWS EC2 dashed format (http://ec2-12-34-56-78.compute-1.amazonaws.com).
 */
function extractIpFromUrl(url: string): string | null {
  if (!url) return null;

  // Try dotted IP first (e.g. http://12.34.56.78:3000)
  const dottedMatch = url.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (dottedMatch) {
    const octets = dottedMatch[1].split(".");
    if (octets.every((o) => Number(o) <= 255)) return dottedMatch[1];
  }

  // Try AWS EC2 DNS format (ec2-12-34-56-78.region.compute.amazonaws.com)
  const ec2Match = url.match(/ec2-(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})/);
  if (ec2Match) {
    const octets = [ec2Match[1], ec2Match[2], ec2Match[3], ec2Match[4]];
    if (octets.every((o) => Number(o) <= 255)) return octets.join(".");
  }

  return null;
}

/**
 * Infer AWS region from an EC2 public DNS hostname.
 * e.g. ec2-54-159-143-79.compute-1.amazonaws.com → us-east-1
 *      ec2-3-21-100-50.us-east-2.compute.amazonaws.com → us-east-2
 */
function inferAwsRegionFromUrl(url: string): string | null {
  if (!url) return null;

  // Format: ec2-X-X-X-X.<region>.compute.amazonaws.com (most regions)
  const regionalMatch = url.match(/ec2-[\d-]+\.([a-z0-9-]+)\.compute\.amazonaws\.com/);
  if (regionalMatch) return regionalMatch[1];

  // Format: ec2-X-X-X-X.compute-1.amazonaws.com (us-east-1 legacy format)
  if (url.includes(".compute-1.amazonaws.com")) return "us-east-1";

  return null;
}

// ─── Job Processor ─────────────────────────────────────────────────

async function processCommandJob(input: CommandJobInput): Promise<void> {
  const { commandId, tenantId, projectId, command } = input;

  logger.info(`[command-exec] Processing command ${commandId}: ${command.slice(0, 80)}`);

  try {
    const { target, errorMessage } = await resolveExecutionTarget(projectId, tenantId);

    if (!target) {
      await updateCommandStatus(commandId, "failed", errorMessage || "Cannot resolve execution target.");
      return;
    }

    // Execute the command
    const result = await executeCommand(target, command);

    // Update the command record with the result
    const status = result.timedOut ? "timed_out" : result.exitCode === 0 ? "finished" : "failed";
    await updateCommandStatus(commandId, status, result.output);

    logger.info(`[command-exec] Command ${commandId} completed with status: ${status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[command-exec] Command ${commandId} failed: ${msg}`);
    await updateCommandStatus(commandId, "failed", `Execution error: ${msg}`);
  }
}

/**
 * Update a command's status and output in the database.
 */
async function updateCommandStatus(
  commandId: string,
  status: string,
  output: string,
): Promise<void> {
  const maxLen = 65536;
  const cappedOutput = output.length > maxLen
    ? `... [truncated] ...\n${output.slice(-maxLen)}`
    : output;

  const { error } = await supabaseAdmin
    .from("commands")
    .update({
      status,
      output: cappedOutput,
      finished_at: nowIso(),
    })
    .eq("id", commandId);

  if (error) {
    logger.error(`[command-exec] Failed to update command ${commandId}: ${error.message}`);
  }
}

// ─── Worker Instance ───────────────────────────────────────────────

const commandWorker = createWorker<CommandJobInput>(
  COMMAND_EXEC_QUEUE,
  processCommandJob,
  { retryLimit: 1, expireInSeconds: 180 },
);

export const registerCommandWorker = commandWorker.register;
export const enqueueCommand = commandWorker.enqueue;
