/**
 * Post-Deploy Command Execution
 *
 * Extracted from the run-post-deploy route handler. Encapsulates all logic for:
 * - Resolving the EC2 instance from CloudFormation stack outputs
 * - Building Docker exec command chains with container readiness checks
 * - Executing commands via SSM SendCommand
 * - Polling for SSM command completion
 *
 * This module is pure business logic — no Fastify request/reply coupling.
 */

import type { ResolvedCredentials } from "../../../lib/provider-credentials.js";
import { deriveAppName, deriveStackName } from "./cfn-deploy.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PostDeployCommand {
  command: string;
  enabled: boolean;
  continueOnFailure: boolean;
}

export interface PostDeployParams {
  buildRow: {
    source_repo: string;
    build_metadata: string | null;
    provider_id: string | null;
  };
  commands: PostDeployCommand[];
  credentials: ResolvedCredentials;
}

export interface PostDeployResult {
  success: boolean;
  output: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBuildMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isLaravelProject(metadata: Record<string, unknown>, sourceRepo: string): boolean {
  const techStack: string[] = Array.isArray(metadata.techStack)
    ? (metadata.techStack as string[])
    : [];
  return (
    techStack.some((s: string) => s.toLowerCase() === "laravel") ||
    sourceRepo.toLowerCase().includes("laravel")
  );
}

function assertSafeShellToken(value: string, label: string): void {
  if (!value || !/^[a-zA-Z0-9-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: must be non-empty alphanumeric with hyphens only`);
  }
}

function buildCommandChain(commands: PostDeployCommand[], containerName: string): string {
  assertSafeShellToken(containerName, "container name");
  return commands
    .map((cmd) => {
      const escaped = cmd.command.replace(/'/g, "'\\''");
      const exec = `docker exec ${containerName} sh -c '${escaped}'`;
      return cmd.continueOnFailure ? `(${exec} || true)` : exec;
    })
    .join(" && ");
}

function buildScript(containerName: string, cmdChain: string, envSetup: string): string {
  assertSafeShellToken(containerName, "container name");
  return [
    "#!/bin/bash",
    "CONTAINER_READY=0",
    "for i in $(seq 1 90); do",
    `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi`,
    "  sleep 2",
    "done",
    `if [ "$CONTAINER_READY" != "1" ]; then echo "ERROR: Container '${containerName}' not running after 180s"; exit 1; fi`,
    `${envSetup}${cmdChain}`,
  ].join("\n");
}

// ─── Resolve Instance ────────────────────────────────────────────────────────

async function resolveInstanceId(
  stackName: string,
  credentials: ResolvedCredentials,
): Promise<string> {
  const { CloudFormationClient, DescribeStacksCommand } = await import(
    "@aws-sdk/client-cloudformation"
  );
  const cfn = new CloudFormationClient({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });

  const stackResult = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = stackResult.Stacks?.[0];
  if (!stack) {
    throw new Error("CloudFormation stack not found");
  }

  const outputs = Object.fromEntries(
    (stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]),
  );
  const instanceId = outputs.InstanceId || "";
  if (!instanceId) {
    throw new Error("No EC2 instance found in stack outputs");
  }

  return instanceId;
}

// ─── SSM Execution ───────────────────────────────────────────────────────────

const SSM_POLL_INTERVAL_MS = 5000;
const SSM_POLL_MAX_ATTEMPTS = 30;

async function executeSsmCommand(
  instanceId: string,
  script: string,
  credentials: ResolvedCredentials,
): Promise<PostDeployResult> {
  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await import(
    "@aws-sdk/client-ssm"
  );
  const ssm = new SSMClient({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });

  const sendResult = await ssm.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [script] },
      TimeoutSeconds: 300,
    }),
  );

  const commandId = sendResult.Command?.CommandId;
  if (!commandId) {
    throw new Error("Failed to send SSM command");
  }

  // Poll for completion
  for (let i = 0; i < SSM_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, SSM_POLL_INTERVAL_MS));
    try {
      const invocation = await ssm.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }),
      );
      const status = invocation.Status;

      if (status === "Success") {
        const outputLines: string[] = [];
        if (invocation.StandardOutputContent?.trim()) {
          outputLines.push(
            ...invocation.StandardOutputContent.trim().split("\n").slice(0, 50),
          );
        }
        return {
          success: true,
          output: outputLines.length > 0 ? outputLines : ["Commands executed successfully"],
        };
      }

      if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
        const outputLines: string[] = [];
        if (invocation.StandardErrorContent?.trim()) {
          outputLines.push(
            ...invocation.StandardErrorContent.trim().split("\n").slice(0, 20),
          );
        }
        if (invocation.StandardOutputContent?.trim()) {
          outputLines.push(
            ...invocation.StandardOutputContent.trim().split("\n").slice(-20),
          );
        }
        return {
          success: false,
          output: outputLines.length > 0 ? outputLines : [`Command ${status}`],
        };
      }
    } catch {
      // InvocationDoesNotExist — agent hasn't picked it up yet
    }
  }

  return { success: false, output: ["Command timed out — it may still be running on the instance"] };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Execute post-deploy commands on an EC2 instance via SSM.
 *
 * Resolves the instance from CloudFormation, builds a Docker exec script,
 * waits for the container to become ready, and runs the commands in sequence.
 */
export async function runPostDeployCommands(params: PostDeployParams): Promise<PostDeployResult> {
  const { buildRow, commands, credentials } = params;

  const enabledCommands = commands.filter((c) => c.enabled);
  if (enabledCommands.length === 0) {
    return { success: true, output: ["No commands to run"] };
  }

  const appName = deriveAppName(buildRow.source_repo || "");
  if (!appName) {
    throw new Error("Cannot derive application name from source repository");
  }

  const stackName = deriveStackName(appName);
  const containerName = appName;

  // Resolve EC2 instance from the CloudFormation stack
  const instanceId = await resolveInstanceId(stackName, credentials);

  // Build command chain
  const cmdChain = buildCommandChain(enabledCommands, containerName);

  // Laravel: copy .env into container before running commands
  const metadata = parseBuildMetadata(buildRow.build_metadata);
  const envSetup = isLaravelProject(metadata, buildRow.source_repo || "")
    ? `docker cp /tmp/${containerName}.env ${containerName}:/var/www/html/.env 2>/dev/null || docker exec ${containerName} sh -c 'touch .env' && `
    : "";

  const script = buildScript(containerName, cmdChain, envSetup);

  // Execute via SSM
  return await executeSsmCommand(instanceId, script, credentials);
}
