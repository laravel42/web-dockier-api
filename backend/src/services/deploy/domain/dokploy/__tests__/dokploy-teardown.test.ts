/**
 * Tests for teardownDokployProject — removes the Dokploy application + server
 * and terminates the tenant's cloud VM when a project is torn down. All
 * external effects are mocked so we can assert ordering, provider dispatch,
 * and best-effort partial-failure behavior.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { DokployError } from "../types.js";

// ─── Mocks ─────────────────────────────────────────────────────────

const getServer = vi.fn();
const getApplication = vi.fn();
// A project is deployed as an application OR a compose stack. Defaults to no
// compose row, so every application case below behaves exactly as before.
const getCompose = vi.fn().mockResolvedValue(null);
const deleteComposeMapping = vi.fn().mockResolvedValue(undefined);
const listDatabases = vi.fn().mockResolvedValue([]);
const deleteServerMapping = vi.fn().mockResolvedValue(undefined);
const deleteApplicationMapping = vi.fn().mockResolvedValue(undefined);
const deleteDatabaseMappings = vi.fn().mockResolvedValue(undefined);

vi.mock("../mappings.js", () => ({
  getServer: (...a: unknown[]) => getServer(...a),
  getApplication: (...a: unknown[]) => getApplication(...a),
  getCompose: (...a: unknown[]) => getCompose(...a),
  deleteComposeMapping: (...a: unknown[]) => deleteComposeMapping(...a),
  listDatabases: (...a: unknown[]) => listDatabases(...a),
  deleteServerMapping: (...a: unknown[]) => deleteServerMapping(...a),
  deleteApplicationMapping: (...a: unknown[]) => deleteApplicationMapping(...a),
  deleteDatabaseMappings: (...a: unknown[]) => deleteDatabaseMappings(...a),
}));

const deleteApplication = vi.fn().mockResolvedValue(undefined);
const deleteServer = vi.fn().mockResolvedValue(undefined);
const deleteDatabase = vi.fn().mockResolvedValue(undefined);
const listDomains = vi.fn().mockResolvedValue([]);
const deleteDomain = vi.fn().mockResolvedValue(undefined);
// Verify helpers: default to "gone" (false) so a successful delete is confirmed.
// A test that wants to simulate a delete that did NOT take effect overrides
// these to return true.
const applicationExists = vi.fn().mockResolvedValue(false);
const databaseExists = vi.fn().mockResolvedValue(false);
const deleteCompose = vi.fn().mockResolvedValue(undefined);
const composeExists = vi.fn().mockResolvedValue(false);
const listComposeDomains = vi.fn().mockResolvedValue([]);

vi.mock("../client.js", () => ({
  createDokployClient: () => ({
    deleteApplication: (...a: unknown[]) => deleteApplication(...a),
    deleteServer: (...a: unknown[]) => deleteServer(...a),
    deleteDatabase: (...a: unknown[]) => deleteDatabase(...a),
    listDomains: (...a: unknown[]) => listDomains(...a),
    deleteDomain: (...a: unknown[]) => deleteDomain(...a),
    applicationExists: (...a: unknown[]) => applicationExists(...a),
    databaseExists: (...a: unknown[]) => databaseExists(...a),
    deleteCompose: (...a: unknown[]) => deleteCompose(...a),
    composeExists: (...a: unknown[]) => composeExists(...a),
    listComposeDomains: (...a: unknown[]) => listComposeDomains(...a),
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
  listDomains.mockResolvedValue([]);
  deleteDomain.mockResolvedValue(undefined);
  listDatabases.mockResolvedValue([]);
  deleteServerMapping.mockResolvedValue(undefined);
  deleteApplicationMapping.mockResolvedValue(undefined);
  deleteDatabaseMappings.mockResolvedValue(undefined);
  deleteApplication.mockResolvedValue(undefined);
  deleteServer.mockResolvedValue(undefined);
  deleteDatabase.mockResolvedValue(undefined);
  applicationExists.mockResolvedValue(false);
  databaseExists.mockResolvedValue(false);
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

// ─── Compose stacks ────────────────────────────────────────────────

/**
 * A compose project tears down the STACK rather than an application. Without
 * this path the user is left with containers, volumes and a VM they cannot
 * remove from the UI: `server.remove` is rejected while the stack still runs
 * ("Server has active services"), so the VM is never terminated and keeps
 * billing on their own cloud account.
 */
describe("teardownDokployProject — compose stacks", () => {
  // vi.clearAllMocks() clears CALLS but not implementations, so the compose row
  // has to be cleared explicitly or it leaks into the suites that follow and
  // makes their "nothing to tear down" cases find a stack.
  afterEach(() => getCompose.mockResolvedValue(null));

  const COMPOSE = {
    id: "c1",
    projectId: "proj-1",
    dokployComposeId: "comp-xyz",
    dokployServerId: "srv-abc",
    appName: "compose-abc",
    composePath: "./deploy/dokploy/docker-compose.yml",
    entryService: "web",
    entryPort: 3000,
    serviceNames: ["postgres", "api", "web"],
  };

  it("removes the stack, the server, the VM and the mapping row", async () => {
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    getCompose.mockResolvedValue(COMPOSE);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(deleteCompose).toHaveBeenCalledWith("comp-xyz", true);
    expect(deleteServer).toHaveBeenCalledWith("srv-abc");
    expect(terminateEc2Instance).toHaveBeenCalled();
    expect(deleteComposeMapping).toHaveBeenCalledWith("proj-1");
    expect(result.status).toBe("torn_down");
    // An application delete must not be attempted for a compose project.
    expect(deleteApplication).not.toHaveBeenCalled();
    expect(deleteApplicationMapping).not.toHaveBeenCalled();
  });

  it("deletes the stack's volumes, which Dokploy does not do by default", async () => {
    // compose.delete defaults deleteVolumes to false. Without the explicit
    // true, the named volumes survive a teardown and a later deploy of the
    // same project silently adopts the stale data.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    getCompose.mockResolvedValue(COMPOSE);

    await teardownDokployProject("proj-1", "tenant-1");

    expect(deleteCompose.mock.calls[0][1]).toBe(true);
  });

  it("enumerates the stack's domains by composeId, not applicationId", async () => {
    // domain.byApplicationId returns nothing for a compose stack, which would
    // leave every host claimed by a deleted resource — and a Traefik host can
    // only be held by one, so the next deploy's domain.create fails.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    getCompose.mockResolvedValue(COMPOSE);
    listComposeDomains.mockResolvedValue([{ domainId: "dom-1", host: "app.example.com" }]);

    await teardownDokployProject("proj-1", "tenant-1");

    expect(listComposeDomains).toHaveBeenCalledWith("comp-xyz");
    expect(listDomains).not.toHaveBeenCalled();
    expect(deleteDomain).toHaveBeenCalledWith("dom-1");
    listComposeDomains.mockResolvedValue([]);
  });

  it("does not remove the server while the stack is still there", async () => {
    // Dokploy rejects server.remove with "active services", so firing it would
    // leak the provider's raw error instead of an honest skip.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    getCompose.mockResolvedValue(COMPOSE);
    // The delete call "succeeds" but the stack is still present.
    composeExists.mockResolvedValue(true);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(deleteServer).not.toHaveBeenCalled();
    // The mapping row is KEPT so the teardown can be retried.
    expect(deleteComposeMapping).not.toHaveBeenCalled();
    // Still reported torn_down, by the existing rule: the VM is terminated, so
    // the billable resource is gone and the leftovers are Dokploy records that
    // cost nothing. The message says so rather than claiming a clean sweep.
    expect(result.status).toBe("torn_down");
    expect(result.message).toMatch(/could not be removed automatically/i);
    composeExists.mockResolvedValue(false);
  });

  it("still terminates the VM when the stack cannot be removed", async () => {
    // The VM is the billable resource, so stopping it is independent of the
    // Dokploy-side records.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    getCompose.mockResolvedValue(COMPOSE);
    composeExists.mockResolvedValue(true);

    await teardownDokployProject("proj-1", "tenant-1");

    expect(terminateEc2Instance).toHaveBeenCalled();
    composeExists.mockResolvedValue(false);
  });

  it("reports a compose stack as something to tear down", async () => {
    // Guards the early return: a compose-only project (no server row yet, e.g.
    // a deploy that failed after creating the stack) must not report
    // "nothing to tear down" and strand it.
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(null);
    getCompose.mockResolvedValue(COMPOSE);

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).not.toBe("nothing_to_tear_down");
    expect(deleteCompose).toHaveBeenCalled();
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

  // A Traefik host can only be claimed by one application. A domain left behind
  // on a deleted app makes the NEXT deploy's domain.create fail on a host that
  // is still held, so the project's custom domain silently never comes back.
  it("deletes the application's domains BEFORE the application itself", async () => {
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    listDomains.mockResolvedValue([
      { domainId: "dom-1", host: "app.example.com" },
      { domainId: "dom-2", host: "app-my-app-1-2-3-4.sslip.io" },
    ]);

    const order: string[] = [];
    deleteDomain.mockImplementation(async (id: string) => { order.push(`domain:${id}`); });
    deleteApplication.mockImplementation(async () => { order.push("application"); });

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(listDomains).toHaveBeenCalledWith("app-xyz");
    expect(order).toEqual(["domain:dom-1", "domain:dom-2", "application"]);
    expect(result.status).toBe("torn_down");
  });

  it("skips domains with no domainId rather than calling delete with undefined", async () => {
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(APPLICATION);
    listDomains.mockResolvedValue([{ domainId: "", host: "broken.example.com" }]);

    await teardownDokployProject("proj-1", "tenant-1");

    expect(deleteDomain).not.toHaveBeenCalled();
    expect(deleteApplication).toHaveBeenCalledWith("app-xyz");
  });

  it("reports partial when a domain cannot be removed, keeping it retryable", async () => {
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(APPLICATION);
    listDomains.mockResolvedValue([{ domainId: "dom-1", host: "app.example.com" }]);
    deleteDomain.mockRejectedValueOnce(new Error("dokploy 500"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(result.message).toContain("app.example.com");
  });

  it("treats an already-deleted domain as removed", async () => {
    getServer.mockResolvedValue(null);
    getApplication.mockResolvedValue(APPLICATION);
    listDomains.mockResolvedValue([{ domainId: "dom-1", host: "app.example.com" }]);
    deleteDomain.mockRejectedValueOnce(new Error("Domain not found"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("torn_down");
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
  it("treats a 404 on server removal as already-gone and clears its mapping", async () => {
    // Without this, a resource deleted out-of-band would fail forever and the
    // mapping row could never be cleared — the project would be permanently
    // stuck in a partial teardown. "Already gone" is now the real 404 status,
    // NOT any error text mentioning 'not found'.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(null);
    deleteServer.mockRejectedValueOnce(new DokployError("not found", 404, "server.remove"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("torn_down");
    expect(deleteServerMapping).toHaveBeenCalled();
  });

  it("treats a non-404 server-removal error as a real failure, not already-gone", async () => {
    // The exact bug: a 400 whose body contains tokens like 'not found' must NOT
    // be swallowed as success. It is a genuine failure.
    getServer.mockResolvedValue({ ...SERVER, instanceId: null });
    getApplication.mockResolvedValue(null);
    deleteServer.mockRejectedValueOnce(
      new DokployError("Server has active services, please delete them first", 400, "server.remove"),
    );

    const result = await teardownDokployProject("proj-1", "tenant-1");

    expect(result.status).toBe("partial");
    expect(deleteServerMapping).not.toHaveBeenCalled();
    // The raw provider error must not leak into the response.
    const serverStep = result.steps.find((s) => s.resource.includes("managed server"));
    expect(serverStep?.message).not.toMatch(/dokploy/i);
    expect(serverStep?.message).not.toMatch(/server\.remove/);
  });

  it("keeps a BYO server's mapping when its record removal fails (no VM to fall back on)", async () => {
    // instanceId null = pre-provisioned/BYO server: there is no VM, so "cloud
    // resources gone" cannot stand in for the record being gone. Deleting the row
    // here would orphan the record exactly like the bug this gating prevents.
    getServer.mockResolvedValue({ ...SERVER, instanceId: null });
    getApplication.mockResolvedValue(null);
    deleteServer.mockRejectedValueOnce(new DokployError("boom", 500, "server.remove"));

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
    // Cloud (non-DokployError) failures still use the text-based "already gone"
    // match — AWS has no DokployError status to key off.
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

  it("SKIPS server removal when the application removal failed", async () => {
    // The core fix. A still-present application blocks server.remove with
    // "active services". So a failed app delete must NOT be followed by a
    // server-remove attempt (which would 400 and leak the raw provider error);
    // the server is skipped with an honest message, and the app mapping is kept
    // so a retry can still target it. The VM still terminates — it is billable
    // and independent of the provider record.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    deleteApplication.mockRejectedValueOnce(new DokployError("app remove failed", 500, "application.remove"));

    const result = await teardownDokployProject("proj-1", "tenant-1");

    // Billable VM gone, but a provider record could not be removed → torn_down
    // with the "records remain" note (the VM is the thing that matters).
    expect(result.status).toBe("torn_down");
    expect(result.message).toMatch(/could not be removed automatically/i);
    // Server removal was NOT attempted, because the app is still attached.
    expect(deleteServer).not.toHaveBeenCalled();
    // App mapping retained so a retry can still reach the orphaned app.
    expect(deleteApplicationMapping).not.toHaveBeenCalled();
    // The VM was still terminated.
    expect(terminateEc2Instance).toHaveBeenCalled();
    // No provider name leaks into any step message.
    for (const step of result.steps) {
      expect(step.message).not.toMatch(/dokploy/i);
    }
  });

  it("fails the application step when the delete returns OK but the app persists", async () => {
    // The verify step: a provider delete can return without error while the app
    // lingers. applicationExists reporting true turns that into an honest failure.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    deleteApplication.mockResolvedValue(undefined); // "succeeds"
    applicationExists.mockResolvedValue(true); // but it's still there

    const result = await teardownDokployProject("proj-1", "tenant-1");

    const appStep = result.steps.find((s) => s.resource.includes("application"));
    expect(appStep?.success).toBe(false);
    expect(deleteServer).not.toHaveBeenCalled();
    expect(deleteApplicationMapping).not.toHaveBeenCalled();
  });

  it("does NOT trust a 404 on the delete when verify shows the app still present", async () => {
    // The misrouted-procedure bug: a wrong tRPC path returns a 404 ("procedure
    // not found") that is indistinguishable from an "entity already gone" 404.
    // Without verifying, that 404 was swallowed as "already removed", the app
    // mapping was dropped, and the still-attached app blocked server removal.
    // With a verify, a 404 is only trusted when the app is actually gone.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    deleteApplication.mockRejectedValueOnce(new DokployError("not found", 404, "application.delete"));
    applicationExists.mockResolvedValue(true); // the delete did not take effect

    const result = await teardownDokployProject("proj-1", "tenant-1");

    const appStep = result.steps.find((s) => s.resource.includes("application"));
    expect(appStep?.success).toBe(false);
    // The app is still attached, so the server removal must be skipped and the
    // app mapping kept so a retry can still target it.
    expect(deleteServer).not.toHaveBeenCalled();
    expect(deleteApplicationMapping).not.toHaveBeenCalled();
    // No provider name leaks into the message.
    expect(appStep?.message).not.toMatch(/dokploy/i);
  });

  it("DOES trust a 404 on the delete when verify confirms the app is gone", async () => {
    // The legitimate idempotent case: the app really was already deleted, so a
    // 404 plus a verify that confirms it is gone is an honest success.
    getServer.mockResolvedValue(SERVER);
    getApplication.mockResolvedValue(APPLICATION);
    deleteApplication.mockRejectedValueOnce(new DokployError("not found", 404, "application.delete"));
    applicationExists.mockResolvedValue(false); // genuinely gone

    const result = await teardownDokployProject("proj-1", "tenant-1");

    const appStep = result.steps.find((s) => s.resource.includes("application"));
    expect(appStep?.success).toBe(true);
    expect(deleteApplicationMapping).toHaveBeenCalledWith("proj-1");
  });
});
