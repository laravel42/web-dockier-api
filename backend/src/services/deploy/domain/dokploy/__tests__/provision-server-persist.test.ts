/**
 * A failed deploy must not leave orphaned infrastructure invisible to teardown.
 *
 * The server mapping (dokploy_servers row) is the only handle teardown has for
 * removing a Dokploy server and terminating its VM. These tests pin that the
 * row is written as early as a handle exists:
 *   - registerServerInDokploy persists the row (with the real serverId) BEFORE
 *     running setup/validate, so a setup failure still leaves a handle.
 *   - the AWS VM path persists the instanceId right after the VM is provisioned,
 *     so a VM that never becomes SSH-reachable is still recorded.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv({ DOKPLOY_SSH_KEY_ID: "ssh-key-1" }) }));
vi.mock("../../../../../shared/utils/time.js", () => ({
  sleep: () => Promise.resolve(),
  logTimestamp: () => "2025-01-01T00:00:00Z",
}));

const upsertServer = vi.fn().mockResolvedValue(undefined);
const updateServerStatus = vi.fn().mockResolvedValue(undefined);
const getServer = vi.fn().mockResolvedValue(null);
const deleteServerMapping = vi.fn().mockResolvedValue(undefined);
vi.mock("../mappings.js", () => ({
  getServer: (...a: unknown[]) => getServer(...a),
  upsertServer: (...a: unknown[]) => upsertServer(...a),
  updateServerStatus: (...a: unknown[]) => updateServerStatus(...a),
  deleteServerMapping: (...a: unknown[]) => deleteServerMapping(...a),
}));

const provisionEc2Instance = vi.fn();
vi.mock("../provisioning/aws-ec2.js", () => ({
  provisionEc2Instance: (...a: unknown[]) => provisionEc2Instance(...a),
  ec2InstanceIsAlive: vi.fn(),
}));
vi.mock("../provisioning/gcp-gce.js", () => ({
  provisionGceInstance: vi.fn(),
  gceInstanceIsAlive: vi.fn(),
}));
const waitForSsh = vi.fn();
vi.mock("../provisioning/wait-for-ssh.js", () => ({ waitForSsh: (...a: unknown[]) => waitForSsh(...a) }));
vi.mock("../provisioning/ssh-keygen.js", () => ({
  generateDockierSshKey: () => ({ publicKeyOpenssh: "ssh-rsa AAAA", privateKeyPem: "-----PEM-----" }),
}));

const getProviderCredentialsSafe = vi.fn();
vi.mock("../../../../../lib/provider-credentials.js", () => ({
  getProviderCredentialsSafe: (...a: unknown[]) => getProviderCredentialsSafe(...a),
  toAwsCredentials: (c: { accessKeyId: string; secretAccessKey: string }, region?: string) => ({ ...c, region }),
  toGcpServiceAccountKey: (c: { serviceAccountKey: string }) => c.serviceAccountKey,
}));

const { registerServerInDokploy, stageProvisionServer } = await import("../stages/provision-server.js");
import type { DokployClient } from "../client.js";

const logs: string[] = [];
const log = async (line: string) => { logs.push(line); };

beforeEach(() => {
  logs.length = 0;
  upsertServer.mockResolvedValue(undefined);
  updateServerStatus.mockResolvedValue(undefined);
  getServer.mockResolvedValue(null);
});

afterEach(() => vi.clearAllMocks());

describe("registerServerInDokploy — persist before setup", () => {
  const makeClient = (overrides: Partial<Record<string, unknown>> = {}) => ({
    createServer: vi.fn(async () => ({ serverId: "srv-new" })),
    setupServer: vi.fn(async () => undefined),
    validateServer: vi.fn(async () => ({ docker: { enabled: true }, isDokployNetworkInstalled: true })),
    ...overrides,
  }) as unknown as DokployClient & { setupServer: ReturnType<typeof vi.fn> };

  it("upserts the server mapping BEFORE running setup/validate", async () => {
    const client = makeClient();

    await registerServerInDokploy({
      projectId: "proj-1", providerId: "prov-1", serverIp: "1.2.3.4", client, log,
    });

    const upsertOrder = upsertServer.mock.invocationCallOrder[0];
    const setupOrder = (client as unknown as { setupServer: ReturnType<typeof vi.fn> }).setupServer.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeDefined();
    expect(setupOrder).toBeDefined();
    expect(upsertOrder).toBeLessThan(setupOrder);
    // Early upsert carries the real serverId so teardown has a handle.
    expect(upsertServer).toHaveBeenCalledWith(
      expect.objectContaining({ dokployServerId: "srv-new", serverStatus: "provisioning" }),
    );
  });

  it("leaves a server-mapping row when setup/validate throws", async () => {
    const client = makeClient({ validateServer: vi.fn(async () => { throw new Error("setup boom"); }) });

    await expect(
      registerServerInDokploy({ projectId: "proj-1", providerId: "prov-1", serverIp: "1.2.3.4", client, log }),
    ).rejects.toThrow();

    // The row was written before the failure, so teardown can find the server.
    expect(upsertServer).toHaveBeenCalledWith(
      expect.objectContaining({ dokployServerId: "srv-new" }),
    );
    expect(updateServerStatus).toHaveBeenCalledWith("proj-1", "error");
  });
});

describe("AWS VM path — persist instanceId before SSH", () => {
  it("records the VM instanceId when the VM never becomes SSH-reachable", async () => {
    getProviderCredentialsSafe.mockResolvedValue({
      provider: "aws",
      region: "us-east-1",
      credential: { kind: "aws", accessKeyId: "AKIA", secretAccessKey: "secret" },
    });
    provisionEc2Instance.mockResolvedValue({ instanceId: "i-dead", publicIp: "9.9.9.9" });
    // SSH never comes up — the stage throws after this.
    waitForSsh.mockResolvedValue(false);

    const client = { listSSHKeys: vi.fn(async () => [{ sshKeyId: "ssh-key-1", publicKey: "ssh-rsa AAAA" }]) } as unknown as DokployClient;

    await expect(
      stageProvisionServer({ projectId: "proj-1", providerId: "prov-1", client, log }),
    ).rejects.toThrow(/SSH-reachable/i);

    // A VM was created but SSH failed: the instanceId must already be persisted
    // so teardown can terminate the orphaned instance.
    expect(upsertServer).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: "i-dead", serverIp: "9.9.9.9", serverStatus: "provisioning" }),
    );
  });
});
