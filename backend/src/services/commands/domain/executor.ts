/**
 * Command Executor
 *
 * Handles actual command execution on remote servers via:
 * - SSH (GCP Compute, AWS EC2 fallback)
 * - AWS SSM SendCommand (AWS EC2)
 * - AWS ECS RunTask (AWS ECS/Fargate)
 * - GCP Cloud Run Jobs (GCP Cloud Run)
 * - Local Docker exec (dev fallback)
 */

import { spawn } from "node:child_process";
import { getEcs, getSsm } from "../../../lib/aws-sdk.js";
import { toAwsCredentials } from "../../../lib/provider-credentials.js";
import { sleep } from "../../../shared/utils/time.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";

const COMMAND_TIMEOUT_MS = 120_000; // 2 minutes

/** Only allow safe characters in container names to prevent shell injection. */
const SAFE_CONTAINER_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

export interface ExecutionTarget {
  /** AWS EC2 instance ID — triggers SSM execution path */
  instanceId?: string;
  /** Server IP for SSH execution */
  serverIp?: string;
  /** Path to SSH deploy key */
  deployKeyPath?: string;
  /** Container name on the server (for docker exec) */
  containerName: string;
  /** AWS/GCP credentials */
  credentials?: { apiKey: string; apiSecret: string };
  /** Cloud region */
  region?: string;
  /** ECS cluster name — triggers ECS RunTask path */
  ecsCluster?: string;
  /** ECS task definition family — for RunTask */
  ecsTaskFamily?: string;
  /** Docker image URI (for managed services that spin up new containers) */
  dockerImage?: string;
  /** GCP Cloud Run service name — triggers Cloud Run Jobs path */
  cloudRunService?: string;
  /** GCP project ID */
  gcpProjectId?: string;
}

export interface ExecutionResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
}

/**
 * Execute a command on the deployment target.
 *
 * Routes to the appropriate method based on available target fields:
 * 1. ECS cluster → ECS RunTask
 * 2. Cloud Run service → Cloud Run Jobs
 * 3. SSH (serverIp + deployKeyPath) → SSH docker exec
 * 4. SSM (instanceId + credentials) → SSM SendCommand
 * 5. Fallback → local docker exec
 */
export async function executeCommand(
  target: ExecutionTarget,
  command: string,
): Promise<ExecutionResult> {
  // Validate container name to prevent shell injection
  if (!SAFE_CONTAINER_NAME.test(target.containerName)) {
    return {
      exitCode: 1,
      output: `Invalid container name: "${target.containerName}"`,
      timedOut: false,
    };
  }

  // ECS RunTask (managed AWS)
  if (target.ecsCluster && target.credentials && target.region) {
    return executeViaEcsRunTask(target, command);
  }

  // Cloud Run Jobs (managed GCP)
  if (target.cloudRunService && target.credentials && target.region) {
    return executeViaCloudRunJob(target, command);
  }

  // SSH (VPS)
  if (target.serverIp && target.deployKeyPath) {
    return executeViaSSH(target, command);
  }

  // SSM (AWS EC2)
  if (target.instanceId && target.credentials && target.region) {
    return executeViaSSM(target, command);
  }

  // Fallback: run inside the container locally (useful for dev/testing)
  return executeLocal(target, command);
}

// ─── AWS ECS RunTask ───────────────────────────────────────────────

async function executeViaEcsRunTask(
  target: ExecutionTarget,
  command: string,
): Promise<ExecutionResult> {
  const { ecsCluster, ecsTaskFamily, credentials, region } = target;

  try {
    const {
      ECSClient, RunTaskCommand, DescribeTasksCommand, DescribeServicesCommand,
      waitUntilTasksStopped,
    } = await getEcs();
    const ecs = new ECSClient({
      region: region!,
      credentials: toAwsCredentials(credentials!),
    });

    // Resolve network config from the existing ECS service
    const networkConfig = await resolveEcsNetworkConfig(ecs, ecsCluster!, ecsTaskFamily!);

    // Run a one-off task with the command override
    const runResult = await ecs.send(new RunTaskCommand({
      cluster: ecsCluster,
      taskDefinition: ecsTaskFamily,
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: networkConfig,
      overrides: {
        containerOverrides: [{
          name: ecsTaskFamily,
          command: ["sh", "-c", command],
        }],
      },
    }));

    const taskArn = runResult.tasks?.[0]?.taskArn;
    if (!taskArn) {
      const reason = runResult.failures?.[0]?.reason || "Unknown failure";
      return { exitCode: 1, output: `Failed to start ECS task: ${reason}`, timedOut: false };
    }

    // Wait for the task to stop (max 2 minutes)
    try {
      await waitUntilTasksStopped(
        { client: ecs, maxWaitTime: 120, minDelay: 5, maxDelay: 10 },
        { cluster: ecsCluster, tasks: [taskArn] },
      );
    } catch {
      return { exitCode: 124, output: "ECS task timed out (2 minute limit exceeded)", timedOut: true };
    }

    // Get the task result
    const describeResult = await ecs.send(new DescribeTasksCommand({
      cluster: ecsCluster,
      tasks: [taskArn],
    }));

    const task = describeResult.tasks?.[0];
    const container = task?.containers?.[0];
    const exitCode = container?.exitCode ?? 1;
    const reason = container?.reason || task?.stoppedReason || "";

    // ECS doesn't return stdout directly — we'd need CloudWatch Logs
    const output = exitCode === 0
      ? "Command executed successfully on ECS."
      : `Command failed with exit code ${exitCode}. ${reason}`.trim();

    return { exitCode, output, timedOut: false };
  } catch (err) {
    const msg = getErrMsg(err);
    return { exitCode: 1, output: `ECS execution failed: ${msg}`, timedOut: false };
  }
}

/**
 * Resolve the network configuration from an existing ECS service
 * so RunTask uses the same subnets and security groups.
 */
async function resolveEcsNetworkConfig(
  ecs: InstanceType<Awaited<typeof import("@aws-sdk/client-ecs")>["ECSClient"]>,
  cluster: string,
  serviceName: string,
): Promise<{ awsvpcConfiguration: { subnets: string[]; assignPublicIp: "ENABLED" | "DISABLED"; securityGroups?: string[] } }> {
  try {
    const { DescribeServicesCommand } = await getEcs();
    const result = await ecs.send(new DescribeServicesCommand({
      cluster,
      services: [serviceName],
    }));

    const svc = result.services?.[0];
    const netConfig = svc?.networkConfiguration?.awsvpcConfiguration;
    if (netConfig?.subnets && netConfig.subnets.length > 0) {
      return {
        awsvpcConfiguration: {
          subnets: netConfig.subnets,
          assignPublicIp: (netConfig.assignPublicIp as "ENABLED" | "DISABLED") || "ENABLED",
          securityGroups: netConfig.securityGroups,
        },
      };
    }
  } catch {
    // Service not found or API error — fallback below
  }

  // Fallback: require public IP, let AWS pick default subnets
  // This will fail if no default VPC exists, but that's the same constraint as deploy
  return { awsvpcConfiguration: { subnets: [], assignPublicIp: "ENABLED" } };
}

// ─── GCP Cloud Run Jobs ────────────────────────────────────────────

async function executeViaCloudRunJob(
  target: ExecutionTarget,
  command: string,
): Promise<ExecutionResult> {
  const { cloudRunService, credentials, region } = target;

  try {
    // Use GCP REST API for Cloud Run Jobs
    const { getGcpAccessToken, getGcpProjectId } = await import("../../deploy/domain/infra/gcp-client.js");

    const accessToken = await getGcpAccessToken(credentials!.apiKey);
    const projectId = target.gcpProjectId || getGcpProjectId(credentials!.apiKey);
    const imageUri = target.dockerImage || `${region}-docker.pkg.dev/${projectId}/${cloudRunService}/${cloudRunService}:latest`;

    const jobName = `${cloudRunService}-cmd`;
    const jobsBaseUrl = `https://run.googleapis.com/v2/projects/${projectId}/locations/${region}/jobs`;

    // Create or update the job with the command override
    const jobBody = {
      template: {
        template: {
          containers: [{
            image: imageUri,
            command: ["sh", "-c", command],
          }],
          maxRetries: 0,
          timeout: "120s",
        },
      },
    };

    // Try to create the job (or update if exists)
    let createResponse = await fetch(`${jobsBaseUrl}/${jobName}?updateMask=template`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(jobBody),
    });

    if (createResponse.status === 404) {
      // Job doesn't exist yet — create it
      createResponse = await fetch(`${jobsBaseUrl}?jobId=${jobName}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(jobBody),
      });
    }

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      return { exitCode: 1, output: `Failed to configure Cloud Run Job: ${errText.slice(0, 500)}`, timedOut: false };
    }

    // Execute the job
    const execResponse = await fetch(`${jobsBaseUrl}/${jobName}:run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });

    if (!execResponse.ok) {
      const errText = await execResponse.text();
      return { exitCode: 1, output: `Failed to execute Cloud Run Job: ${errText.slice(0, 500)}`, timedOut: false };
    }

    const execData = await execResponse.json() as { metadata?: { name?: string } };
    const executionName = execData.metadata?.name;

    if (!executionName) {
      return { exitCode: 0, output: "Command dispatched to Cloud Run Jobs. Check GCP console for results.", timedOut: false };
    }

    // Poll for completion (max ~120s)
    const pollUrl = `https://run.googleapis.com/v2/${executionName}`;
    for (let i = 0; i < 24; i++) {
      await sleep(5000);
      const pollResponse = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!pollResponse.ok) continue;

      const execution = await pollResponse.json() as { completionTime?: string; conditions?: Array<{ type: string; state: string; message?: string }> };
      if (execution.completionTime) {
        const succeeded = execution.conditions?.some((c) => c.type === "Completed" && c.state === "CONDITION_SUCCEEDED");
        if (succeeded) {
          return { exitCode: 0, output: "Command executed successfully on Cloud Run.", timedOut: false };
        }
        const failMsg = execution.conditions?.find((c) => c.state !== "CONDITION_SUCCEEDED")?.message || "Command failed";
        return { exitCode: 1, output: failMsg, timedOut: false };
      }
    }

    return { exitCode: 124, output: "Cloud Run Job timed out (2 minute limit exceeded)", timedOut: true };
  } catch (err) {
    const msg = getErrMsg(err);
    return { exitCode: 1, output: `Cloud Run execution failed: ${msg}`, timedOut: false };
  }
}

// ─── SSH Execution ─────────────────────────────────────────────────

async function executeViaSSH(
  target: ExecutionTarget,
  command: string,
): Promise<ExecutionResult> {
  const { serverIp, deployKeyPath, containerName } = target;

  const sshOpts = [
    "-i", deployKeyPath!,
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=30",
    "-o", "LogLevel=ERROR",
  ];

  // Escape single quotes in the command for safe shell interpolation
  const escaped = command.replace(/'/g, "'\\''");
  const remoteCmd = `docker exec ${containerName} sh -c '${escaped}'`;

  return runCmdWithTimeout("ssh", [...sshOpts, `root@${serverIp}`, remoteCmd]);
}

// ─── SSM Execution (AWS EC2) ───────────────────────────────────────

async function executeViaSSM(
  target: ExecutionTarget,
  command: string,
): Promise<ExecutionResult> {
  const { instanceId, credentials, region, containerName } = target;

  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await getSsm();
  const ssm = new SSMClient({
    region: region!,
    credentials: toAwsCredentials(credentials!),
  });

  const escaped = command.replace(/'/g, "'\\''");
  const script = `docker exec ${containerName} sh -c '${escaped}'`;

  try {
    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId!],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [script] },
      TimeoutSeconds: 120,
    }));

    const commandId = sendResult.Command?.CommandId;
    if (!commandId) {
      return { exitCode: 1, output: "Failed to send SSM command", timedOut: false };
    }

    // Poll for completion (max ~130s with 5s intervals)
    for (let i = 0; i < 26; i++) {
      await sleep(5000);
      try {
        const invocation = await ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId!,
        }));

        const status = invocation.Status;
        if (status === "Success") {
          return {
            exitCode: 0,
            output: (invocation.StandardOutputContent || "").trim(),
            timedOut: false,
          };
        }
        if (status === "Failed" || status === "Cancelled") {
          const errOutput = invocation.StandardErrorContent?.trim() || "";
          const stdOutput = invocation.StandardOutputContent?.trim() || "";
          return {
            exitCode: 1,
            output: errOutput ? `${stdOutput}\n${errOutput}`.trim() : stdOutput || "Command failed",
            timedOut: false,
          };
        }
        if (status === "TimedOut") {
          return {
            exitCode: 124,
            output: (invocation.StandardOutputContent || "Command timed out").trim(),
            timedOut: true,
          };
        }
      } catch {
        // InvocationDoesNotExist — agent hasn't picked it up yet, keep polling
      }
    }

    return { exitCode: 124, output: "Command timed out waiting for response", timedOut: true };
  } catch (err) {
    const msg = getErrMsg(err);
    return { exitCode: 1, output: `SSM execution failed: ${msg}`, timedOut: false };
  }
}

// ─── Local Docker Execution (dev fallback) ─────────────────────────

async function executeLocal(
  target: ExecutionTarget,
  command: string,
): Promise<ExecutionResult> {
  const { containerName } = target;
  return runCmdWithTimeout("docker", ["exec", containerName, "sh", "-c", command]);
}

// ─── Utilities ─────────────────────────────────────────────────────

/**
 * Run a local command with a 2-minute timeout.
 * Properly kills the child process if the timeout fires to avoid orphans.
 */
function runCmdWithTimeout(
  cmd: string,
  args: string[],
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;

    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      resolve({
        exitCode: 124,
        output: output || "Command timed out (2 minute limit exceeded)",
        timedOut: true,
      });
    }, COMMAND_TIMEOUT_MS);

    proc.stdout!.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr!.on("data", (d: Buffer) => { output += d.toString(); });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, output, timedOut: false });
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: 1, output: err.message, timedOut: false });
    });
  });
}
