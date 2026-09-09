/**
 * Post-deploy command execution.
 *
 * Handles running user-defined deploy scripts on the deployed container
 * via AWS SSM (EC2) or SSH (GCP/other VPS).
 *
 * Structure:
 *   executePostDeployScript()  → dispatcher (validates, routes to SSM or SSH)
 *   executeSsmScript()         → AWS EC2 path: SSM agent readiness → SendCommand → poll result
 *   executeSshScript()         → GCP/VPS path: SSH execution with container readiness check
 *
 * Responsibilities:
 * - Container readiness polling
 * - Laravel .env file injection (S3 upload → container copy)
 * - Service-specific env overrides (DB_HOST, REDIS_HOST → host.docker.internal)
 * - Command execution via SSM SendCommand or SSH
 */

import { getAwsAccountId } from "../../../../lib/aws.js";
import { getS3, getSsm } from "../../../../lib/aws-sdk.js";
import { toAwsCredentials } from "../../../../lib/provider-credentials.js";
import type { ContextualLogger } from "../../../../lib/logging.js";
import { formatEnvFileContent } from "../../../../shared/env/format-env-file.js";
import { pollUntil } from "../infra/poll-until.js";
import type { RunCmdFn } from "../run-cmd.js";

// ─── Types ─────────────────────────────────────────────────────────

export interface PostDeployContext {
  containerName: string;
  region: string;
  provider: string;
  techStack: string[];
  services: Array<{ type: string; name: string; mode: string }>;
  envVars: Array<{ name: string; value: string }>;
  credentials: { apiKey: string; apiSecret: string };
  /** EC2 instance ID — triggers SSM path when present (AWS only) */
  instanceId?: string;
  /** Server IP — triggers SSH path when present */
  serverIp?: string;
  /** Path to SSH deploy key */
  deployKeyPath?: string;
  /** Working directory for SSH commands */
  workDir: string;
}

// ─── Validation ────────────────────────────────────────────────────

/** Only allow safe characters in container names to prevent shell injection. */
const SAFE_CONTAINER_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

function assertSafeContainerName(name: string): void {
  if (!SAFE_CONTAINER_NAME.test(name)) {
    throw new Error(`Invalid container name: "${name}" — must match [a-z0-9._-]`);
  }
}

// ─── Shared Helpers ────────────────────────────────────────────────

/**
 * Build Laravel-specific env override commands for self-hosted services.
 * Rewrites DB_HOST / REDIS_HOST to `host.docker.internal` so containers
 * can reach co-located databases and caches on the same VPS.
 */
function buildEnvOverrides(
  containerName: string,
  services: Array<{ type: string; name: string; mode: string }>,
): string[] {
  const selfHosted = services.filter(s => s.mode === "vps").map(s => s.type);
  const overrides: string[] = [];

  if (selfHosted.includes("database")) {
    overrides.push(
      `docker exec ${containerName} sh -c 'grep -q "^DB_HOST=" /var/www/html/.env && sed -i "s/^DB_HOST=.*/DB_HOST=host.docker.internal/" /var/www/html/.env || echo "DB_HOST=host.docker.internal" >> /var/www/html/.env'`,
    );
  }
  if (selfHosted.includes("cache") || selfHosted.includes("broadcasting")) {
    overrides.push(
      `docker exec ${containerName} sh -c 'grep -q "^REDIS_HOST=" /var/www/html/.env && sed -i "s/^REDIS_HOST=.*/REDIS_HOST=host.docker.internal/" /var/www/html/.env || echo "REDIS_HOST=host.docker.internal" >> /var/www/html/.env'`,
    );
  }

  return overrides;
}

/**
 * Build the env setup prefix for Laravel containers:
 * copies .env from host into the container and applies service overrides.
 */
function buildEnvSetupCommand(containerName: string, envOverrides: string[]): string {
  const envFixCmd = envOverrides.length > 0 ? envOverrides.join(" && ") + " && " : "";
  return `docker cp /tmp/${containerName}.env ${containerName}:/var/www/html/.env 2>/dev/null || docker exec ${containerName} sh -c 'touch .env' && ${envFixCmd}`;
}

/**
 * Upload a .env file to S3 for later download on the EC2 instance.
 * Returns the `aws s3 cp ...` command to download it on the host.
 */
async function uploadEnvToS3(
  ctx: PostDeployContext,
  containerName: string,
): Promise<string> {
  const { envVars, region, credentials } = ctx;
  if (envVars.length === 0) return "";

  const envContent = formatEnvFileContent(envVars);

  const { S3Client, PutObjectCommand } = await getS3();
  const accountId = await getAwsAccountId(region, toAwsCredentials(credentials));
  const envBucket = `image-builder-templates-${accountId}`;
  const envKey = `env-files/${containerName}-postdeploy.env`;
  const s3 = new S3Client({
    region,
    credentials: toAwsCredentials(credentials),
  });
  await s3.send(new PutObjectCommand({ Bucket: envBucket, Key: envKey, Body: envContent, ContentType: "text/plain" }));

  return `aws s3 cp s3://${envBucket}/${envKey} /tmp/${containerName}.env --region ${region}`;
}

/**
 * Build a container readiness polling script fragment (bash).
 */
function containerReadinessScript(containerName: string, maxAttempts: number, sleepSec: number): string[] {
  return [
    "CONTAINER_READY=0",
    `for i in $(seq 1 ${maxAttempts}); do`,
    `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi`,
    `  sleep ${sleepSec}`,
    "done",
    `if [ "$CONTAINER_READY" != "1" ]; then echo "ERROR: Container '${containerName}' not running after ${maxAttempts * sleepSec}s"; exit 1; fi`,
  ];
}

// ─── SSM Execution (AWS EC2) ───────────────────────────────────────

interface SsmExecutionParams {
  ctx: PostDeployContext;
  dockerExecCmd: string;
  logger: ContextualLogger;
}

/**
 * Execute a deploy script on an EC2 instance via AWS SSM.
 *
 * Steps:
 * 1. Wait for SSM agent to register (instance may still be booting)
 * 2. Build the full SSM script (container readiness + env setup + user script)
 * 3. Send the command via SSM SendCommand
 * 4. Poll for command completion
 */
async function executeSsmScript(params: SsmExecutionParams): Promise<void> {
  const { ctx, dockerExecCmd, logger } = params;
  const { containerName, instanceId, region, credentials, techStack, services, envVars } = ctx;

  if (!instanceId) return;

  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand, DescribeInstanceInformationCommand } = await getSsm();
  const ssm = new SSMClient({
    region,
    credentials: toAwsCredentials(credentials),
  });

  // 1. Wait for SSM agent to come online
  await logger.info("Waiting for instance to register with SSM...");

  const ssmReadyResult = await pollUntil({
    check: async () => {
      try {
        const info = await ssm.send(new DescribeInstanceInformationCommand({
          Filters: [{ Key: "InstanceIds", Values: [instanceId] }],
        }));
        const instance = info.InstanceInformationList?.[0];
        if (instance?.PingStatus === "Online") return true;
      } catch { /* not registered yet */ }
      return null;
    },
    intervalMs: 10_000,
    timeoutMs: 300_000, // 5 minutes
  });

  if (!ssmReadyResult.success) {
    await logger.warn("Instance did not register with SSM after 5 minutes — deploy script may fail");
  }

  // 2. Build the SSM script
  const isLaravel = techStack.some(s => s.toLowerCase() === "laravel");
  const envOverrides = buildEnvOverrides(containerName, services);

  let envDownloadCmd = "";
  if (isLaravel && envVars.length > 0) {
    envDownloadCmd = await uploadEnvToS3(ctx, containerName);
  }

  const envSetup = isLaravel ? buildEnvSetupCommand(containerName, envOverrides) : "";

  const ssmScript = [
    "#!/bin/bash",
    "set -e",
    ...containerReadinessScript(containerName, 90, 2),
    envDownloadCmd,
    envSetup || "",
    dockerExecCmd,
  ].filter(Boolean).join("\n");

  // 3. Send the command
  try {
    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [ssmScript] },
      TimeoutSeconds: 600,
    }));

    const commandId = sendResult.Command?.CommandId;
    if (!commandId) {
      await logger.warn("SSM SendCommand did not return a commandId");
      return;
    }

    // 4. Poll for command completion
    const completionResult = await pollUntil<{ status: string; stdout?: string; stderr?: string }>({
      check: async () => {
        try {
          const invocation = await ssm.send(new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          }));

          if (invocation.Status === "Success") {
            return { status: "Success", stdout: invocation.StandardOutputContent };
          }
          if (invocation.Status === "Failed" || invocation.Status === "Cancelled" || invocation.Status === "TimedOut") {
            return { status: invocation.Status, stderr: invocation.StandardErrorContent };
          }
        } catch { /* invocation not ready yet — SSM returns InvocationDoesNotExist initially */ }
        return null;
      },
      intervalMs: 5_000,
      timeoutMs: 625_000, // ~10 minutes
    });

    if (completionResult.success && completionResult.value) {
      const { status, stdout, stderr } = completionResult.value;
      if (status === "Success") {
        await logger.success("Deploy script completed successfully");
        if (stdout?.trim()) {
          for (const line of stdout.trim().split("\n").slice(-15)) {
            await logger.info(line);
          }
        }
      } else {
        await logger.warn(`Deploy script ${status}`);
        if (stderr?.trim()) {
          await logger.info(stderr.trim().slice(0, 500));
        }
      }
    } else {
      await logger.warn("Deploy script still running after timeout");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await logger.warn(`SSM execution failed: ${msg}`);
  }
}

// ─── SSH Execution (GCP / other VPS) ───────────────────────────────

interface SshExecutionParams {
  ctx: PostDeployContext;
  dockerExecCmd: string;
  logger: ContextualLogger;
  runCmd: RunCmdFn;
}

/**
 * Execute a deploy script on a VPS via SSH.
 *
 * Wraps the docker exec command in a container readiness check and
 * runs it over SSH with strict connection options.
 */
async function executeSshScript(params: SshExecutionParams): Promise<void> {
  const { ctx, dockerExecCmd, logger, runCmd } = params;
  const { containerName, serverIp, deployKeyPath, workDir } = ctx;

  if (!serverIp || !deployKeyPath) return;

  const sshOpts = [
    "-i", deployKeyPath,
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=30",
    "-o", "LogLevel=ERROR",
  ];

  const remoteCmd = [
    "CONTAINER_READY=0;",
    "for i in $(seq 1 60); do",
    `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi;`,
    "  sleep 2;",
    "done;",
    `[ "$CONTAINER_READY" = "1" ]`,
    `&& ${dockerExecCmd}`,
    "&& echo DEPLOY_SCRIPT_DONE",
  ].join(" ");

  const result = await runCmd("ssh", [...sshOpts, `root@${serverIp}`, remoteCmd], { cwd: workDir });

  if (result.output.includes("DEPLOY_SCRIPT_DONE")) {
    await logger.success("Deploy script completed successfully");
    const outputLines = result.output.split("\n").filter(l =>
      l.trim() && !l.includes("DEPLOY_SCRIPT_DONE") && !l.includes("Warning:")
    );
    for (const line of outputLines.slice(-15)) {
      await logger.info(line.trim());
    }
  } else {
    await logger.warn("Deploy script may not have completed successfully");
    const output = result.output.trim().replace(/Warning:.*\n?/g, "").slice(0, 500);
    if (output) await logger.info(output);
  }
}

// ─── Main Dispatcher ───────────────────────────────────────────────

/**
 * Execute a deploy script (bash) inside the deployed container.
 *
 * Dispatches to SSM (AWS EC2) or SSH (GCP/other VPS) based on the
 * available context. Validates input before executing.
 */
export async function executePostDeployScript(
  ctx: PostDeployContext,
  script: string,
  logger: ContextualLogger,
  runCmd: RunCmdFn,
  deployStrategy: string,
): Promise<void> {
  const trimmed = script.trim();
  if (!trimmed) return;

  // Safety: limit script size to prevent abuse
  if (trimmed.length > 10_000) {
    await logger.warn("Deploy script exceeds maximum length (10KB) — skipping execution");
    return;
  }

  // Filter out comment-only lines to check if there's actual work to do
  const hasCommands = trimmed.split("\n").some(line => {
    const l = line.trim();
    return l && !l.startsWith("#");
  });
  if (!hasCommands) return;

  assertSafeContainerName(ctx.containerName);

  if (deployStrategy === "managed") {
    await logger.section("Deploy Script");
    await logger.warn("Deploy script execution is not yet supported for managed deploys (ECS Fargate / Cloud Run)");
    await logger.info("The script will be supported via ECS RunTask / Cloud Run Jobs in a future update");
    return;
  }

  if (deployStrategy !== "vps") return;

  await logger.section("Deploy Script");
  await logger.info("Executing deploy script inside container...");

  // Build the docker exec command
  const escapedScript = trimmed.replace(/'/g, "'\\''");
  const dockerExecCmd = `docker exec ${ctx.containerName} sh -c '${escapedScript}'`;

  // Route to the appropriate execution path
  if (ctx.instanceId && ctx.provider === "aws") {
    await executeSsmScript({ ctx, dockerExecCmd, logger });
    return;
  }

  if (ctx.serverIp && ctx.deployKeyPath) {
    await executeSshScript({ ctx, dockerExecCmd, logger, runCmd });
    return;
  }

  await logger.warn("Cannot execute deploy script — no SSH key or SSM instance available");
}
