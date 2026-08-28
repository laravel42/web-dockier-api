/**
 * AWS EC2 VPS Provisioning (Dokploy path)
 *
 * Launches a bare Ubuntu VPS on the *tenant's own* AWS account, so Dokploy
 * can register it as a remote deploy target and run its own setup (Docker,
 * Traefik, build tools). We intentionally do the minimum here — no user-data
 * bootstrapping — because Dokploy's `server.setup` handles software install.
 *
 * Idempotent building blocks:
 *   - Key pair is imported by a deterministic name (reused if present).
 *   - Security group is found-or-created by name.
 *   - The instance itself is NOT deduplicated here; the caller (provision-server
 *     stage) guards against duplicate launches via the dokploy_servers mapping.
 */

import { getEc2 } from "../../../../../lib/aws-sdk.js";

const DEFAULT_INSTANCE_TYPE = "t3.small";
const SG_NAME = "dockier-dokploy-sg";
const SG_DESCRIPTION = "Dockier/Dokploy — SSH + HTTP/HTTPS ingress";
// Canonical's AWS account ID — owner of official Ubuntu AMIs.
const CANONICAL_OWNER_ID = "099720109477";
const UBUNTU_AMI_NAME_PATTERN = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*";
// Fallback pattern for regions/generations where the gp3 lineage isn't published.
const UBUNTU_AMI_NAME_PATTERN_FALLBACK = "ubuntu/images/hvm-ssd/ubuntu-*-22.04-amd64-server-*";

export interface Ec2Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface ProvisionEc2Params {
  credentials: Ec2Credentials;
  /** Instance type from the selected plan (e.g. "t3.small"). */
  instanceType?: string;
  /** Public SSH key to install for the default user (the Dokploy-managed key). */
  sshPublicKey: string;
  /** Stable name for the imported EC2 key pair (e.g. per-project). */
  keyPairName: string;
  /** Tag value applied to the instance Name tag. */
  instanceName: string;
  /** Optional progress log. */
  log?: (line: string) => Promise<void> | void;
  /** Poll interval (ms) while waiting for a public IP. Default 5000. */
  pollIntervalMs?: number;
  /** Max time (ms) to wait for a public IP. Default 180000. */
  pollTimeoutMs?: number;
}

export interface ProvisionEc2Result {
  instanceId: string;
  publicIp: string;
}

/**
 * Launch a single EC2 instance and return its id + public IP once running.
 * Throws with actionable messages on credential/quota/permission failures.
 */
export async function provisionEc2Instance(params: ProvisionEc2Params): Promise<ProvisionEc2Result> {
  const { credentials, instanceType, sshPublicKey, keyPairName, instanceName } = params;
  const log = params.log ?? (() => {});

  const {
    EC2Client,
    ImportKeyPairCommand,
    DescribeKeyPairsCommand,
    CreateSecurityGroupCommand,
    DescribeSecurityGroupsCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeImagesCommand,
    RunInstancesCommand,
    DescribeInstancesCommand,
  } = await getEc2();

  const ec2 = new EC2Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });

  // ─── 1. Key pair (import, idempotent by name) ──────────────────
  await log(`Importing SSH key pair "${keyPairName}"...`);
  try {
    await ec2.send(new ImportKeyPairCommand({
      KeyName: keyPairName,
      PublicKeyMaterial: Buffer.from(sshPublicKey),
    }));
  } catch (err) {
    if (isDuplicateError(err)) {
      // Already imported — confirm it exists and move on.
      await ec2.send(new DescribeKeyPairsCommand({ KeyNames: [keyPairName] }));
    } else {
      throw wrapAwsError(err, "import SSH key pair");
    }
  }

  // ─── 2. Security group (find-or-create) ────────────────────────
  const securityGroupId = await ensureSecurityGroup(ec2, {
    DescribeSecurityGroupsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
  }, log);

  // ─── 3. Resolve a recent Ubuntu AMI ────────────────────────────
  const imageId = await resolveUbuntuAmi(ec2, DescribeImagesCommand, log);

  // ─── 4. Launch the instance ────────────────────────────────────
  const type = instanceType || DEFAULT_INSTANCE_TYPE;
  await log(`Launching EC2 instance (${type}, ${imageId})...`);

  let instanceId: string;
  try {
    const runResult = await ec2.send(new RunInstancesCommand({
      ImageId: imageId,
      InstanceType: type as never,
      MinCount: 1,
      MaxCount: 1,
      KeyName: keyPairName,
      SecurityGroupIds: [securityGroupId],
      BlockDeviceMappings: [{
        DeviceName: "/dev/sda1",
        Ebs: { VolumeSize: 30, VolumeType: "gp3", DeleteOnTermination: true },
      }],
      TagSpecifications: [{
        ResourceType: "instance",
        Tags: [
          { Key: "Name", Value: instanceName },
          { Key: "ManagedBy", Value: "dockier" },
        ],
      }],
    }));

    const launched = runResult.Instances?.[0]?.InstanceId;
    if (!launched) throw new Error("RunInstances returned no instance ID");
    instanceId = launched;
  } catch (err) {
    throw wrapAwsError(err, "launch EC2 instance");
  }

  await log(`Instance ${instanceId} launched. Waiting for public IP...`);

  // ─── 5. Poll until running with a public IP ────────────────────
  const publicIp = await waitForPublicIp(ec2, DescribeInstancesCommand, instanceId, log, {
    timeoutMs: params.pollTimeoutMs,
    intervalMs: params.pollIntervalMs,
  });

  await log(`Instance ${instanceId} is running at ${publicIp}`);
  return { instanceId, publicIp };
}

// ─── Helpers ─────────────────────────────────────────────────────

async function ensureSecurityGroup(
  ec2: import("@aws-sdk/client-ec2").EC2Client,
  cmds: {
    DescribeSecurityGroupsCommand: typeof import("@aws-sdk/client-ec2").DescribeSecurityGroupsCommand;
    CreateSecurityGroupCommand: typeof import("@aws-sdk/client-ec2").CreateSecurityGroupCommand;
    AuthorizeSecurityGroupIngressCommand: typeof import("@aws-sdk/client-ec2").AuthorizeSecurityGroupIngressCommand;
  },
  log: (line: string) => Promise<void> | void,
): Promise<string> {
  const { DescribeSecurityGroupsCommand, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand } = cmds;

  // Find existing by name (default VPC).
  try {
    const existing = await ec2.send(new DescribeSecurityGroupsCommand({
      Filters: [{ Name: "group-name", Values: [SG_NAME] }],
    }));
    const found = existing.SecurityGroups?.[0]?.GroupId;
    if (found) {
      await log(`Reusing security group ${found}`);
      return found;
    }
  } catch (err) {
    throw wrapAwsError(err, "look up security group");
  }

  // Create + authorize ingress 22/80/443.
  await log(`Creating security group "${SG_NAME}"...`);
  let groupId: string;
  try {
    const created = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: SG_NAME,
      Description: SG_DESCRIPTION,
    }));
    if (!created.GroupId) throw new Error("CreateSecurityGroup returned no GroupId");
    groupId = created.GroupId;
  } catch (err) {
    throw wrapAwsError(err, "create security group");
  }

  try {
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: groupId,
      IpPermissions: [22, 80, 443].map((port) => ({
        IpProtocol: "tcp",
        FromPort: port,
        ToPort: port,
        IpRanges: [{ CidrIp: "0.0.0.0/0" }],
      })),
    }));
  } catch (err) {
    if (!isDuplicateError(err)) throw wrapAwsError(err, "authorize security group ingress");
  }

  return groupId;
}

async function resolveUbuntuAmi(
  ec2: import("@aws-sdk/client-ec2").EC2Client,
  DescribeImagesCommand: typeof import("@aws-sdk/client-ec2").DescribeImagesCommand,
  log: (line: string) => Promise<void> | void,
): Promise<string> {
  for (const pattern of [UBUNTU_AMI_NAME_PATTERN, UBUNTU_AMI_NAME_PATTERN_FALLBACK]) {
    try {
      const result = await ec2.send(new DescribeImagesCommand({
        Owners: [CANONICAL_OWNER_ID],
        Filters: [
          { Name: "name", Values: [pattern] },
          { Name: "architecture", Values: ["x86_64"] },
          { Name: "state", Values: ["available"] },
          { Name: "root-device-type", Values: ["ebs"] },
        ],
      }));

      const newest = (result.Images ?? [])
        .filter((img) => img.ImageId && img.CreationDate)
        .sort((a, b) => (b.CreationDate! < a.CreationDate! ? -1 : 1))[0];

      if (newest?.ImageId) {
        await log(`Resolved Ubuntu AMI ${newest.ImageId}`);
        return newest.ImageId;
      }
    } catch (err) {
      throw wrapAwsError(err, "resolve Ubuntu AMI");
    }
  }
  throw new Error("Could not find a suitable Ubuntu AMI in this region");
}

async function waitForPublicIp(
  ec2: import("@aws-sdk/client-ec2").EC2Client,
  DescribeInstancesCommand: typeof import("@aws-sdk/client-ec2").DescribeInstancesCommand,
  instanceId: string,
  log: (line: string) => Promise<void> | void,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 5_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    let state: string | undefined;
    let ip: string | undefined;
    try {
      const desc = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
      const instance = desc.Reservations?.[0]?.Instances?.[0];
      state = instance?.State?.Name;
      ip = instance?.PublicIpAddress;
    } catch (err) {
      // A transient describe failure shouldn't abort the whole poll.
      await log(`Waiting for instance... (${err instanceof Error ? err.message : String(err)})`);
      await sleep(intervalMs);
      continue;
    }

    if (state === "running" && ip) return ip;
    // A terminal state means the launch failed — fail fast rather than polling
    // until the overall timeout.
    if (state === "terminated" || state === "shutting-down") {
      throw new Error(`Instance ${instanceId} entered state "${state}" before becoming reachable`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`Instance ${instanceId} did not report a public IP within ${Math.round(timeoutMs / 1000)}s`);
}

/** True if the AWS error indicates the resource already exists. */
function isDuplicateError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? "";
  return name === "InvalidKeyPair.Duplicate"
    || name === "InvalidGroup.Duplicate"
    || name === "InvalidPermission.Duplicate";
}

/** Turn opaque AWS SDK errors into actionable, user-facing messages. */
function wrapAwsError(err: unknown, action: string): Error {
  const name = (err as { name?: string })?.name ?? "";
  const message = err instanceof Error ? err.message : String(err);

  if (name === "AuthFailure" || name === "UnauthorizedOperation" || name === "AccessDenied") {
    return new Error(`Failed to ${action}: the AWS credentials for this provider are invalid or lack permission (${name}). Check the provider's access key, secret, and IAM policy.`);
  }
  if (name === "InvalidClientTokenId" || name === "SignatureDoesNotMatch") {
    return new Error(`Failed to ${action}: the AWS credentials for this provider are invalid (${name}).`);
  }
  if (name.includes("LimitExceeded") || name.includes("InsufficientInstanceCapacity") || name === "VcpuLimitExceeded") {
    return new Error(`Failed to ${action}: the AWS account hit a capacity or quota limit (${name}). Try a different instance type or region, or request a limit increase.`);
  }
  return new Error(`Failed to ${action}: ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
