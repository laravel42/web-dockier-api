/**
 * Domain provisioning — target resolution and host execution.
 *
 * Resolves the EC2 execution target for a project's active deployment and runs
 * shell scripts on the host via SSM. This is the infrastructure plumbing shared
 * by the domain applier's public operations (apply config, issue cert, verify
 * DNS). Nginx/certbot run on the host OS, not inside the container.
 */

import { getErrMsg } from "../../../shared/utils/error-message.js";
import { getCfn, getEc2, getSsm } from "../../../lib/aws-sdk.js";
import { deriveRepoName, stackNameFor } from "../../../lib/naming.js";
import { getProviderCredentialsSafe, toAwsCredentials } from "../../../lib/provider-credentials.js";
import { getActiveDeployment } from "../../../shared/service-clients/deployments.js";
import type { ExecutionTarget } from "../../../shared/service-clients/command-execution.js";

/** Strict domain name pattern — only allows valid hostnames. */
const SAFE_DOMAIN_NAME = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/** Validate a domain name is safe for shell interpolation. */
export function assertSafeDomainName(name: string): void {
  if (!SAFE_DOMAIN_NAME.test(name) || name.length > 253) {
    throw new Error(`Invalid domain name: "${name}"`);
  }
}

export interface HostExecResult {
  exitCode: number;
  output: string;
}

/**
 * Resolve the execution target for domain provisioning.
 * Same pattern as network applier — only VPS (EC2) is currently supported.
 */
export async function resolveDomainTarget(
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
      errorMessage: `Domain provisioning is currently supported for VPS deployments only. This project uses "${deployment.deployStrategy}" strategy.`,
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

  // AWS EC2 → SSM (preferred)
  const instanceId = infra?.instanceId;
  if (instanceId) {
    return {
      target: { instanceId, containerName, credentials, region },
      appName,
    };
  }

  // Fallback: resolve instance from CFN/IP
  if (provider.provider === "aws") {
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
  }

  return { target: null, appName, errorMessage: "Cannot resolve server connection for domain provisioning." };
}

interface DeploymentMeta {
  id: string;
  provider_id: string;
  deploy_strategy: string;
  docker_image: string;
  repo: string;
  infra: Record<string, unknown> | null;
}

async function resolveEc2InstanceId(
  deployment: DeploymentMeta,
  provider: { provider: string; api_key: string; api_secret: string; region: string },
  region: string,
  infra: Record<string, string>,
): Promise<string | undefined> {
  const credentials = { accessKeyId: provider.api_key, secretAccessKey: provider.api_secret };
  const repoName = deriveRepoName(deployment.repo);
  const stackName = infra.stackName || stackNameFor(repoName);

  try {
    const { CloudFormationClient, DescribeStacksCommand } = await getCfn();
    const cfn = new CloudFormationClient({ region, credentials });
    const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = result.Stacks?.[0];
    if (stack?.Outputs) {
      const instanceOutput = stack.Outputs.find((o: { OutputKey?: string }) => o.OutputKey === "InstanceId");
      if (instanceOutput?.OutputValue) return instanceOutput.OutputValue;
    }
  } catch {
    // CFN lookup failed
  }

  // IP-based lookup
  const serverIp = infra.serverIp;
  if (serverIp) {
    try {
      const { EC2Client, DescribeInstancesCommand } = await getEc2();
      const ec2 = new EC2Client({ region, credentials });
      const descResult = await ec2.send(new DescribeInstancesCommand({
        Filters: [{ Name: "ip-address", Values: [serverIp] }],
      }));
      const instance = descResult.Reservations?.[0]?.Instances?.[0];
      if (instance?.InstanceId) return instance.InstanceId;
    } catch {
      // IP lookup failed
    }
  }

  return undefined;
}

/**
 * Execute a script on the EC2 host via SSM (same as network applier).
 */
export async function executeOnHost(target: ExecutionTarget, script: string): Promise<HostExecResult> {
  if (!target.instanceId || !target.credentials || !target.region) {
    return { exitCode: 1, output: "Missing instanceId, credentials, or region for host execution." };
  }

  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await getSsm();
  const ssm = new SSMClient({
    region: target.region,
    credentials: toAwsCredentials(target.credentials),
  });

  try {
    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [target.instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [script] },
      TimeoutSeconds: 300,
    }));

    const commandId = sendResult.Command?.CommandId;
    if (!commandId) return { exitCode: 1, output: "Failed to send SSM command" };

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const invocation = await ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: target.instanceId,
        }));
        const status = invocation.Status;
        if (status === "Success") {
          return { exitCode: 0, output: (invocation.StandardOutputContent || "").trim() };
        }
        if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
          const errOut = invocation.StandardErrorContent?.trim() || "";
          const stdOut = invocation.StandardOutputContent?.trim() || "";
          return { exitCode: 1, output: [stdOut, errOut].filter(Boolean).join("\n") };
        }
      } catch (err) {
        // InvocationDoesNotExist is expected while SSM registers the command
        if (err instanceof Error && err.name !== "InvocationDoesNotExist") {
          throw err;
        }
      }
    }

    return { exitCode: 1, output: "SSM command timed out" };
  } catch (err) {
    const msg = getErrMsg(err);
    return { exitCode: 1, output: `SSM execution error: ${msg}` };
  }
}
