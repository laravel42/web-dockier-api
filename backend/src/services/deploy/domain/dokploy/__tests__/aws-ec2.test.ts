/**
 * Tests for provisionEc2Instance — the AWS VPS launcher used by the Dokploy
 * provision-server stage. The AWS SDK is mocked at the getEc2() loader so we
 * can assert command inputs and simulate success/error/idempotency paths.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// ─── AWS SDK Mock ──────────────────────────────────────────────────

// Command classes are simple carriers: `new Cmd(input)` → { __type, input }.
function makeCommand(type: string) {
  return class {
    __type = type;
    input: unknown;
    constructor(input?: unknown) {
      this.input = input;
    }
  };
}

const ImportKeyPairCommand = makeCommand("ImportKeyPair");
const DescribeKeyPairsCommand = makeCommand("DescribeKeyPairs");
const CreateSecurityGroupCommand = makeCommand("CreateSecurityGroup");
const DescribeSecurityGroupsCommand = makeCommand("DescribeSecurityGroups");
const AuthorizeSecurityGroupIngressCommand = makeCommand("AuthorizeSecurityGroupIngress");
const DescribeImagesCommand = makeCommand("DescribeImages");
const RunInstancesCommand = makeCommand("RunInstances");
const DescribeInstancesCommand = makeCommand("DescribeInstances");

const sendMock = vi.fn();
const ec2ClientCtor = vi.fn();

class EC2Client {
  config: unknown;
  constructor(config: unknown) {
    ec2ClientCtor(config);
    this.config = config;
  }
  send(command: { __type: string; input: unknown }) {
    return sendMock(command);
  }
}

vi.mock("../../../../../lib/aws-sdk.js", () => ({
  getEc2: async () => ({
    EC2Client,
    ImportKeyPairCommand,
    DescribeKeyPairsCommand,
    CreateSecurityGroupCommand,
    DescribeSecurityGroupsCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeImagesCommand,
    RunInstancesCommand,
    DescribeInstancesCommand,
  }),
}));

const { provisionEc2Instance } = await import("../provisioning/aws-ec2.js");

// ─── Helpers ───────────────────────────────────────────────────────

const CREDS = { accessKeyId: "AKIA_TEST", secretAccessKey: "secret", region: "eu-west-1" };

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    credentials: CREDS,
    instanceType: "t3.small",
    sshPublicKey: "ssh-ed25519 AAAA... dockier",
    keyPairName: "dockier-abc12345",
    instanceName: "dockier-abc12345",
    // Fast polling so tests don't wait on the 5s production default.
    pollIntervalMs: 5,
    pollTimeoutMs: 2000,
    ...overrides,
  };
}

/** Build an awsError-like object with a `name` that the code branches on. */
function awsError(name: string, message = name) {
  const err = new Error(message);
  err.name = name;
  return err;
}

/**
 * Wire up sendMock to respond per command type. `describeInstances` is a
 * function so tests can vary the response across poll iterations.
 */
function routeSend(opts: {
  importKeyPair?: () => unknown;
  describeKeyPairs?: () => unknown;
  describeSecurityGroups?: () => unknown;
  createSecurityGroup?: () => unknown;
  authorizeIngress?: () => unknown;
  describeImages?: () => unknown;
  runInstances?: () => unknown;
  describeInstances?: () => unknown;
}) {
  sendMock.mockImplementation((command: { __type: string }) => {
    switch (command.__type) {
      case "ImportKeyPair": return Promise.resolve((opts.importKeyPair ?? (() => ({})))());
      case "DescribeKeyPairs": return Promise.resolve((opts.describeKeyPairs ?? (() => ({ KeyPairs: [{ KeyName: "k" }] })))());
      case "DescribeSecurityGroups": return Promise.resolve((opts.describeSecurityGroups ?? (() => ({ SecurityGroups: [] })))());
      case "CreateSecurityGroup": return Promise.resolve((opts.createSecurityGroup ?? (() => ({ GroupId: "sg-123" })))());
      case "AuthorizeSecurityGroupIngress": return Promise.resolve((opts.authorizeIngress ?? (() => ({})))());
      case "DescribeImages": return Promise.resolve((opts.describeImages ?? (() => ({ Images: [{ ImageId: "ami-newest", CreationDate: "2025-01-01T00:00:00Z" }] })))());
      case "RunInstances": return Promise.resolve((opts.runInstances ?? (() => ({ Instances: [{ InstanceId: "i-abc" }] })))());
      case "DescribeInstances": return Promise.resolve((opts.describeInstances ?? (() => ({ Reservations: [{ Instances: [{ State: { Name: "running" }, PublicIpAddress: "1.2.3.4" }] }] })))());
      default: throw new Error(`Unexpected command: ${command.__type}`);
    }
  });
}

/** Find the input passed to `send` for a given command type. */
function inputFor(type: string): any {
  const call = sendMock.mock.calls.find((c) => c[0]?.__type === type);
  return call?.[0]?.input;
}

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Happy path ────────────────────────────────────────────────────

describe("provisionEc2Instance — happy path", () => {
  it("launches an instance and returns id + public IP", async () => {
    routeSend({});

    const result = await provisionEc2Instance(baseParams());

    expect(result).toEqual({ instanceId: "i-abc", publicIp: "1.2.3.4" });
  });

  it("constructs the EC2 client with the tenant credentials + region", async () => {
    routeSend({});

    await provisionEc2Instance(baseParams());

    expect(ec2ClientCtor).toHaveBeenCalledWith({
      region: "eu-west-1",
      credentials: { accessKeyId: "AKIA_TEST", secretAccessKey: "secret" },
    });
  });

  it("passes the selected instance type and a 30GB gp3 root volume to RunInstances", async () => {
    routeSend({});

    await provisionEc2Instance(baseParams({ instanceType: "m6i.large" }));

    const input = inputFor("RunInstances");
    expect(input.InstanceType).toBe("m6i.large");
    expect(input.KeyName).toBe("dockier-abc12345");
    expect(input.SecurityGroupIds).toEqual(["sg-123"]);
    expect(input.BlockDeviceMappings[0].Ebs).toMatchObject({ VolumeSize: 30, VolumeType: "gp3" });
    expect(input.TagSpecifications[0].Tags).toEqual(
      expect.arrayContaining([{ Key: "ManagedBy", Value: "dockier" }]),
    );
  });

  it("defaults the instance type when none is provided", async () => {
    routeSend({});

    await provisionEc2Instance(baseParams({ instanceType: undefined }));

    expect(inputFor("RunInstances").InstanceType).toBe("t3.small");
  });

  it("imports the SSH key with the provided public key material", async () => {
    routeSend({});

    await provisionEc2Instance(baseParams());

    const input = inputFor("ImportKeyPair");
    expect(input.KeyName).toBe("dockier-abc12345");
    expect(Buffer.from(input.PublicKeyMaterial).toString()).toBe("ssh-ed25519 AAAA... dockier");
  });

  it("applies cost-attribution tags alongside Name and ManagedBy", async () => {
    routeSend({});

    await provisionEc2Instance(baseParams({ tags: { "dockier-project": "proj-1", "dockier-tenant": "tenant-9" } }));

    const tags = inputFor("RunInstances").TagSpecifications[0].Tags as Array<{ Key: string; Value: string }>;
    const byKey = Object.fromEntries(tags.map((t) => [t.Key, t.Value]));
    expect(byKey["Name"]).toBe("dockier-abc12345");
    expect(byKey["ManagedBy"]).toBe("dockier");
    expect(byKey["dockier-project"]).toBe("proj-1");
    expect(byKey["dockier-tenant"]).toBe("tenant-9");
  });
});

// ─── AMI resolution ────────────────────────────────────────────────

describe("provisionEc2Instance — AMI resolution", () => {
  it("selects the newest available Ubuntu AMI by creation date", async () => {
    routeSend({
      describeImages: () => ({
        Images: [
          { ImageId: "ami-old", CreationDate: "2023-01-01T00:00:00Z" },
          { ImageId: "ami-new", CreationDate: "2025-06-01T00:00:00Z" },
          { ImageId: "ami-mid", CreationDate: "2024-03-01T00:00:00Z" },
        ],
      }),
    });

    await provisionEc2Instance(baseParams());

    expect(inputFor("RunInstances").ImageId).toBe("ami-new");
  });

  it("throws a clear error when no Ubuntu AMI is found", async () => {
    routeSend({ describeImages: () => ({ Images: [] }) });

    await expect(provisionEc2Instance(baseParams())).rejects.toThrow(/Ubuntu AMI/i);
  });
});

// ─── Security group idempotency ────────────────────────────────────

describe("provisionEc2Instance — security group", () => {
  it("reuses an existing security group and skips creation", async () => {
    routeSend({
      describeSecurityGroups: () => ({ SecurityGroups: [{ GroupId: "sg-existing" }] }),
    });

    await provisionEc2Instance(baseParams());

    expect(inputFor("RunInstances").SecurityGroupIds).toEqual(["sg-existing"]);
    // No create call when one already exists.
    expect(sendMock.mock.calls.some((c) => c[0].__type === "CreateSecurityGroup")).toBe(false);
  });

  it("creates a security group opening 22/80/443 when none exists", async () => {
    routeSend({});

    await provisionEc2Instance(baseParams());

    const ingress = inputFor("AuthorizeSecurityGroupIngress");
    const ports = ingress.IpPermissions.map((p: any) => p.FromPort).sort((a: number, b: number) => a - b);
    expect(ports).toEqual([22, 80, 443]);
  });

  it("tolerates a duplicate-ingress error (idempotent authorize)", async () => {
    routeSend({
      authorizeIngress: () => { throw awsError("InvalidPermission.Duplicate"); },
    });

    await expect(provisionEc2Instance(baseParams())).resolves.toMatchObject({ instanceId: "i-abc" });
  });
});

// ─── Key pair idempotency ──────────────────────────────────────────

describe("provisionEc2Instance — key pair", () => {
  it("continues when the key pair already exists (Duplicate)", async () => {
    routeSend({
      importKeyPair: () => { throw awsError("InvalidKeyPair.Duplicate"); },
    });

    const result = await provisionEc2Instance(baseParams());

    expect(result.instanceId).toBe("i-abc");
    // It should verify existence via DescribeKeyPairs.
    expect(sendMock.mock.calls.some((c) => c[0].__type === "DescribeKeyPairs")).toBe(true);
  });
});

// ─── Polling for public IP ─────────────────────────────────────────

describe("provisionEc2Instance — public IP polling", () => {
  it("returns the IP once the instance is running", async () => {
    let calls = 0;
    routeSend({
      describeInstances: () => {
        calls += 1;
        if (calls === 1) return { Reservations: [{ Instances: [{ State: { Name: "pending" } }] }] };
        return { Reservations: [{ Instances: [{ State: { Name: "running" }, PublicIpAddress: "5.6.7.8" }] }] };
      },
    });

    const result = await provisionEc2Instance(baseParams());

    expect(result.publicIp).toBe("5.6.7.8");
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("throws if the instance terminates before becoming reachable", async () => {
    routeSend({
      describeInstances: () => ({ Reservations: [{ Instances: [{ State: { Name: "terminated" } }] }] }),
    });

    await expect(provisionEc2Instance(baseParams())).rejects.toThrow(/terminated|reachable/i);
  });
});

// ─── Error mapping ─────────────────────────────────────────────────

describe("provisionEc2Instance — error mapping", () => {
  it("maps auth failures to an actionable credentials message", async () => {
    routeSend({
      importKeyPair: () => { throw awsError("AuthFailure"); },
    });

    await expect(provisionEc2Instance(baseParams())).rejects.toThrow(/invalid or lack permission|invalid/i);
  });

  it("maps quota/capacity failures to an actionable message", async () => {
    routeSend({
      runInstances: () => { throw awsError("VcpuLimitExceeded"); },
    });

    await expect(provisionEc2Instance(baseParams())).rejects.toThrow(/capacity or quota limit/i);
  });

  it("throws when RunInstances returns no instance id", async () => {
    routeSend({ runInstances: () => ({ Instances: [] }) });

    await expect(provisionEc2Instance(baseParams())).rejects.toThrow(/instance ID|launch/i);
  });
});
