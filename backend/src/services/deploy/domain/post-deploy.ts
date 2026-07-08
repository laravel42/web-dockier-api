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
import { formatEnvFileContent } from "../../../shared/env/format-env-file.js";
import type { RunCmdFn } from "./run-cmd.js";

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

// ─── Helpers ───────────────────────────────────────────────────────

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

// ─── Script-based Execution ────────────────────────────────────────

/**
 * Execute a deploy script (bash) inside the deployed container.
 *
 * This is the new approach: instead of individual PostDeployCommand objects,
 * the user writes a single bash script in Settings → Deployments.
 * The script runs inside the container via `docker exec ... bash -c '<script>'`.
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

  const { containerName, instanceId, provider, serverIp, deployKeyPath, workDir, region, credentials, techStack, services, envVars } = ctx;

  // Build the docker exec command that runs the full script
  const escapedScript = trimmed.replace(/'/g, "'\\''");
  const dockerExecCmd = `docker exec ${containerName} bash -c '${escapedScript}'`;

  if (instanceId && provider === "aws") {
    // AWS EC2: execute via SSM
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
      "CONTAINER_READY=0",
      "for i in $(seq 1 90); do",
      `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi`,
      "  sleep 2",
      "done",
      `if [ "$CONTAINER_READY" != "1" ]; then echo "ERROR: Container '${containerName}' not running after 180s"; exit 1; fi`,
      envDownloadCmd,
      envSetup ? `${envSetup}` : "",
      dockerExecCmd,
    ].filter(Boolean).join("\n");

    const { SSMClient, SendCommandCommand, GetCommandInvocationCommand, DescribeInstanceInformationCommand } = await import("@aws-sdk/client-ssm");
    const ssm = new SSMClient({
      region,
      credentials: { accessKeyId: credentials.apiKey, secretAccessKey: credentials.apiSecret },
    });

    // Wait for SSM agent to register (instance needs time after creation)
    await logger.info("Waiting for instance to register with SSM...");
    let ssmReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const info = await ssm.send(new DescribeInstanceInformationCommand({
          Filters: [{ Key: "InstanceIds", Values: [instanceId] }],
        }));
        if (info.InstanceInformationList && info.InstanceInformationList.length > 0) {
          const status = info.InstanceInformationList[0].PingStatus;
          if (status === "Online") {
            ssmReady = true;
            break;
          }
        }
      } catch { /* not registered yet */ }
      await new Promise(r => setTimeout(r, 10_000));
    }

    if (!ssmReady) {
      await logger.warn("Instance did not register with SSM after 5 minutes — deploy script may fail");
    }

    try {
      const sendResult = await ssm.send(new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: { commands: [ssmScript] },
        TimeoutSeconds: 600,
      }));

      const commandId = sendResult.Command?.CommandId;
      if (commandId) {
        for (let i = 0; i < 125; i++) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const invocation = await ssm.send(new GetCommandInvocationCommand({
              CommandId: commandId,
              InstanceId: instanceId,
            }));
            if (invocation.Status === "Success") {
              await logger.success("Deploy script completed successfully");
              if (invocation.StandardOutputContent?.trim()) {
                for (const line of invocation.StandardOutputContent.trim().split("\n").slice(-15)) {
                  await logger.info(line);
                }
              }
              return;
            }
            if (invocation.Status === "Failed" || invocation.Status === "Cancelled" || invocation.Status === "TimedOut") {
              await logger.warn(`Deploy script ${invocation.Status}`);
              if (invocation.StandardErrorContent?.trim()) {
                await logger.info(invocation.StandardErrorContent.trim().slice(0, 500));
              }
              return;
            }
          } catch { /* not ready yet */ }
        }
        await logger.warn("Deploy script still running after timeout");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await logger.warn(`SSM execution failed: ${msg}`);
    }
    return;
  }

  // GCP / other VPS: execute via SSH
  if (serverIp && deployKeyPath) {
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
    return;
  }

  await logger.warn("Cannot execute deploy script — no SSH key or SSM instance available");
}
