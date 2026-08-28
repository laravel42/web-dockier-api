/**
 * Tests for teardownDokployProject — removes the Dokploy application + server
 * and terminates the tenant's cloud VM when a project is torn down. All
 * external effects are mocked so we can assert ordering, provider dispatch,
 * and best-effort partial-failure behavior.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────

const getServer = vi.fn();
const getApplication = vi.fn();
const deleteServerMapping = vi.fn().mockResolvedValue(undefined);
const deleteApplicationMapping = vi.fn().mockResolvedValue(undefined);

vi.mock("../mappings.js", () => ({
  getServer: (...a: unknown[]) => getServer(...a),
  getApplication: (...a: unknown[]) => getApplication(...a),
  deleteServerMapping: (...a: unknown[]) => deleteServerMapping(...a),
  deleteApplicationMapping: (...a: unknown[]) => deleteApplicationMapping(...a),
}));

const deleteApplication = vi.fn().mockResolvedValue(undefined);
const deleteServer = vi.fn().mockResolvedValue(undefined);

vi.mock("../client.js", () => ({
  createDokployClient: () => ({
    deleteApplication: (...a: unknown[]) => deleteApplication(...a),
    deleteServer: (...a: unknown[]) => deleteServer(...a),
  }),
}));

const terminateEc2Instance = vi.fn().mockResolvedValue(undefined);
vi.mock("../provisioning/aws-ec2.js", () => ({
  terminateEc2Instance: (...a: unknown[]) => terminateEc2Instance(...a),
}));

const gcpFindInstance = vi.fn().mockResolvedValue({ zone: "us-central1-b", name: "vm-1" });
const gcpDeleteInstance = vi.fn().mockResolvedValue(true);
const createGcpClient = vi.fn(async () => ({
  findInstance: (...a: unknown[]) => gcpFindInstance(...a),
  deleteInstance: (...a: unknown[]) => gcpDeleteInstance(...a),
}));
vi.mock("../../infra/gcp-client.js", () => ({
  createGcpClient: (...a: unknown[]) => createGcpClient(...(a as [])),
}));

const getProviderCredentialsSafe = vi.fn();
vi.mock("../../../../../lib/provider-credentials.js", () => ({
  getProviderCredentialsSafe: (...a: unknown[]) => getProviderCredentialsSafe(...a),
}));

vi.mock("../../../../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { teardownDokployProject } = await import("../../lifecycle/dokploy-teardown.js");

// ─── Fixtures ──────────────────────────────────────────────────────

const SERVER = {
  id: "s1",
  projectId: "proj-1",
  providerId: "prov-1",
  dokployServerId: "srv-abc",
  serverIp: "1.2.3.4",
  instanceId: "i-0123",
  serverStatus: "ready",
};

const APPLICATION = {
  id: "a1",
  projectId: "proj-1",
  dokployApplicationId: "app-xyz",
  dokployServerId: "srv-abc",
  buildType: "nixpacks",
};

const AWS_CREDS = { provider: "aws", region: "eu-west-1", apiKey: "AKIA", apiSecret: "secret" };

afterEach(() => {
  vi.clearAllMocks();
  deleteServerMapping.mockResolvedValue(undefined);
  deleteApplicationMapping.mockResolvedValue(undefined);
  deleteApplication.mockResolvedValue(undefined);
  deleteServer.mockResolvedValue(undefined);
  terminateEc2Instance.mockResolvedValue(undefined);
  getProviderCredentialsSafe.mockResolvedValue(AWS_CREDS);
});

// ─── Nothing to tear down ──────────────────────────────────────────

describe("teardownDokployProject — nothing to tear down", () => {
  it("returns nothing_to_tear_down when no mappings exist", async () => {
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(null);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("nothing_to_tear_down");
    expect(result.steps).toEqual([]);
    expect(deleteServer).not.toHaveBeenCalled();
  });
});

// ─── Full AWS teardown ─────────────────────────────────────────────

describe("teardownDokployProject — AWS happy path", () => {
  it("removes application, server, VM, and both mapping rows", async () => {
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("torn_down");
    expect(deleteApplication).toHaveBeenCalledWith("app-xyz");
    expect(deleteServer).toHaveBeenCalledWith("srv-abc");
    expect(terminateEc2Instance).toHaveBeenCalledWith(
      { accessKeyId: "AKIA", secretAccessKey: "secret", region: "eu-west-1" },
      "i-0123",
    );
    expect(deleteApplicationMapping).toHaveBeenCalledWith("proj-1");
    expect(deleteServerMapping).toHaveBeenCalledWith("proj-1");
  });

  it("skips VM termination when the server has no instanceId", async () => {
    getServer.mockResolvedValue({ ...SERVER, instanceId: null });
    getApplication.mockResolvedValue(null);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(terminateEc2Instance).not.toHaveBeenCalled();
    expect(result.status).toBe("torn_down");
  });
});

// ─── GCP dispatch ──────────────────────────────────────────────────

describe("teardownDokployProject — GCP", () => {
  it("finds the instance zone and deletes the GCE VM", async () => {
    getServer.mockResolvedValue({ ...SERVER, instanceId: "vm-1" });
    getApplication.mockResolvedValue(null);
    getProviderCredentialsSafe.mockResolvedValue({ provider: "gcp", region: "us-central1", apiKey: "{}", apiSecret: "" });

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(gcpFindInstance).toHaveBeenCalledWith("vm-1");
    expect(gcpDeleteInstance).toHaveBeenCalledWith("us-central1-b", "vm-1");
    expect(result.status).toBe("torn_down");
  });

  it("treats an already-gone GCE instance as success", async () => {
    getServer.mockResolvedValue({ ...SERVER, instanceId: "vm-gone" });
    getApplication.mockResolvedValue(null);
    getProviderCredentialsSafe.mockResolvedValue({ provider: "gcp", region: "us-central1", apiKey: "{}", apiSecret: "" });
    gcpFindInstance.mockResolvedValueOnce(null);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(gcpDeleteInstance).not.toHaveBeenCalled();
    expect(result.status).toBe("torn_down");
  });
});

// ─── Partial failure ───────────────────────────────────────────────

describe("teardownDokployProject — partial failure", () => {
  it("reports partial when the VM termination fails but other steps succeed", async () => {
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    terminateEc2Instance.mockRejectedValueOnce(new Error("AWS down"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(result.message).toMatch(/cloud instance i-0123/);
    // Mapping rows are still cleaned up despite the VM failure.
    expect(deleteServerMapping).toHaveBeenCalled();
  });

  it("reports partial (VM may remain) when provider credentials are missing", async () => {
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    getProviderCredentialsSafe.mockResolvedValue(null);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(terminateEc2Instance).not.toHaveBeenCalled();
  });

  it("continues removing the server even if application removal fails", async () => {
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    deleteApplication.mockRejectedValueOnce(new Error("app remove failed"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(deleteServer).toHaveBeenCalledWith("srv-abc");
  });
});
