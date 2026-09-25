import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

// ─── Supabase Mock ─────────────────────────────────────────────────

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv() }));

const mockFrom = vi.fn();

vi.mock("../../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const {
  getTenantProject,
  createTenantProject,
  getServer,
  upsertServer,
  getApplication,
  upsertApplication,
  getOrCreateTenantProject,
  getOrCreateServer,
} = await import("../mappings.js");

// ─── Helpers ───────────────────────────────────────────────────────

function createChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "insert", "update", "upsert", "eq", "single", "maybeSingle"];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("mappings — getTenantProject", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns mapping when one exists", async () => {
    const row = {
      id: "uuid-1",
      organization_id: "org-1",
      dokploy_project_id: "dp-proj-1",
      dokploy_environment_id: "dp-env-1",
    };
    mockFrom.mockReturnValue(createChain({ data: row, error: null }));

    const result = await getTenantProject("org-1");

    expect(result).toEqual({
      id: "uuid-1",
      organizationId: "org-1",
      dokployProjectId: "dp-proj-1",
      dokployEnvironmentId: "dp-env-1",
    });
    expect(mockFrom).toHaveBeenCalledWith("dokploy_tenant_projects");
  });

  it("returns null when no mapping exists", async () => {
    mockFrom.mockReturnValue(createChain({ data: null, error: null }));

    const result = await getTenantProject("org-missing");

    expect(result).toBeNull();
  });

  it("throws on database error", async () => {
    mockFrom.mockReturnValue(createChain({ data: null, error: { message: "connection failed" } }));

    await expect(getTenantProject("org-1")).rejects.toThrow(/Failed to query dokploy_tenant_projects/);
  });
});

describe("mappings — createTenantProject (upsert/race-safe)", () => {
  afterEach(() => vi.clearAllMocks());

  it("upserts with onConflict on organization_id", async () => {
    const row = {
      id: "uuid-2",
      organization_id: "org-1",
      dokploy_project_id: "dp-proj-1",
      dokploy_environment_id: "dp-env-1",
    };
    const chain = createChain({ data: row, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await createTenantProject({
      organizationId: "org-1",
      dokployProjectId: "dp-proj-1",
      dokployEnvironmentId: "dp-env-1",
    });

    expect(result.organizationId).toBe("org-1");
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1" }),
      { onConflict: "organization_id" },
    );
  });

  it("throws on upsert error", async () => {
    mockFrom.mockReturnValue(createChain({ data: null, error: { message: "constraint violation" } }));

    await expect(
      createTenantProject({ organizationId: "org-1", dokployProjectId: "p1", dokployEnvironmentId: "e1" }),
    ).rejects.toThrow(/Failed to upsert dokploy_tenant_projects/);
  });
});

describe("mappings — getServer", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns server mapping when exists", async () => {
    const row = {
      id: "uuid-3",
      project_id: "proj-1",
      provider_id: "prov-1",
      dokploy_server_id: "srv-1",
      server_ip: "10.0.0.1",
      instance_id: "i-abc123",
      server_status: "ready",
    };
    mockFrom.mockReturnValue(createChain({ data: row, error: null }));

    const result = await getServer("proj-1");

    expect(result).toEqual({
      id: "uuid-3",
      projectId: "proj-1",
      providerId: "prov-1",
      dokployServerId: "srv-1",
      serverIp: "10.0.0.1",
      instanceId: "i-abc123",
      serverStatus: "ready",
      sshPrivateKey: null,
    });
  });

  it("returns null when no server mapping exists", async () => {
    mockFrom.mockReturnValue(createChain({ data: null, error: null }));

    const result = await getServer("proj-missing");

    expect(result).toBeNull();
  });
});

describe("mappings — upsertServer (race-safe)", () => {
  afterEach(() => vi.clearAllMocks());

  it("upserts with onConflict on project_id", async () => {
    const row = {
      id: "uuid-4",
      project_id: "proj-1",
      provider_id: "prov-1",
      dokploy_server_id: "srv-1",
      server_ip: "10.0.0.1",
      instance_id: null,
      server_status: "ready",
    };
    const chain = createChain({ data: row, error: null });
    mockFrom.mockReturnValue(chain);

    await upsertServer({
      projectId: "proj-1",
      providerId: "prov-1",
      dokployServerId: "srv-1",
      serverIp: "10.0.0.1",
      serverStatus: "ready",
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "proj-1", dokploy_server_id: "srv-1" }),
      { onConflict: "project_id" },
    );
  });
});

describe("mappings — getApplication", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns application mapping when exists", async () => {
    const row = {
      id: "uuid-5",
      project_id: "proj-1",
      dokploy_application_id: "app-1",
      dokploy_server_id: "srv-1",
      build_type: "nixpacks",
    };
    mockFrom.mockReturnValue(createChain({ data: row, error: null }));

    const result = await getApplication("proj-1");

    expect(result).toEqual({
      id: "uuid-5",
      projectId: "proj-1",
      dokployApplicationId: "app-1",
      dokployServerId: "srv-1",
      buildType: "nixpacks",
      appName: null,
      containerPort: null,
    });
  });
});

describe("mappings — upsertApplication (race-safe)", () => {
  afterEach(() => vi.clearAllMocks());

  it("upserts with onConflict on project_id", async () => {
    const row = {
      id: "uuid-6",
      project_id: "proj-1",
      dokploy_application_id: "app-1",
      dokploy_server_id: null,
      build_type: "dockerfile",
    };
    const chain = createChain({ data: row, error: null });
    mockFrom.mockReturnValue(chain);

    await upsertApplication({
      projectId: "proj-1",
      dokployApplicationId: "app-1",
      buildType: "dockerfile",
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "proj-1", build_type: "dockerfile" }),
      { onConflict: "project_id" },
    );
  });
});

describe("mappings — getOrCreateTenantProject", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns existing mapping without calling Dokploy API", async () => {
    const row = {
      id: "uuid-1",
      organization_id: "org-1",
      dokploy_project_id: "dp-proj-1",
      dokploy_environment_id: "dp-env-1",
    };
    // First call: getTenantProject (returns existing)
    mockFrom.mockReturnValue(createChain({ data: row, error: null }));

    const mockClient = { createProject: vi.fn() };
    const result = await getOrCreateTenantProject("org-1", "My Org", mockClient as never);

    expect(result.dokployProjectId).toBe("dp-proj-1");
    expect(mockClient.createProject).not.toHaveBeenCalled();
  });

  it("creates project in Dokploy and upserts mapping when none exists", async () => {
    // First call: getTenantProject (null)
    const emptyChain = createChain({ data: null, error: null });
    // Second call: createTenantProject (returns new mapping)
    const newRow = {
      id: "uuid-new",
      organization_id: "org-1",
      dokploy_project_id: "new-proj",
      dokploy_environment_id: "new-env",
    };
    const insertChain = createChain({ data: newRow, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? emptyChain : insertChain;
    });

    const mockClient = {
      createProject: vi.fn().mockResolvedValue({
        projectId: "new-proj",
        environments: [{ environmentId: "new-env" }],
      }),
    };

    const result = await getOrCreateTenantProject("org-1", "My Org", mockClient as never);

    expect(mockClient.createProject).toHaveBeenCalledWith({ name: "My Org" });
    expect(result.dokployProjectId).toBe("new-proj");
    expect(result.dokployEnvironmentId).toBe("new-env");
  });
});

describe("mappings — getOrCreateServer", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns existing healthy server without upserting", async () => {
    const row = {
      id: "uuid-3",
      project_id: "proj-1",
      provider_id: "prov-1",
      dokploy_server_id: "srv-existing",
      server_ip: "10.0.0.1",
      instance_id: "i-123",
      server_status: "ready",
    };
    mockFrom.mockReturnValue(createChain({ data: row, error: null }));

    const result = await getOrCreateServer("proj-1", {
      providerId: "prov-1",
      dokployServerId: "srv-new",
      serverIp: "10.0.0.2",
    });

    expect(result.dokployServerId).toBe("srv-existing");
    // No upsert call — existing server reused
  });

  it("re-provisions server in error state", async () => {
    const errorRow = {
      id: "uuid-3",
      project_id: "proj-1",
      provider_id: "prov-1",
      dokploy_server_id: "srv-old",
      server_ip: "10.0.0.1",
      instance_id: "i-123",
      server_status: "error",
    };
    const newRow = {
      id: "uuid-3",
      project_id: "proj-1",
      provider_id: "prov-1",
      dokploy_server_id: "srv-new",
      server_ip: "10.0.0.2",
      instance_id: null,
      server_status: "ready",
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createChain({ data: errorRow, error: null });
      return createChain({ data: newRow, error: null });
    });

    const result = await getOrCreateServer("proj-1", {
      providerId: "prov-1",
      dokployServerId: "srv-new",
      serverIp: "10.0.0.2",
    });

    expect(result.dokployServerId).toBe("srv-new");
    expect(result.serverStatus).toBe("ready");
  });
});
