/**
 * Post-deploy command execution.
 *
 * Extracted from pipeline.ts — handles running user-defined commands
 * on the deployed container via AWS SSM (EC2) or SSH (GCP/other VPS).
 *
 * Responsibilities:
 * - Container readiness polling
 * - Laravel .env file injection (S3 upload → container copy)
 * - Service-specific env overrides (DB_HOST, REDIS_HOST → host.docker.internal)
 * - Command execution via SSM SendCommand or SSH
 */

import { getAwsAccountId } from "../../../lib/aws.js";
import type { ContextualLogger } from "../../../lib/logging.js";
import type { RunCmdFn } from "./run-cmd.js";

// ─── Types ─────────────────────────────────────────────────────────

export interface PostDeployCommand {
  command: string;
  enabled: boolean;
  continueOnFailure?: boolean;
}

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

/** Only allow valid env var names (POSIX portable). */
const SAFE_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeContainerName(name: string): void {
  if (!SAFE_CONTAINER_NAME.test(name)) {
    throw new Error(`Invalid container name: "${name}" — must match [a-z0-9._-]`);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Build a chain of `docker exec` commands joined by `&&`,
 * respecting `continueOnFailure` per command.
 */
function buildCommandChain(commands: PostDeployCommand[], containerName: string): string {
  return commands
    .map(cmd => {
      const escaped = cmd.command.replace(/'/g, "'\\''");
      const exec = `docker exec ${containerName} sh -c '${escaped}'`;
      return cmd.continueOnFailure ? `(${exec} || true)` : exec;
    })
    .join(" && ");
}

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

  const envContent = envVars
    .filter(v => SAFE_ENV_NAME.test(v.name))
    .map(v => {
      const val = v.value;
      const needsQuotes = /[\s#"'\\]/.test(val) || val === "";
      return needsQuotes
        ? `${v.name}="${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
        : `${v.name}=${val}`;
    })
    .join("\n");

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const accountId = await getAwsAccountId(region, {
    accessKeyId: credentials.apiKey,
    secretAccessKey: credentials.apiSecret,
  });
  const envBucket = `image-builder-templates-${accountId}`;
  const envKey = `env-files/${containerName}-postdeploy.env`;
  const s3 = new S3Client({
    region,
    credentials: { accessKeyId: credentials.apiKey, secretAccessKey: credentials.apiSecret },
  });
  await s3.send(new PutObjectCommand({ Bucket: envBucket, Key: envKey, Body: envContent, ContentType: "text/plain" }));

  return `aws s3 cp s3://${envBucket}/${envKey} /tmp/${containerName}.env --region ${region}`;
}

// ─── SSM Execution (AWS EC2) ───────────────────────────────────────

async function executeViaSSM(
  ctx: PostDeployContext,
  commands: PostDeployCommand[],
  logger: ContextualLogger,
): Promise<void> {
  const { containerName, region, credentials, instanceId, techStack, services, envVars } = ctx;

  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await import("@aws-sdk/client-ssm");
  const ssm = new SSMClient({
    region,
    credentials: { accessKeyId: credentials.apiKey, secretAccessKey: credentials.apiSecret },
  });

  const cmdChain = buildCommandChain(commands, containerName);
  const isLaravel = techStack.some(s => s.toLowerCase() === "laravel");
  const envOverrides = buildEnvOverrides(containerName, services);

  // Upload .env to S3 for Laravel projects
  if (isLaravel && envVars.length > 0) {
    await uploadEnvToS3(ctx, containerName);
  }

  const envSetup = isLaravel
    ? buildEnvSetupCommand(containerName, envOverrides)
    : "";

  const script = [
    "#!/bin/bash",
    "CONTAINER_READY=0",
    "for i in $(seq 1 90); do",
    `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi`,
    "  sleep 2",
    "done",
    `if [ "$CONTAINER_READY" != "1" ]; then echo "ERROR: Container '${containerName}' not running after 180s"; exit 1; fi`,
    `${envSetup}${cmdChain}`,
  ].join("\n");

  await logger.info("Executing via AWS SSM SendCommand...");

  try {
    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId!],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [script] },
      TimeoutSeconds: 300,
    }));

    const commandId = sendResult.Command?.CommandId;
    if (commandId) {
      let done = false;
      for (let i = 0; i < 65; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const invocation = await ssm.send(new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId!,
          }));
          const status = invocation.Status;
          if (status === "Success") {
            await logger.success("All post-deploy commands executed successfully");
            if (invocation.StandardOutputContent?.trim()) {
              const lines = invocation.StandardOutputContent.trim().split("\n").slice(0, 20);
              for (const line of lines) await logger.info(line);
            }
            done = true;
            break;
          } else if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
            await logger.warn(`SSM command ${status}`);
            if (invocation.StandardErrorContent?.trim()) {
              await logger.info(invocation.StandardErrorContent.trim().slice(0, 500));
            }
            if (invocation.StandardOutputContent?.trim()) {
              const lines = invocation.StandardOutputContent.trim().split("\n").slice(-20);
              for (const line of lines) await logger.info(line);
            }
            done = true;
            break;
          }
        } catch {
          // InvocationDoesNotExist — agent hasn't picked it up yet
        }
      }
      if (!done) {
        await logger.warn("SSM command still running after timeout — commands may complete in background");
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await logger.warn(`SSM SendCommand failed: ${errMsg}`);
    await logger.info("The instance may not have SSM agent ready yet — commands will run via cfn-init instead");
  }
}

// ─── SSH Execution (GCP / other VPS) ───────────────────────────────

async function executeViaSSH(
  ctx: PostDeployContext,
  commands: PostDeployCommand[],
  logger: ContextualLogger,
  runCmd: RunCmdFn,
): Promise<void> {
  const { containerName, serverIp, deployKeyPath, workDir, techStack, services } = ctx;

  const sshOpts = [
    "-i", deployKeyPath!,
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=30",
    "-o", "LogLevel=ERROR",
  ];

  const cmdChain = buildCommandChain(commands, containerName);
  const isLaravel = techStack.some(s => s.toLowerCase() === "laravel");
  const envOverrides = buildEnvOverrides(containerName, services);
  const envSetup = isLaravel
    ? buildEnvSetupCommand(containerName, envOverrides)
    : "";

  const remoteCmd = [
    "CONTAINER_READY=0;",
    "for i in $(seq 1 60); do",
    `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi;`,
    "  sleep 2;",
    "done;",
    `[ "$CONTAINER_READY" = "1" ]`,
    `&& ${envSetup}${cmdChain}`,
    "&& echo POST_DEPLOY_DONE",
  ].join(" ");

  await logger.info("Commands will execute once container is ready...");
  const result = await runCmd("ssh", [...sshOpts, `root@${serverIp}`, remoteCmd], { cwd: workDir });

  if (result.output.includes("POST_DEPLOY_DONE")) {
    await logger.success("All post-deploy commands executed successfully");
    const outputLines = result.output.split("\n").filter(l =>
      l.trim() && !l.includes("POST_DEPLOY_DONE") && !l.includes("Warning:")
    );
    for (const line of outputLines.slice(0, 20)) {
      await logger.info(line.trim());
    }
  } else {
    await logger.warn("Post-deploy commands may not have completed successfully");
    const output = result.output.trim().replace(/Warning:.*\n?/g, "").slice(0, 500);
    if (output) await logger.info(output);
  }
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Execute user-defined post-deploy commands on the deployed container.
 *
 * Routes to the appropriate execution method based on available context:
 * - AWS EC2 with instance ID → SSM SendCommand
 * - VPS with server IP + deploy key → SSH
 * - Managed deploys → logs a "not yet supported" warning
 *
 * For static deploys, this function is a no-op (caller should skip).
 */
export async function executePostDeployCommands(
  ctx: PostDeployContext,
  commands: PostDeployCommand[],
  logger: ContextualLogger,
  runCmd: RunCmdFn,
  deployStrategy: string,
): Promise<void> {
  const enabled = commands.filter(c => c.enabled);
  if (enabled.length === 0) return;

  // Defense-in-depth: validate container name before interpolating into shell scripts
  assertSafeContainerName(ctx.containerName);

  if (deployStrategy === "managed") {
    await logger.section("Post-Deploy Commands");
    await logger.warn(`Post-deploy commands are not yet supported for managed deploys`);
    await logger.info("Commands configured: " + enabled.map(c => c.command).join(", "));
    await logger.info("These will be supported via ECS RunTask / Cloud Run Jobs in a future update");
    return;
  }

  if (deployStrategy !== "vps") return;

  await logger.section("Post-Deploy Commands");
  await logger.info(`Running ${enabled.length} command(s)...`);

  const { instanceId, provider, serverIp, deployKeyPath } = ctx;

  // AWS EC2: use SSM SendCommand
  if (instanceId && provider === "aws") {
    await executeViaSSM(ctx, enabled, logger);
    return;
  }

  // GCP / other VPS: use SSH
  if (serverIp && deployKeyPath) {
    await executeViaSSH(ctx, enabled, logger, runCmd);
    return;
  }

  await logger.warn("Cannot execute post-deploy commands — no SSH key or SSM instance available");
}
