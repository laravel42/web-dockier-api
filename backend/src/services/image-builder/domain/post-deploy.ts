/**
 * Post-Deploy Command Execution
 *
 * Extracted from the run-post-deploy route handler. Encapsulates all logic for:
 * - Resolving the EC2 instance from CloudFormation stack outputs
 * - Building Docker exec command chains with container readiness checks
 * - Laravel .env injection (S3 upload → container copy, quoted values)
 * - Executing commands via SSM SendCommand
 * - Polling for SSM command completion
 *
 * This module is pure business logic — no Fastify request/reply coupling.
 */

import { ensureS3Bucket, getAwsAccountId } from "../../../lib/aws.js";
import type { ResolvedCredentials } from "../../../lib/provider-credentials.js";
import { formatEnvFileContent } from "../../../shared/env/format-env-file.js";
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
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseDeployParams(metadata: Record<string, unknown>): Record<string, unknown> {
  const raw = metadata.deployParams;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

function normalizeEnvVars(rawEnvVars: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(rawEnvVars)) return [];
  return rawEnvVars
    .map((v: unknown) => {
      if (typeof v === "string") {
        const idx = v.indexOf("=");
        return idx > 0 ? { name: v.slice(0, idx), value: v.slice(idx + 1) } : { name: v, value: "" };
      }
      if (v && typeof v === "object" && typeof (v as { name?: string }).name === "string") {
        const row = v as { name: string; value?: unknown };
        return { name: row.name, value: String(row.value ?? "") };
      }
      return null;
    })
    .filter((v): v is { name: string; value: string } => v !== null && v.name.length > 0);
}

function isLaravelProject(metadata: Record<string, unknown>, deployParams: Record<string, unknown>, sourceRepo: string): boolean {
  const techStack = Array.isArray(deployParams.techStack)
    ? deployParams.techStack
    : Array.isArray(metadata.techStack)
      ? metadata.techStack
      : [];
  return (
    techStack.some((s) => typeof s === "string" && s.toLowerCase() === "laravel") ||
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

function buildEnvOverrides(containerName: string, selfHostedServices: string[]): string[] {
  const overrides: string[] = [];
  if (selfHostedServices.includes("database")) {
    overrides.push(
      `docker exec ${containerName} sh -c 'grep -q "^DB_HOST=" /var/www/html/.env && sed -i "s/^DB_HOST=.*/DB_HOST=host.docker.internal/" /var/www/html/.env || echo "DB_HOST=host.docker.internal" >> /var/www/html/.env'`,
    );
  }
  if (selfHostedServices.includes("cache") || selfHostedServices.includes("broadcasting")) {
    overrides.push(
      `docker exec ${containerName} sh -c 'grep -q "^REDIS_HOST=" /var/www/html/.env && sed -i "s/^REDIS_HOST=.*/REDIS_HOST=host.docker.internal/" /var/www/html/.env || echo "REDIS_HOST=host.docker.internal" >> /var/www/html/.env'`,
    );
  }
  return overrides;
}

function buildEnvSetupCommand(containerName: string, envOverrides: string[]): string {
  const envFixCmd = envOverrides.length > 0 ? `${envOverrides.join(" && ")} && ` : "";
  return `docker cp /tmp/${containerName}.env ${containerName}:/var/www/html/.env 2>/dev/null || docker exec ${containerName} sh -c 'touch .env' && ${envFixCmd}`;
}

async function uploadEnvToS3(
  containerName: string,
  envVars: Array<{ name: string; value: string }>,
  credentials: ResolvedCredentials,
): Promise<string> {
  if (envVars.length === 0) return "";

  const envContent = formatEnvFileContent(envVars);
  const accountId = await getAwsAccountId(credentials.region, {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
  });
  const envBucket = `image-builder-templates-${accountId}`;
  const envKey = `env-files/${containerName}-postdeploy.env`;

  await ensureS3Bucket(credentials.region, {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
  }, envBucket);

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });
  await s3.send(new PutObjectCommand({
    Bucket: envBucket,
    Key: envKey,
    Body: envContent,
    ContentType: "text/plain",
  }));

  return `aws s3 cp s3://${envBucket}/${envKey} /tmp/${containerName}.env --region ${credentials.region}`;
}

function buildScript(
  containerName: string,
  cmdChain: string,
  envDownloadCmd: string,
  envSetup: string,
): string {
  assertSafeShellToken(containerName, "container name");
  return [
    "#!/bin/bash",
    "CONTAINER_READY=0",
    "for i in $(seq 1 90); do",
    `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi`,
    "  sleep 2",
    "done",
    `if [ "$CONTAINER_READY" != "1" ]; then echo "ERROR: Container '${containerName}' not running after 180s"; exit 1; fi`,
    envDownloadCmd,
    `${envSetup}${cmdChain}`,
  ].filter(Boolean).join("\n");
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
    (stack.Outputs || []).map((o: { OutputKey?: string; OutputValue?: string }) => [o.OutputKey, o.OutputValue]),
  );
  const instanceId = outputs.InstanceId || "";
  if (!instanceId) {
    throw new Error("No EC2 instance found in stack outputs");
  }

  return instanceId;
}

// ─── SSM Execution ───────────────────────────────────────────────────────────

const SSM_POLL_INTERVAL_MS = 5000;
const SSM_POLL_MAX_ATTEMPTS = 70;

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
    } catch (err: unknown) {
      const awsErr = err as { name?: string };
      if (awsErr.name !== "InvocationDoesNotExist") {
        throw err;
      }
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
  const metadata = parseBuildMetadata(buildRow.build_metadata);
  const deployParams = parseDeployParams(metadata);
  const envVars = normalizeEnvVars(deployParams.envVars);
  const selfHostedServices = Array.isArray(deployParams.selfHostedServices)
    ? deployParams.selfHostedServices.filter((s): s is string => typeof s === "string")
    : [];
  const isLaravel = isLaravelProject(metadata, deployParams, buildRow.source_repo || "");

  const instanceId = await resolveInstanceId(stackName, credentials);
  const cmdChain = buildCommandChain(enabledCommands, containerName);

  let envDownloadCmd = "";
  if (isLaravel && envVars.length > 0) {
    envDownloadCmd = await uploadEnvToS3(containerName, envVars, credentials);
  }

  const envSetup = isLaravel
    ? buildEnvSetupCommand(containerName, buildEnvOverrides(containerName, selfHostedServices))
    : "";

  const script = buildScript(containerName, cmdChain, envDownloadCmd, envSetup);
  return await executeSsmCommand(instanceId, script, credentials);
}
