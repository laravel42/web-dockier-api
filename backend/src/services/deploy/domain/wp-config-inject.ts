/**
 * WordPress wp-config.php injection into deployed containers.
 *
 * Fetches the encrypted wp-config from the database, decrypts it,
 * and writes it into the WordPress container via SSH or SSM.
 */

import type { ContextualLogger } from "../../../lib/logging.js";
import { getSsm } from "../../../lib/aws-sdk.js";
import { revealWpConfig } from "../../projects/domain/wp-config.js";
import { pollUntil } from "./poll-until.js";
import type { RunCmdFn } from "./run-cmd.js";

interface WpConfigInjectContext {
  tenantId: string;
  projectId: string;
  containerName: string;
  region: string;
  provider: string;
  credentials: { apiKey: string; apiSecret: string };
  instanceId?: string;
  serverIp?: string;
  deployKeyPath?: string;
  workDir: string;
}

/**
 * Inject wp-config.php into the WordPress container.
 *
 * Retrieves the decrypted config from the database and writes it to
 * /var/www/html/wp-config.php inside the container.
 */
export async function injectWpConfig(
  ctx: WpConfigInjectContext,
  logger: ContextualLogger,
  runCmd: RunCmdFn,
): Promise<void> {
  const { tenantId, projectId } = ctx;

  // Fetch decrypted wp-config content
  const { content, exists } = await revealWpConfig({ tenantId, projectId });
  if (!exists && !content) {
    await logger.info("No wp-config.php configured — WordPress will use default setup wizard");
    return;
  }

  await logger.info("Injecting wp-config.php into WordPress container...");

  // Encode content as base64 to safely pass through shell without escaping issues
  const b64Content = Buffer.from(content).toString("base64");
  const injectCmd = `echo '${b64Content}' | base64 -d | docker exec -i ${ctx.containerName} tee /var/www/html/wp-config.php > /dev/null && docker exec ${ctx.containerName} chown www-data:www-data /var/www/html/wp-config.php && echo WP_CONFIG_INJECTED`;

  // Route to SSH or SSM
  if (ctx.instanceId && ctx.provider === "aws") {
    await injectViaSsm(ctx, injectCmd, logger);
  } else if (ctx.serverIp && ctx.deployKeyPath) {
    await injectViaSsh(ctx, injectCmd, logger, runCmd);
  } else {
    await logger.warn("Cannot inject wp-config.php — no SSH key or SSM instance available");
  }
}

async function injectViaSsh(
  ctx: WpConfigInjectContext,
  injectCmd: string,
  logger: ContextualLogger,
  runCmd: RunCmdFn,
): Promise<void> {
  const { containerName, serverIp, deployKeyPath, workDir } = ctx;
  if (!serverIp || !deployKeyPath) return;

  const sshOpts = [
    "-i", deployKeyPath,
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=30",
    "-o", "LogLevel=ERROR",
  ];

  // Wait for container to be running, then inject
  const remoteCmd = [
    "CONTAINER_READY=0;",
    "for i in $(seq 1 60); do",
    `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi;`,
    "  sleep 2;",
    "done;",
    `[ "$CONTAINER_READY" = "1" ]`,
    `&& ${injectCmd}`,
  ].join(" ");

  const result = await runCmd("ssh", [...sshOpts, `root@${serverIp}`, remoteCmd], { cwd: workDir });

  if (result.output.includes("WP_CONFIG_INJECTED")) {
    await logger.success("wp-config.php injected successfully");
  } else {
    await logger.warn("wp-config.php injection may not have completed successfully");
    const output = result.output.trim().replace(/Warning:.*\n?/g, "").slice(0, 300);
    if (output) await logger.info(output);
  }
}

async function injectViaSsm(
  ctx: WpConfigInjectContext,
  injectCmd: string,
  logger: ContextualLogger,
): Promise<void> {
  const { containerName, instanceId, region, credentials } = ctx;
  if (!instanceId) return;

  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand, DescribeInstanceInformationCommand } = await getSsm();
  const ssm = new SSMClient({
    region,
    credentials: { accessKeyId: credentials.apiKey, secretAccessKey: credentials.apiSecret },
  });

  // Wait for SSM agent (instance may still be booting)
  await logger.info("Waiting for SSM agent on instance...");
  const ssmReady = await pollUntil({
    check: async () => {
      try {
        const resp = await ssm.send(new DescribeInstanceInformationCommand({
          Filters: [{ Key: "InstanceIds", Values: [instanceId] }],
        }));
        return (resp.InstanceInformationList?.length ?? 0) > 0 ? true : null;
      } catch {
        return null;
      }
    },
    intervalMs: 10_000,
    timeoutMs: 300_000,
  });

  if (!ssmReady.success) {
    await logger.warn("SSM agent did not come online within timeout — skipping wp-config injection");
    return;
  }

  // Build script with container readiness check
  const script = [
    "#!/bin/bash",
    "set -e",
    `CONTAINER_READY=0`,
    `for i in $(seq 1 60); do`,
    `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi`,
    `  sleep 2`,
    `done`,
    `[ "$CONTAINER_READY" = "1" ] || exit 1`,
    injectCmd,
  ];

  let commandId: string | undefined;
  try {
    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: script },
      TimeoutSeconds: 180,
    }));
    commandId = sendResult.Command?.CommandId;
  } catch (sendErr) {
    const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
    await logger.warn(`Failed to send SSM command for wp-config injection: ${msg}`);
    return;
  }

  if (!commandId) {
    await logger.warn("Failed to send SSM command for wp-config injection");
    return;
  }

  // Poll for completion
  const pollResult = await pollUntil({
    check: async () => {
      try {
        const inv = await ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }));
        const status = inv.Status;
        if (status === "Success") return "success";
        if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
          return status;
        }
        return null;
      } catch {
        // InvocationDoesNotExist is expected while the command is still pending
        return null;
      }
    },
    intervalMs: 3000,
    timeoutMs: 120_000,
  });

  if (pollResult.success && pollResult.value === "success") {
    await logger.success("wp-config.php injected via SSM");
  } else {
    await logger.warn(`wp-config.php injection via SSM: ${pollResult.value || "timed out"}`);
  }
}
