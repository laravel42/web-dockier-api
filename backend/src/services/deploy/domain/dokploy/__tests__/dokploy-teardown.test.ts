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
const listDatabases = vi.fn().mockResolvedValue([]);
const deleteServerMapping = vi.fn().mockResolvedValue(undefined);
const deleteApplicationMapping = vi.fn().mockResolvedValue(undefined);
const deleteDatabaseMappings = vi.fn().mockResolvedValue(undefined);

vi.mock("../mappings.js", () => ({
  getServer: (...a: unknown[]) => getServer(...a),
  getApplication: (...a: unknown[]) => getApplication(...a),
  listDatabases: (...a: unknown[]) => listDatabases(...a),
  deleteServerMapping: (...a: unknown[]) => deleteServerMapping(...a),
  deleteApplicationMapping: (...a: unknown[]) => deleteApplicationMapping(...a),
  deleteDatabaseMappings: (...a: unknown[]) => deleteDatabaseMappings(...a),
}));

const deleteApplication = vi.fn().mockResolvedValue(undefined);
const deleteServer = vi.fn().mockResolvedValue(undefined);
const deleteDatabase = vi.fn().mockResolvedValue(undefined);

vi.mock("../client.js", () => ({
  createDokployClient: () => ({
    deleteApplication: (...a: unknown[]) => deleteApplication(...a),
    deleteServer: (...a: unknown[]) => deleteServer(...a),
    deleteDatabase: (...a: unknown[]) => deleteDatabase(...a),
  }),
}));

const terminateEc2Instance = vi.fn().mockResolvedValue(undefined);
vi.mock("../provisioning/aws-ec2.js", () => ({
  terminateEc2Instance: (...a: unknown[]) => terminateEc2Instance(...a),
}));

const terminateGceInstance = vi.fn().mockResolvedValue(undefined);
vi.mock("../provisioning/gcp-gce.js", () => ({
  terminateGceInstance: (...a: unknown[]) => terminateGceInstance(...a),
}));

const getProviderCredentialsSafe = vi.fn();
vi.mock("../../../../../lib/provider-credentials.js", () => ({
  getProviderCredentialsSafe: (...a: unknown[]) => getProviderCredentialsSafe(...a),
  // Pure mappers — mirror the real implementations so the teardown branches work.
  toAwsCredentials: (credential: { accessKeyId: string; secretAccessKey: string }, region?: string) => {
    const base = { accessKeyId: credential.accessKeyId, secretAccessKey: credential.secretAccessKey };
    return region === undefined ? base : { ...base, region };
  },
  toGcpServiceAccountKey: (credential: { serviceAccountKey: string }) => credential.serviceAccountKey,
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

const AWS_CREDS = { provider: "aws", region: "eu-west-1", credential: { kind: "aws", accessKeyId: "AKIA", secretAccessKey: "secret" } };

/** Provisioned self-hosted services on the server (MySQL + Redis). */
const DATABASES = [
  { id: "d1", projectId: "proj-1", serviceType: "database", engine: "mysql", dokployDatabaseId: "my-1" },
  { id: "d2", projectId: "proj-1", serviceType: "cache", engine: "redis", dokployDatabaseId: "rd-1" },
];

afterEach(() => {
  vi.clearAllMocks();
  listDatabases.mockResolvedValue([]);
  deleteServerMapping.mockResolvedValue(undefined);
  deleteApplicationMapping.mockResolvedValue(undefined);
  deleteDatabaseMappings.mockResolvedValue(undefined);
  deleteApplication.mockResolvedValue(undefined);
  deleteServer.mockResolvedValue(undefined);
  deleteDatabase.mockResolvedValue(undefined);
  terminateEc2Instance.mockResolvedValue(undefined);
  terminateGceInstance.mockResolvedValue(undefined);
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
  it("delegates GCE VM deletion to terminateGceInstance", async () => {
    getServer.mockResolvedValue({ ...SERVER, instanceId: "vm-1" });
    getApplication.mockResolvedValue(null);
    getProviderCredentialsSafe.mockResolvedValue({ provider: "gcp", region: "us-central1", credential: { kind: "gcp", serviceAccountKey: "{}" } });

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(terminateGceInstance).toHaveBeenCalledWith("{}", "vm-1");
    expect(result.status).toBe("torn_down");
  });

  it("reports partial when GCE termination fails", async () => {
    getServer.mockResolvedValue({ ...SERVER, instanceId: "vm-gone" });
    getApplication.mockResolvedValue(null);
    getProviderCredentialsSafe.mockResolvedValue({ provider: "gcp", region: "us-central1", credential: { kind: "gcp", serviceAccountKey: "{}" } });
    terminateGceInstance.mockRejectedValueOnce(new Error("gcp down"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(result.message).toMatch(/cloud instance vm-gone/);
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
    // The server mapping row MUST be retained: it holds the instanceId, the only
    // handle on the still-running VM. Deleting it orphaned the instance and made
    // the next teardown report "nothing to tear down".
    expect(deleteServerMapping).not.toHaveBeenCalled();
    // Retry guidance, since the record was kept on purpose.
    expect(result.message).toMatch(/again/i);
  });

  it("keeps the application mapping when the application removal fails", async () => {
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(APPLICATION);
    deleteApplication.mockRejectedValueOnce(new Error("app remove failed"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(deleteApplicationMapping).not.toHaveBeenCalled();
  });

  it("still drops the application mapping when only the VM fails", async () => {
    // Independent resources: a VM failure must not block cleanup of records for
    // things that WERE removed, so a retry only revisits what actually failed.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    terminateEc2Instance.mockRejectedValueOnce(new Error("AWS down"));

    await teardownDokployProject("proj-1", "tenant-1");

    expect(deleteApplicationMapping).toHaveBeenCalled();
    expect(deleteServerMapping).not.toHaveBeenCalled();
  });
});

// ─── Provisioned database services ─────────────────────────────────

describe("teardownDokployProject — provisioned databases", () => {
  it("deletes database services BEFORE the server (Dokploy rejects removing a server with active services)", async () => {
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    listDatabases.mockResolvedValue(DATABASES);

    const order: string[] = [];
    deleteDatabase.mockImplementation(async (engine: string) => { order.push(`db:${engine}`); });
    deleteServer.mockImplementation(async () => { order.push("server"); });

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("torn_down");
    // Both engines removed, and both before the server.
    expect(deleteDatabase).toHaveBeenCalledWith("mysql", "my-1");
    expect(deleteDatabase).toHaveBeenCalledWith("redis", "rd-1");
    expect(order).toEqual(["db:mysql", "db:redis", "server"]);
    expect(deleteDatabaseMappings).toHaveBeenCalledWith("proj-1");
  });

  it("keeps the database mappings when a database removal fails", async () => {
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(null);
    listDatabases.mockResolvedValue(DATABASES);
    deleteDatabase.mockRejectedValueOnce(new Error("mysql busy"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(deleteDatabaseMappings).not.toHaveBeenCalled();
  });

  it("tears down a project that has only database services (no app or server)", async () => {
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(null);
    listDatabases.mockResolvedValue(DATABASES);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("torn_down");
    expect(deleteDatabase).toHaveBeenCalledTimes(2);
  });

  it("still reports nothing_to_tear_down when there are no mappings at all", async () => {
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(null);
    listDatabases.mockResolvedValue([]);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("nothing_to_tear_down");
  });
});

// ─── Idempotency: already-deleted resources ────────────────────────

describe("teardownDokployProject — idempotency", () => {
  it("treats an already-deleted Dokploy server as removed and clears its mapping", async () => {
    // Without this, a resource deleted out-of-band would fail forever and the
    // mapping row could never be cleared — the project would be permanently
    // stuck in a partial teardown.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    deleteServer.mockRejectedValueOnce(new Error("Server not found"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("torn_down");
    expect(deleteServerMapping).toHaveBeenCalled();
  });

  it("keeps a BYO server's mapping when its Dokploy record removal fails (no VM to fall back on)", async () => {
    // instanceId null = pre-provisioned/BYO server: there is no VM, so "cloud
    // resources gone" cannot stand in for the record being gone. Deleting the row
    // here would orphan the Dokploy record exactly like the bug this gating
    // exists to prevent.
    getServer.mockResolvedValue({ ...SERVER, instanceId: null });
    getApplication.mockResolvedValue(null);
    deleteServer.mockRejectedValueOnce(new Error("Server has active services, please delete them first"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(deleteServerMapping).not.toHaveBeenCalled();
    expect(terminateEc2Instance).not.toHaveBeenCalled();
  });

  it("clears a BYO server's mapping when its Dokploy record IS removed", async () => {
    getServer.mockResolvedValue({ ...SERVER, instanceId: null });
    getApplication.mockResolvedValue(null);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("torn_down");
    expect(deleteServerMapping).toHaveBeenCalledWith("proj-1");
  });

  it("treats an already-terminated EC2 instance as removed", async () => {
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    terminateEc2Instance.mockRejectedValueOnce(new Error("InvalidInstanceID.NotFound: does not exist"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("torn_down");
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

    // The VM is gone, so the infrastructure IS destroyed; the leftover Dokploy
    // application record costs nothing and must not strand the project.
    expect(result.status).toBe("torn_down");
    expect(result.message).toMatch(/could not be removed automatically/i);
    expect(deleteServer).toHaveBeenCalledWith("srv-abc");
    // Its mapping is retained since the record itself still exists.
    expect(deleteApplicationMapping).not.toHaveBeenCalled();
  });
});
