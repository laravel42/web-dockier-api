import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────
const mockGetApplication = vi.fn();
vi.mock("../../deploy/domain/dokploy/mappings.js", () => ({
  getApplication: (...a: unknown[]) => mockGetApplication(...a),
}));

const mockClient = {
  listDomains: vi.fn(),
  createDomain: vi.fn(async () => ({ domainId: "d-new" })),
  deleteDomain: vi.fn(async () => undefined),
};
vi.mock("../../deploy/domain/dokploy/client.js", () => ({
  createDokployClient: () => mockClient,
}));

const mockListDomains = vi.fn();
vi.mock("../domain/domains.js", () => ({
  listDomains: (...a: unknown[]) => mockListDomains(...a),
}));

// supabaseAdmin is only used for cert status writeback — stub a chainable no-op.
const certUpdates: Array<Record<string, unknown>> = [];
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: [{ id: "c1", domain_name: "app.example.com", type: "lets_encrypt", status: "pending" }] }),
        }),
      }),
      update: (vals: Record<string, unknown>) => {
        certUpdates.push(vals);
        return { eq: async () => ({ data: null }) };
      },
    }),
  },
}));

const { applyDomainConfigDokploy, isDokployProject } = await import("../domain/dokploy-applier.js");

describe("applyDomainConfigDokploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    certUpdates.length = 0;
    mockClient.listDomains.mockResolvedValue([]);
    mockListDomains.mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it("soft no-op when no Dokploy application yet", async () => {
    mockGetApplication.mockResolvedValue(null);
    const res = await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/next deployment/i);
    expect(mockClient.createDomain).not.toHaveBeenCalled();
  });

  it("registers a new user domain with letsencrypt+https and the build-type port (railpack→80)", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack" });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "app.example.com" }]);
    mockClient.listDomains.mockResolvedValue([]);

    const res = await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(mockClient.createDomain).toHaveBeenCalledWith({
      host: "app.example.com",
      applicationId: "app-1",
      port: 80,
      https: true,
      domainType: "application",
      certificateType: "letsencrypt",
    });
    // Cert status marked active (optimistic).
    expect(certUpdates.some((u) => u.status === "active")).toBe(true);
    expect(res.success).toBe(true);
  });

  it("uses port 3000 for non-railpack builds", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "dockerfile" });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "site.example.com" }]);
    mockClient.listDomains.mockResolvedValue([]);

    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });
    expect(mockClient.createDomain).toHaveBeenCalledWith(expect.objectContaining({ port: 3000 }));
  });

  it("prefers the stored container port over any build-type guess", async () => {
    // A railpack NODE app listens on 3000, but the old buildType-only derivation
    // returned 80 for anything railpack — registering the domain on a dead port
    // (healthy-looking certificate, Bad Gateway in the browser).
    mockGetApplication.mockResolvedValue({
      dokployApplicationId: "app-1",
      buildType: "railpack",
      containerPort: 3000,
    });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "node.example.com" }]);
    mockClient.listDomains.mockResolvedValue([]);

    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(mockClient.createDomain).toHaveBeenCalledWith(expect.objectContaining({ port: 3000 }));
  });

  it("uses the stored port for a PHP app that fell back to nixpacks (80, not 3000)", async () => {
    mockGetApplication.mockResolvedValue({
      dokployApplicationId: "app-1",
      buildType: "nixpacks",
      containerPort: 80,
    });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "php.example.com" }]);
    mockClient.listDomains.mockResolvedValue([]);

    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(mockClient.createDomain).toHaveBeenCalledWith(expect.objectContaining({ port: 80 }));
  });

  it("falls back to the build-type guess for legacy rows with no stored port", async () => {
    mockGetApplication.mockResolvedValue({
      dokployApplicationId: "app-1",
      buildType: "railpack",
      containerPort: null,
    });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "legacy.example.com" }]);
    mockClient.listDomains.mockResolvedValue([]);

    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(mockClient.createDomain).toHaveBeenCalledWith(expect.objectContaining({ port: 80 }));
  });

  it("preserves the auto sslip.io domain and removes user domains dropped from the DB", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack" });
    // DB has no user domains anymore.
    mockListDomains.mockResolvedValue([]);
    // App currently has the auto domain + a stale user domain.
    mockClient.listDomains.mockResolvedValue([
      { domainId: "auto", host: "app-x-1-2-3-4.sslip.io", certificateType: "none" },
      { domainId: "user-old", host: "old.example.com", certificateType: "letsencrypt" },
    ]);

    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    // Auto domain preserved; only the stale user domain deleted.
    expect(mockClient.deleteDomain).toHaveBeenCalledTimes(1);
    expect(mockClient.deleteDomain).toHaveBeenCalledWith("user-old");
  });

  it("does not re-create a domain already registered on the app", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack" });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "App.Example.com" }]); // case-insensitive match
    mockClient.listDomains.mockResolvedValue([{ domainId: "existing", host: "app.example.com", certificateType: "letsencrypt" }]);

    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });
    expect(mockClient.createDomain).not.toHaveBeenCalled();
    expect(mockClient.deleteDomain).not.toHaveBeenCalled();
  });

  it("never throws — a createDomain error is logged and reported as a soft result", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack" });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "app.example.com" }]);
    mockClient.listDomains.mockResolvedValue([]);
    mockClient.createDomain.mockRejectedValueOnce(new Error("dokploy 500"));

    await expect(applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" })).resolves.toMatchObject({ success: true });
  });
});

describe("isDokployProject", () => {
  beforeEach(() => mockGetApplication.mockReset());

  it("true with a mapped application id", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1" });
    expect(await isDokployProject("p1")).toBe(true);
  });

  it("false when no mapping", async () => {
    mockGetApplication.mockResolvedValue(null);
    expect(await isDokployProject("p1")).toBe(false);
  });

  it("false (never throws) on lookup error", async () => {
    mockGetApplication.mockRejectedValueOnce(new Error("db"));
    await expect(isDokployProject("p1")).resolves.toBe(false);
  });
});
