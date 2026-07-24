/**
 * Network Rules Applier
 *
 * Applies the generated nginx configuration to the deployed server.
 * Uses the same execution infrastructure as the commands service
 * (SSM for AWS EC2, SSH for GCP VPS).
 *
 * Strategy pattern: each deploy target type has its own applier.
 * Currently supported:
 *   - VPS (EC2/GCP Compute) → rewrites nginx config via shell commands
 *
 * Future strategies can be added without modifying existing code:
 *   - Managed (ECS/Cloud Run) → ALB rules, Cloud Armor
 *   - Static (S3/Storage) → CloudFront functions, redirect rules in bucket config
 *
 * Architecture:
 *   API handler → fetchRules → generateConfig → resolveTarget → applyToServer
 */

import { logger } from "../../../shared/logger.js";
import { deriveRepoName, stackNameFor } from "../../../lib/naming.js";
import { getProviderCredentialsSafe } from "../../../lib/provider-credentials.js";
import { getActiveDeployment } from "../../../shared/service-clients/deployments.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import {
  listSecurityRules,
  listRedirectRules,
} from "./network.js";
import { generateNginxConfig } from "./nginx-generator.js";
import type { NginxGeneratorOutput } from "./nginx-generator.js";
import { type ExecutionTarget } from "../../commands/domain/executor.js";

// ─── Types ─────────────────────────────────────────────────────────

export interface ApplyResult {
  success: boolean;
  message: string;
  /** The generated nginx config (for debugging/preview) */
  generatedConfig?: string;
}

// ─── Target Resolution ─────────────────────────────────────────────

/**
 * Resolve the execution target for a project (same pattern as command worker).
 * Returns null if the project doesn't have an active VPS deployment.
 */
async function resolveNginxTarget(
  projectId: string,
  tenantId: string,
): Promise<{ target: ExecutionTarget | null; appName: string; errorMessage?: string }> {
  const deployment = await getActiveDeployment(projectId, tenantId);

  if (!deployment) {
    return { target: null, appName: "", errorMessage: "No active deployment found. Deploy the project first." };
  }

  if (deployment.deployStrategy !== "vps") {
    return {
      target: null,
      appName: "",
      errorMessage: `Network rules are currently supported for VPS deployments only. This project uses "${deployment.deployStrategy}" strategy.`,
    };
  }

  const creds = await getProviderCredentialsSafe(deployment.providerId);
  if (!creds) {
    return { target: null, appName: "", errorMessage: "Server provider not found." };
  }
  const provider = {
    provider: creds.provider,
    api_key: creds.apiKey,
    api_secret: creds.apiSecret,
    region: creds.region,
  };

  const appName = deriveRepoName(deployment.repo);

  const infra = deployment.infra;
  const credentials = { apiKey: provider.api_key, apiSecret: provider.api_secret };
  const region = infra?.region || provider.region || "us-east-1";
  const containerName = infra?.containerName || appName;

  // AWS EC2 → SSM (preferred path: instanceId in infra)
  const instanceId = infra?.instanceId;
  if (instanceId) {
    return {
      target: { instanceId, containerName, credentials, region },
      appName,
    };
  }

  // AWS EC2 fallback: resolve instanceId from CFN stack or IP lookup
  const serverIp = infra?.serverIp;
  const stackName = infra?.stackName;
  if (provider.provider === "aws" && (serverIp || stackName)) {
    const rawInfra = infra as unknown as Record<string, string> || {};
    const resolvedInstanceId = await resolveEc2InstanceId(
      { id: deployment.id, provider_id: deployment.providerId, deploy_strategy: deployment.deployStrategy, docker_image: deployment.dockerImage, repo: deployment.repo, infra: rawInfra },
      provider,
      region,
      rawInfra,
    );
    if (resolvedInstanceId) {
      return {
        target: { instanceId: resolvedInstanceId, containerName, credentials, region },
        appName,
      };
    }
    return {
      target: null,
      appName,
      errorMessage: `Could not resolve EC2 instance ID via CFN stack or IP lookup. stack="${stackName || "unknown"}", serverIp="${serverIp || "none"}"`,
    };
  }

  // GCP VPS → SSH (limited support)
  if (serverIp && provider.provider === "gcp") {
    return {
      target: null,
      appName,
      errorMessage: "GCP VPS nginx config update requires SSH access which is not persisted between deploys. Re-deploy to apply network rules.",
    };
  }

  return { target: null, appName, errorMessage: "Cannot resolve server connection for nginx update." };
}

// ─── EC2 Instance Resolution (fallback) ────────────────────────────

interface DeploymentMeta {
  id: string;
  provider_id: string;
  deploy_strategy: string;
  docker_image: string;
  repo: string;
  infra: Record<string, unknown> | null;
}

/**
 * Resolve EC2 instance ID when it's not in the infra metadata.
 * Uses the same strategies as the command worker: CFN stack lookup, then IP lookup.
 */
async function resolveEc2InstanceId(
  deployment: DeploymentMeta,
  provider: { provider: string; api_key: string; api_secret: string; region: string },
  region: string,
  infra: Record<string, string>,
): Promise<string | undefined> {
  const credentials = { accessKeyId: provider.api_key, secretAccessKey: provider.api_secret };

  // Strategy 1: CFN stack lookup
  const repoName = deriveRepoName(deployment.repo);
  const stackName = infra.stackName || stackNameFor(repoName);

  try {
    const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({ region, credentials });

    const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = result.Stacks?.[0];
    if (stack?.Outputs) {
      const instanceOutput = stack.Outputs.find((o: { OutputKey?: string }) => o.OutputKey === "InstanceId");
      if (instanceOutput?.OutputValue) {
        logger.info(`[network] Resolved EC2 instance from CFN: ${instanceOutput.OutputValue}`);
        return instanceOutput.OutputValue;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info(`[network] CFN lookup failed for stack ${stackName}: ${msg}`);
  }

  // Strategy 2: EC2 IP lookup
  const serverIp = infra.serverIp;
  if (serverIp) {
    try {
      const { EC2Client, DescribeInstancesCommand } = await import("@aws-sdk/client-ec2");
      const ec2 = new EC2Client({ region, credentials });

      const descResult = await ec2.send(new DescribeInstancesCommand({
        Filters: [{ Name: "ip-address", Values: [serverIp] }],
      }));

      const instance = descResult.Reservations?.[0]?.Instances?.[0];
      if (instance?.InstanceId) {
        logger.info(`[network] Resolved EC2 instance from IP ${serverIp}: ${instance.InstanceId}`);
        return instance.InstanceId;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.info(`[network] EC2 IP lookup failed: ${msg}`);
    }
  }

  return undefined;
}

// ─── Host-Level Execution ──────────────────────────────────────────

interface HostExecResult {
  exitCode: number;
  output: string;
}

/**
 * Execute a script directly on the EC2 host via SSM (NOT inside the container).
 * This is used for nginx config updates which must run on the host OS.
 */
async function executeOnHost(target: ExecutionTarget, script: string): Promise<HostExecResult> {
  if (!target.instanceId || !target.credentials || !target.region) {
    return { exitCode: 1, output: "Missing instanceId, credentials, or region for host execution." };
  }

  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await import("@aws-sdk/client-ssm");
  const ssm = new SSMClient({
    region: target.region,
    credentials: { accessKeyId: target.credentials.apiKey, secretAccessKey: target.credentials.apiSecret },
  });

  try {
    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [target.instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [script] },
      TimeoutSeconds: 60,
    }));

    const commandId = sendResult.Command?.CommandId;
    if (!commandId) {
      return { exitCode: 1, output: "Failed to send SSM command" };
    }

    // Poll for completion (max ~60s)
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const invocation = await ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: target.instanceId,
        }));

        const status = invocation.Status;
        if (status === "Success") {
          return {
            exitCode: 0,
            output: (invocation.StandardOutputContent || "").trim(),
          };
        }
        if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
          const errOut = invocation.StandardErrorContent?.trim() || "";
          const stdOut = invocation.StandardOutputContent?.trim() || "";
          return { exitCode: 1, output: [stdOut, errOut].filter(Boolean).join("\n") };
        }
      } catch {
        // InvocationDoesNotExist — agent hasn't picked it up yet
      }
    }

    return { exitCode: 1, output: "SSM command timed out waiting for response" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `SSM execution error: ${msg}` };
  }
}

/**
 * Fetch raw password hashes from the DB to build htpasswd file content.
 * This is separated from the generator because the generator doesn't have
 * access to password hashes (they're not exposed in the API response).
 */
async function buildHtpasswdContent(ruleId: string): Promise<string> {
  const { data: creds, error } = await supabaseAdmin
    .from("security_rule_credentials")
    .select("username, password_hash")
    .eq("security_rule_id", ruleId);

  if (error || !creds || creds.length === 0) return "";

  // htpasswd format: username:password_hash (one per line)
  // bcrypt hashes are directly supported by nginx auth_basic
  return creds.map((c) => `${c.username}:${c.password_hash}`).join("\n");
}

// ─── Shell Script Builder ──────────────────────────────────────────

/**
 * Build a shell script that:
 * 1. Writes htpasswd files
 * 2. Writes the nginx config
 * 3. Tests and reloads nginx
 *
 * Uses heredocs for multi-line content injection.
 */
function buildApplyScript(
  appName: string,
  config: NginxGeneratorOutput,
  htpasswdContents: Map<string, string>,
): string {
  const commands: string[] = ["#!/bin/bash", "set -eu"];

  // Write htpasswd files
  for (const htFile of config.htpasswdFiles) {
    const content = htpasswdContents.get(htFile.ruleId) || "";
    if (!content) continue;

    commands.push(`cat > ${htFile.path} << 'HTPASSWD'`);
    commands.push(content);
    commands.push("HTPASSWD");
    commands.push(`chmod 640 ${htFile.path}`);
    commands.push(`chown root:www-data ${htFile.path} 2>/dev/null || true`);
  }

  // Write nginx config
  commands.push(`cat > /etc/nginx/sites-available/${appName} << 'NGINXCONF'`);
  commands.push(config.serverConfig);
  commands.push("NGINXCONF");

  // Ensure symlink exists
  commands.push(`ln -sf /etc/nginx/sites-available/${appName} /etc/nginx/sites-enabled/default`);

  // Test and reload
  commands.push("nginx -t");
  commands.push("nginx -s reload");
  commands.push('echo "NETWORK_RULES_APPLIED"');

  return commands.join("\n");
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Apply all network rules for a project to its deployed server.
 *
 * This is the main entry point called by the API route when rules are
 * created, updated, or deleted. It:
 * 1. Fetches all security + redirect rules for the project
 * 2. Generates an nginx config
 * 3. Resolves the server target
 * 4. Executes the apply script via SSM/SSH
 */
export async function applyNetworkRules(params: {
  tenantId: string;
  projectId: string;
}): Promise<ApplyResult> {
  const { tenantId, projectId } = params;

  try {
    // 1. Fetch rules
    const [securityRules, redirectRules] = await Promise.all([
      listSecurityRules({ tenantId, projectId }),
      listRedirectRules({ tenantId, projectId }),
    ]);

    // 2. Resolve target
    const { target, appName, errorMessage } = await resolveNginxTarget(projectId, tenantId);

    if (!target) {
      // Rules are saved in DB but can't be applied right now
      // They'll be applied on next deployment
      return {
        success: true,
        message: errorMessage || "Rules saved. They will be applied on next deployment.",
      };
    }

    // 3. Generate config
    const config = generateNginxConfig({
      appName,
      securityRules,
      redirectRules,
    });

    // 4. Build htpasswd contents from DB
    const htpasswdContents = new Map<string, string>();
    await Promise.all(
      config.htpasswdFiles.map(async (htFile) => {
        const content = await buildHtpasswdContent(htFile.ruleId);
        htpasswdContents.set(htFile.ruleId, content);
      }),
    );

    // 5. Build and execute script
    const script = buildApplyScript(appName, config, htpasswdContents);

    logger.info(`[network] Applying network rules for project ${projectId}`);

    const result = await executeOnHost(target, script);

    if (result.output.includes("NETWORK_RULES_APPLIED")) {
      return {
        success: true,
        message: "Network rules applied successfully.",
        generatedConfig: config.serverConfig,
      };
    }

    if (result.exitCode !== 0) {
      logger.error(`[network] Failed to apply rules: ${result.output}`);
      return {
        success: false,
        message: `Failed to apply network rules: ${result.output.slice(0, 500)}`,
        generatedConfig: config.serverConfig,
      };
    }

    return {
      success: true,
      message: "Network rules applied.",
      generatedConfig: config.serverConfig,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[network] Error applying rules for project ${projectId}: ${msg}`);
    return { success: false, message: `Error applying network rules: ${msg}` };
  }
}
