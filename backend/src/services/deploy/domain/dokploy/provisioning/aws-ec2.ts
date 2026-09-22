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
import { pollUntil } from "../../infra/poll-until.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";

// t3.medium (4 GB) is the floor for source builds. t3.small (2 GB) reliably
// OOM-kills memory-hungry builds (e.g. Vite/webpack), which surface as
// "exit code 137 / cannot allocate memory". Swap is also added at boot (see
// user-data) as a safety net for spiky builds.
const DEFAULT_INSTANCE_TYPE = "t3.medium";
const SG_NAME = "dockier-dokploy-sg";
// AWS EC2 requires GroupDescription to be ASCII only — no em dashes or other
// non-ASCII characters (it rejects them with "Character sets beyond ASCII are
// not supported"). Keep this to plain ASCII.
const SG_DESCRIPTION = "Dockier/Dokploy - SSH + HTTP/HTTPS ingress";
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
  /**
   * Additional public SSH keys to install in root's authorized_keys (OpenSSH
   * line format), e.g. Dockier's own key for command execution. Installed
   * alongside `sshPublicKey`.
   */
  extraPublicKeys?: string[];
  /** Stable name for the imported EC2 key pair (e.g. per-project). */
  keyPairName: string;
  /** Tag value applied to the instance Name tag. */
  instanceName: string;
  /** Extra tags for cost attribution / traceability (e.g. dockier:project, dockier:tenant). */
  tags?: Record<string, string>;
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

/** Swap file size added at boot to absorb memory-spiky builds. */
const SWAP_SIZE = "4G";

/**
 * cloud-init user-data that (1) enables root SSH with the provisioning key and
 * (2) adds a swap file.
 *
 * Ubuntu cloud images disable direct root SSH — connecting as root returns a
 * banner ("Please login as the user \"ubuntu\" ..."). Dokploy registers the
 * server as `root` and runs its setup over SSH as root (Docker, Swarm,
 * Traefik all need root), so root login must actually work. Without this, the
 * SSH banner is returned in place of command output and Dokploy's
 * `server.validate` fails with "Failed to parse output: ... Please log ...".
 *
 * The swap file is a safety net for source builds: Vite/webpack/etc. are
 * memory-spiky and OOM-kill on small instances (exit code 137, "cannot
 * allocate memory"). Swap lets a spike spill to disk instead of killing the
 * build. It complements the larger default instance type, not replaces it.
 */
function rootSshUserData(sshPublicKey: string, extraPublicKeys: string[] = []): string {
  // All keys go into authorized_keys: the first (Dokploy's) is written to
  // create the file; each extra (e.g. Dockier's command-exec key) is appended.
  const keyLines = [
    `echo ${JSON.stringify(sshPublicKey.trim())} > /root/.ssh/authorized_keys`,
    ...extraPublicKeys.map((k) => `echo ${JSON.stringify(k.trim())} >> /root/.ssh/authorized_keys`),
  ];
  const script = [
    "#!/bin/bash",
    "set -e",
    "mkdir -p /root/.ssh",
    "chmod 700 /root/.ssh",
    // Write the raw key (no forced-command wrapper) so root login is unrestricted.
    ...keyLines,
    "chmod 600 /root/.ssh/authorized_keys",
    // Ensure sshd allows root login with keys.
    "sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config",
    "systemctl restart ssh || systemctl restart sshd || true",
    // Add a swap file (idempotent) so memory-spiky builds don't get OOM-killed.
    `if [ ! -f /swapfile ]; then fallocate -l ${SWAP_SIZE} /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096; chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile; echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi`,
  ].join("\n");
  return Buffer.from(script).toString("base64");
}

/**
 * Launch a single EC2 instance and return its id + public IP once running.
 * Throws with actionable messages on credential/quota/permission failures.
 */
export async function provisionEc2Instance(params: ProvisionEc2Params): Promise<ProvisionEc2Result> {
  const { credentials, instanceType, sshPublicKey, extraPublicKeys, keyPairName, instanceName } = params;
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
      // Enable root SSH on first boot so Dokploy (which connects as root) can
      // run its server setup — Ubuntu blocks root SSH by default.
      UserData: rootSshUserData(sshPublicKey, extraPublicKeys),
      BlockDeviceMappings: [{
        DeviceName: "/dev/sda1",
        Ebs: { VolumeSize: 30, VolumeType: "gp3", DeleteOnTermination: true },
      }],
      TagSpecifications: [{
        ResourceType: "instance",
        Tags: [
          { Key: "Name", Value: instanceName },
          { Key: "ManagedBy", Value: "dockier" },
          ...Object.entries(params.tags ?? {}).map(([Key, Value]) => ({ Key, Value })),
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

  const { value } = await pollUntil<string>({
    intervalMs,
    timeoutMs,
    check: async () => {
      let state: string | undefined;
      let ip: string | undefined;
      try {
        const desc = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
        const instance = desc.Reservations?.[0]?.Instances?.[0];
        state = instance?.State?.Name;
        ip = instance?.PublicIpAddress;
      } catch (err) {
        // A transient describe failure shouldn't abort the whole poll.
        await log(`Waiting for instance... (${getErrMsg(err)})`);
        return null;
      }

      if (state === "running" && ip) return ip;
      // A terminal state means the launch failed — fail fast (the throw
      // propagates out of pollUntil) rather than polling until the timeout.
      if (state === "terminated" || state === "shutting-down") {
        throw new Error(`Instance ${instanceId} entered state "${state}" before becoming reachable`);
      }
      return null;
    },
  });

  if (value) return value;
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
  const message = getErrMsg(err);

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

// ─── Teardown ────────────────────────────────────────────────────

/**
 * Terminate an EC2 instance. Idempotent: a missing instance is treated as
 * already-terminated (success). Used by project teardown.
 */
export async function terminateEc2Instance(
  credentials: Ec2Credentials,
  instanceId: string,
): Promise<void> {
  const { EC2Client, TerminateInstancesCommand } = await getEc2();

  const ec2 = new EC2Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });

  try {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    // Already gone — nothing to do.
    if (name === "InvalidInstanceID.NotFound") return;
    throw wrapAwsError(err, "terminate EC2 instance");
  }
}
