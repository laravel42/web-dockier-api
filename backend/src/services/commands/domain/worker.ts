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

import { createWorker, COMMAND_EXEC_QUEUE } from "../../../shared/queue.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { executeCommand, type ExecutionTarget } from "./executor.js";

export interface CommandJobInput {
  commandId: string;
  tenantId: string;
  projectId: string;
  command: string;
}

interface DeploymentInfo {
  id: string;
  provider_id: string;
  deploy_strategy: string;
  app_url: string;
  docker_image: string;
  repo: string;
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
async function resolveExecutionTarget(
  projectId: string,
  tenantId: string,
): Promise<{ target: ExecutionTarget | null; errorMessage?: string }> {
  // Find the latest successful deployment for this project
  const { data: deployment } = await supabaseAdmin
    .from("deployments")
    .select("id, provider_id, deploy_strategy, app_url, docker_image, repo")
    .eq("project_id", projectId)
    .eq("organization_id", tenantId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!deployment) {
    return { target: null, errorMessage: "No active deployment found for this project. Deploy the project first to enable command execution." };
  }

  // Static deploys have no container to run commands in
  if (deployment.deploy_strategy === "static") {
    return { target: null, errorMessage: "Commands are not supported for static site deployments (S3/Cloud Storage). There is no running container to execute commands in." };
  }

  // Get provider credentials for the server connection
  const { data: provider } = await supabaseAdmin
    .from("server_providers")
    .select("provider, api_key, api_secret, region")
    .eq("id", deployment.provider_id)
    .single();

  if (!provider) {
    return { target: null, errorMessage: "Server provider not found. The provider may have been deleted." };
  }

  // Derive container name from the deployment's docker image or repo
  const containerName = deriveContainerName(deployment.docker_image, deployment.repo, projectId);
  if (!containerName) {
    return { target: null, errorMessage: "Cannot determine container name from deployment." };
  }

  // Route based on provider + strategy
  if (deployment.deploy_strategy === "vps") {
    return resolveVpsTarget(deployment, provider, containerName, tenantId);
  }

  if (deployment.deploy_strategy === "managed") {
    return resolveManagedTarget(deployment, provider, containerName);
  }

  return { target: null, errorMessage: `Unsupported deploy strategy: ${deployment.deploy_strategy}` };
}

// ─── VPS Resolution (EC2 / GCP Compute) ────────────────────────────

async function resolveVpsTarget(
  deployment: DeploymentInfo,
  provider: ProviderInfo,
  containerName: string,
  tenantId: string,
): Promise<{ target: ExecutionTarget | null; errorMessage?: string }> {
  if (provider.provider === "aws") {
    // AWS EC2: resolve instance ID from CloudFormation stack
    const instanceId = await resolveEc2InstanceId(deployment, provider);
    if (instanceId) {
      return {
        target: {
          instanceId,
          containerName,
          credentials: { apiKey: provider.api_key, apiSecret: provider.api_secret },
          region: provider.region,
        },
      };
    }
    // Fallback: try to extract IP from app_url and use SSH
  }

  // GCP Compute or fallback: use SSH via server IP
  const serverIp = extractIpFromUrl(deployment.app_url);
  if (!serverIp) {
    return { target: null, errorMessage: "Cannot determine server IP from deployment URL. The deployment may not have a publicly accessible IP." };
  }

  // Look for a deploy key for SSH access
  const { data: keys } = await supabaseAdmin
    .from("ssh_keys")
    .select("id")
    .eq("organization_id", tenantId)
    .limit(1);

  if (!keys || keys.length === 0) {
    return { target: null, errorMessage: "No SSH key configured. Add an SSH key in Settings → SSH Keys to enable remote command execution on VPS deployments." };
  }

  return {
    target: {
      serverIp,
      deployKeyPath: `/tmp/deploy-key-${keys[0].id}`,
      containerName,
      credentials: { apiKey: provider.api_key, apiSecret: provider.api_secret },
      region: provider.region,
    },
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
  try {
    const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({
      region: provider.region,
      credentials: { accessKeyId: provider.api_key, secretAccessKey: provider.api_secret },
    });

    // Stack name follows the same convention as the deploy adapter
    const repoName = deployment.repo.split("/").pop()?.replace(/[^a-z0-9-]/gi, "-") || "";
    const stackName = `image-builder-app-${repoName.toLowerCase()}`;

    const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = result.Stacks?.[0];
    if (!stack || !stack.Outputs) return undefined;

    const instanceOutput = stack.Outputs.find((o) => o.OutputKey === "InstanceId");
    return instanceOutput?.OutputValue || undefined;
  } catch {
    // Stack doesn't exist or CFN call failed — fall through
    return undefined;
  }
}

// ─── Utilities ─────────────────────────────────────────────────────

/**
 * Extract an IP address from a URL (e.g. http://12.34.56.78:3000 → 12.34.56.78)
 */
function extractIpFromUrl(url: string): string | null {
  if (!url) return null;
  const ipMatch = url.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (!ipMatch) return null;
  // Validate each octet is 0-255
  const octets = ipMatch[1].split(".");
  if (octets.some((o) => Number(o) > 255)) return null;
  return ipMatch[1];
}

/**
 * Derive a safe container name from deployment metadata.
 */
function deriveContainerName(dockerImage: string, repo: string, projectId: string): string | null {
  const imageName = dockerImage || repo || projectId;
  const rawName = imageName.split("/").pop()?.split(":")[0] || projectId;
  const containerName = rawName.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();

  if (!containerName || containerName.length > 64) {
    return null;
  }
  return containerName;
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
  const { error } = await supabaseAdmin
    .from("commands")
    .update({
      status,
      output: output.slice(0, 65536), // Cap output at 64KB
      finished_at: new Date().toISOString(),
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
