/**
 * Tests for provisionGceInstance — the GCP VM launcher used by the Dokploy
 * provision-server stage. `createGcpClient` is mocked so we can assert the
 * calls made against GcpClient and simulate success/error/idempotency paths.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// A fake GcpClient with the methods provisionGceInstance uses.
const ensureFirewallRule = vi.fn().mockResolvedValue(undefined);
const createInstance = vi.fn().mockResolvedValue({ operationName: "op-1", alreadyExists: false });
const waitForZoneOperation = vi.fn().mockResolvedValue(undefined);
const getInstanceExternalIp = vi.fn().mockResolvedValue("34.1.2.3");
const listAvailableZones = vi.fn().mockResolvedValue([]);
const findInstance = vi.fn().mockResolvedValue({ zone: "us-central1-b", name: "vm-1" });
const deleteInstance = vi.fn().mockResolvedValue(true);

const createGcpClientMock = vi.fn(async () => ({
  ensureFirewallRule,
  createInstance,
  waitForZoneOperation,
  getInstanceExternalIp,
  listAvailableZones,
  findInstance,
  deleteInstance,
}));

// GcpApiError must be a real class the code can `instanceof`-check.
class GcpApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly gcpErrorCode?: string,
  ) {
    super(message);
    this.name = "GcpApiError";
  }
  get isAlreadyExists() { return this.statusCode === 409; }
  get isNotFound() { return this.statusCode === 404; }
  get isRetryable() { return this.statusCode === 429 || this.statusCode >= 500; }
}

vi.mock("../../infra/gcp-client.js", () => ({
  createGcpClient: (...args: unknown[]) => createGcpClientMock(...(args as [])),
  GcpApiError,
}));

const { provisionGceInstance, terminateGceInstance } = await import("../provisioning/gcp-gce.js");

// ─── Helpers ───────────────────────────────────────────────────────

const SA_KEY = JSON.stringify({ client_email: "sa@test.iam", private_key: "k", project_id: "proj" });

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    serviceAccountKey: SA_KEY,
    region: "us-central1",
    machineType: "e2-small",
    sshPublicKey: "ssh-ed25519 AAAA... dockier",
    instanceName: "dockier-abc12345",
    operationIntervalMs: 5,
    operationTimeoutMs: 2000,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  createInstance.mockResolvedValue({ operationName: "op-1", alreadyExists: false });
  getInstanceExternalIp.mockResolvedValue("34.1.2.3");
  listAvailableZones.mockResolvedValue([]);
  findInstance.mockResolvedValue({ zone: "us-central1-b", name: "vm-1" });
  deleteInstance.mockResolvedValue(true);
});

// ─── Happy path ────────────────────────────────────────────────────

describe("provisionGceInstance — happy path", () => {
  it("creates a VM and returns instance name, IP, and zone", async () => {
    const result = await provisionGceInstance(baseParams());

    expect(result).toEqual({ instanceId: "dockier-abc12345", publicIp: "34.1.2.3", zone: "us-central1-b" });
  });

  it("falls back to <region>-b when zone listing returns nothing", async () => {
    listAvailableZones.mockResolvedValueOnce([]);
    await provisionGceInstance(baseParams());

    expect(createInstance).toHaveBeenCalledWith("us-central1-b", expect.any(Object));
  });

  it("honors an explicit zone override without listing zones", async () => {
    await provisionGceInstance(baseParams({ zone: "europe-west1-d" }));

    expect(createInstance).toHaveBeenCalledWith("europe-west1-d", expect.any(Object));
    expect(listAvailableZones).not.toHaveBeenCalled();
  });

  it("picks the first available zone from the region when no zone is given", async () => {
    listAvailableZones.mockResolvedValueOnce(["us-central1-c", "us-central1-f"]);
    await provisionGceInstance(baseParams());

    expect(listAvailableZones).toHaveBeenCalledWith("us-central1");
    expect(createInstance).toHaveBeenCalledWith("us-central1-c", expect.any(Object));
  });

  it("passes machine type, Ubuntu image, 30GB disk, and the SSH key", async () => {
    await provisionGceInstance(baseParams({ machineType: "e2-medium" }));

    const [, params] = createInstance.mock.calls[0];
    expect(params.machineType).toBe("e2-medium");
    expect(params.sourceImage).toMatch(/ubuntu-2204-lts/);
    expect(params.diskSizeGb).toBe(30);
    expect(params.sshKeys).toBe("root:ssh-ed25519 AAAA... dockier");
  });

  it("defaults the machine type when none is provided", async () => {
    await provisionGceInstance(baseParams({ machineType: undefined }));

    expect(createInstance.mock.calls[0][1].machineType).toBe("e2-small");
  });

  it("passes sanitized cost-attribution labels", async () => {
    await provisionGceInstance(baseParams({ labels: { "dockier-project": "Proj_1", "dockier-tenant": "Tenant-9" } }));

    const labels = createInstance.mock.calls[0][1].labels as Record<string, string>;
    // GCP label values are lowercased and non-conforming chars replaced.
    expect(labels["dockier-project"]).toBe("proj_1");
    expect(labels["dockier-tenant"]).toBe("tenant-9");
  });

  it("opens a firewall rule for 22/80/443 before creating the instance", async () => {
    await provisionGceInstance(baseParams());

    expect(ensureFirewallRule).toHaveBeenCalledWith(
      expect.objectContaining({ ports: ["22", "80", "443"] }),
    );
    expect(waitForZoneOperation).toHaveBeenCalledWith("us-central1-b", "op-1", expect.any(Object));
  });
});

// ─── Instance name sanitization ────────────────────────────────────

describe("provisionGceInstance — name sanitization", () => {
  it("lowercases and replaces invalid characters", async () => {
    await provisionGceInstance(baseParams({ instanceName: "Dockier_ABC.123" }));

    expect(createInstance.mock.calls[0][1].name).toBe("dockier-abc-123");
  });

  it("prefixes names that don't start with a letter", async () => {
    await provisionGceInstance(baseParams({ instanceName: "123-app" }));

    expect(createInstance.mock.calls[0][1].name).toMatch(/^d-/);
  });
});

// ─── Idempotency ───────────────────────────────────────────────────

describe("provisionGceInstance — idempotency", () => {
  it("skips waiting for an operation when the instance already exists", async () => {
    createInstance.mockResolvedValueOnce({ operationName: "", alreadyExists: true });

    const result = await provisionGceInstance(baseParams());

    expect(waitForZoneOperation).not.toHaveBeenCalled();
    expect(result.publicIp).toBe("34.1.2.3");
  });
});

// ─── External IP polling ───────────────────────────────────────────

describe("provisionGceInstance — external IP polling", () => {
  it("polls until an external IP is assigned", async () => {
    getInstanceExternalIp
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("35.9.9.9");

    const result = await provisionGceInstance(baseParams());

    expect(result.publicIp).toBe("35.9.9.9");
    expect(getInstanceExternalIp.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("throws when no external IP appears before the timeout", async () => {
    getInstanceExternalIp.mockResolvedValue(null);

    await expect(provisionGceInstance(baseParams({ operationTimeoutMs: 40 })))
      .rejects.toThrow(/external IP/i);
  });
});

// ─── Error mapping ─────────────────────────────────────────────────

describe("provisionGceInstance — error mapping", () => {
  it("maps permission errors to an actionable service-account message", async () => {
    createInstance.mockRejectedValueOnce(new GcpApiError("forbidden", 403, "PERMISSION_DENIED"));

    await expect(provisionGceInstance(baseParams()))
      .rejects.toThrow(/invalid or lacks permission|IAM/i);
  });

  it("maps quota errors to an actionable message", async () => {
    createInstance.mockRejectedValueOnce(new GcpApiError("too many", 429, "QUOTA_EXCEEDED"));

    await expect(provisionGceInstance(baseParams()))
      .rejects.toThrow(/quota limit/i);
  });

  it("surfaces a failed create operation", async () => {
    waitForZoneOperation.mockRejectedValueOnce(new GcpApiError("GCP operation failed: boom", 500));

    await expect(provisionGceInstance(baseParams()))
      .rejects.toThrow(/provision GCE instance|boom/i);
  });

  it("wraps invalid-credentials errors from client construction", async () => {
    createGcpClientMock.mockRejectedValueOnce(new Error("Could not determine GCP project ID from service account key"));

    await expect(provisionGceInstance(baseParams()))
      .rejects.toThrow(/authenticate with GCP|invalid/i);
  });
});

// ─── Teardown ──────────────────────────────────────────────────────

describe("terminateGceInstance", () => {
  it("deletes directly when a zone is known (no cross-zone lookup)", async () => {
    await terminateGceInstance(SA_KEY, "vm-1", "us-central1-c");

    expect(findInstance).not.toHaveBeenCalled();
    expect(deleteInstance).toHaveBeenCalledWith("us-central1-c", "vm-1");
  });

  it("locates the instance across zones when no zone is given", async () => {
    findInstance.mockResolvedValueOnce({ zone: "europe-west1-b", name: "vm-1" });

    await terminateGceInstance(SA_KEY, "vm-1");

    expect(findInstance).toHaveBeenCalledWith("vm-1");
    expect(deleteInstance).toHaveBeenCalledWith("europe-west1-b", "vm-1");
  });

  it("treats an already-gone instance as success (no delete)", async () => {
    findInstance.mockResolvedValueOnce(null);

    await expect(terminateGceInstance(SA_KEY, "vm-gone")).resolves.toBeUndefined();
    expect(deleteInstance).not.toHaveBeenCalled();
  });

  it("wraps auth failures from client construction", async () => {
    createGcpClientMock.mockRejectedValueOnce(new Error("Failed to get GCP access token from service account key"));

    await expect(terminateGceInstance(SA_KEY, "vm-1", "us-central1-b"))
      .rejects.toThrow(/authenticate with GCP|invalid/i);
  });
});
