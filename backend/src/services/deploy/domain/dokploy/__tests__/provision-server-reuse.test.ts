/**
 * Server reuse must verify the underlying VM, not just the Dokploy record.
 *
 * The Dokploy server record routinely outlives the machine: a teardown that
 * terminates the VM but fails to remove the record (Dokploy rejects removal
 * while services remain) leaves a record that still resolves. Reusing that
 * mapping pointed the whole deploy at a terminated instance, and every
 * SSH-dependent step failed confusingly instead of simply re-provisioning.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv() }));
vi.mock("../../../../../shared/utils/time.js", () => ({
  sleep: () => Promise.resolve(),
  logTimestamp: () => "2025-01-01T00:00:00Z",
}));

const getServer = vi.fn();
const deleteServerMapping = vi.fn().mockResolvedValue(undefined);
vi.mock("../mappings.js", () => ({
  getServer: (...a: unknown[]) => getServer(...a),
  upsertServer: vi.fn().mockResolvedValue(undefined),
  updateServerStatus: vi.fn().mockResolvedValue(undefined),
  deleteServerMapping: (...a: unknown[]) => deleteServerMapping(...a),
}));

const ec2InstanceIsAlive = vi.fn();
vi.mock("../provisioning/aws-ec2.js", () => ({
  provisionEc2Instance: vi.fn(),
  ec2InstanceIsAlive: (...a: unknown[]) => ec2InstanceIsAlive(...a),
}));
const gceInstanceIsAlive = vi.fn();
vi.mock("../provisioning/gcp-gce.js", () => ({
  provisionGceInstance: vi.fn(),
  gceInstanceIsAlive: (...a: unknown[]) => gceInstanceIsAlive(...a),
}));
vi.mock("../provisioning/wait-for-ssh.js", () => ({ waitForSsh: vi.fn() }));
vi.mock("../provisioning/ssh-keygen.js", () => ({ generateDockierSshKey: vi.fn() }));

const getProviderCredentialsSafe = vi.fn();
vi.mock("../../../../../lib/provider-credentials.js", () => ({
  getProviderCredentialsSafe: (...a: unknown[]) => getProviderCredentialsSafe(...a),
  toAwsCredentials: (c: { accessKeyId: string; secretAccessKey: string }, region?: string) => ({ ...c, region }),
  toGcpServiceAccountKey: (c: { serviceAccountKey: string }) => c.serviceAccountKey,
}));

const { stageProvisionServer } = await import("../stages/provision-server.js");
import type { DokployClient } from "../client.js";

const READY_SERVER = {
  id: "s1",
  projectId: "proj-1",
  providerId: "prov-1",
  dokployServerId: "srv-abc",
  serverIp: "1.2.3.4",
  instanceId: "i-0123",
  serverStatus: "ready",
};

const AWS_CREDS = {
  provider: "aws",
  region: "us-east-1",
  credential: { kind: "aws", accessKeyId: "AKIA", secretAccessKey: "secret" },
};

/** Client whose server record lookup succeeds (record exists). */
const clientWithRecord = () => ({
  getServer: vi.fn(async () => ({ serverId: "srv-abc" })),
}) as unknown as DokployClient;

/** Client whose server record is gone. */
const clientWithoutRecord = () => ({
  getServer: vi.fn(async () => { throw new Error("404 not found"); }),
}) as unknown as DokployClient;

const logs: string[] = [];
const log = async (line: string) => { logs.push(line); };

/**
 * Run the stage when we expect it NOT to reuse. Past the reuse decision the
 * stage goes on to provision a fresh server, which needs far more wiring than
 * this test cares about — so we let that part fail and assert only on the
 * decision (mapping cleared + log), which is the behavior under test.
 */
async function runExpectingReprovision(client: DokployClient): Promise<void> {
  try {
    await stageProvisionServer({ projectId: "proj-1", providerId: "prov-1", client, log });
  } catch {
    // expected: provisioning is not wired up in this test
  }
}

beforeEach(() => {
  logs.length = 0;
  deleteServerMapping.mockResolvedValue(undefined);
  getProviderCredentialsSafe.mockResolvedValue(AWS_CREDS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("stageProvisionServer — reuse liveness", () => {
  it("reuses the server when the record exists AND the VM is alive", async () => {
    getServer.mockResolvedValue(READY_SERVER);
    ec2InstanceIsAlive.mockResolvedValue(true);

    const result = await stageProvisionServer({
      projectId: "proj-1", providerId: "prov-1", client: clientWithRecord(), log,
    });

    expect(result.reused).toBe(true);
    expect(result.serverIp).toBe("1.2.3.4");
    expect(deleteServerMapping).not.toHaveBeenCalled();
  });

  it("does NOT reuse when the record exists but the VM is terminated", async () => {
    getServer.mockResolvedValue(READY_SERVER);
    ec2InstanceIsAlive.mockResolvedValue(false);

    await runExpectingReprovision(clientWithRecord());

    expect(ec2InstanceIsAlive).toHaveBeenCalledWith(expect.objectContaining({ region: "us-east-1" }), "i-0123");
    expect(deleteServerMapping).toHaveBeenCalledWith("proj-1");
    expect(logs.some((l) => /no longer running/i.test(l))).toBe(true);
    // Never claimed reuse.
    expect(logs.some((l) => /Reusing existing server/i.test(l))).toBe(false);
  });

  it("does not even check the VM when the Dokploy record is already gone", async () => {
    getServer.mockResolvedValue(READY_SERVER);

    await runExpectingReprovision(clientWithoutRecord());

    expect(ec2InstanceIsAlive).not.toHaveBeenCalled();
    expect(deleteServerMapping).toHaveBeenCalledWith("proj-1");
    expect(logs.some((l) => /no longer exists/i.test(l))).toBe(true);
  });

  it("reuses a BYO server with no recorded instanceId (Dockier never created a VM for it)", async () => {
    getServer.mockResolvedValue({ ...READY_SERVER, instanceId: null });

    const result = await stageProvisionServer({
      projectId: "proj-1", providerId: "prov-1", client: clientWithRecord(), log,
    });

    expect(result.reused).toBe(true);
    expect(ec2InstanceIsAlive).not.toHaveBeenCalled();
  });

  it("re-provisions when provider credentials cannot be resolved to verify the VM", async () => {
    getServer.mockResolvedValue(READY_SERVER);
    getProviderCredentialsSafe.mockResolvedValue(null);

    await runExpectingReprovision(clientWithRecord());

    // Conservative: cannot confirm alive → do not reuse.
    expect(deleteServerMapping).toHaveBeenCalled();
    expect(logs.some((l) => /Reusing existing server/i.test(l))).toBe(false);
  });

  it("verifies GCE instances via the GCP path", async () => {
    getServer.mockResolvedValue(READY_SERVER);
    getProviderCredentialsSafe.mockResolvedValue({
      provider: "gcp", region: "us-central1", credential: { kind: "gcp", serviceAccountKey: "{}" },
    });
    gceInstanceIsAlive.mockResolvedValue(true);

    const result = await stageProvisionServer({
      projectId: "proj-1", providerId: "prov-1", client: clientWithRecord(), log,
    });

    expect(gceInstanceIsAlive).toHaveBeenCalledWith("{}", "i-0123");
    expect(result.reused).toBe(true);
  });
});
