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

const { applyDomainConfigDokploy, isDokployProject, previewDomainConfigDokploy } = await import(
  "../domain/dokploy-applier.js"
);

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

  // Reporting a registration failure as success is how a missing custom domain
  // stayed invisible: the deploy log printed "Applied 1 custom domain" while
  // Dokploy had rejected it, so the only trace was a logger.warn.
  it("never throws, but reports a createDomain failure as unsuccessful and names the host", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack" });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "app.example.com" }]);
    mockClient.listDomains.mockResolvedValue([]);
    mockClient.createDomain.mockRejectedValueOnce(new Error("dokploy 500"));

    const res = await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(res.success).toBe(false);
    expect(res.message).toContain("app.example.com");
    expect(res.message).toContain("dokploy 500");
  });

  it("does not mark a certificate active for a domain that failed to register", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack" });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "app.example.com" }]);
    mockClient.listDomains.mockResolvedValue([]);
    mockClient.createDomain.mockRejectedValueOnce(new Error("dokploy 500"));

    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    // ssl_certificates must not be updated when nothing was registered.
    expect(certUpdates).toHaveLength(0);
  });

  it("reports how many domains were newly registered vs already present", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack" });
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "new.example.com" }, { id: "dom2", name: "old.example.com" }]);
    mockClient.listDomains.mockResolvedValue([{ domainId: "existing", host: "old.example.com", certificateType: "letsencrypt" }]);

    const res = await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(res.success).toBe(true);
    expect(res.message).toContain("1 newly registered");
    expect(res.message).toContain("1 already present");
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

/**
 * Legacy rows (deployed before `container_port` was persisted) fall back to a
 * build-type guess. `static` must guess 80: Dokploy serves a static app from
 * nginx on 80, and guessing 3000 registers the domain on a dead port — the
 * certificate issues, the UI shows healthy, the browser gets a Bad Gateway.
 */
describe("applyDomainConfigDokploy — legacy port fallback by build type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    certUpdates.length = 0;
    mockClient.listDomains.mockResolvedValue([]);
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "app.example.com" }]);
  });
  afterEach(() => vi.clearAllMocks());

  /** Apply with a legacy row (no persisted port) and assert the guessed port. */
  async function expectGuessedPort(buildType: string, port: number): Promise<void> {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType, containerPort: null });
    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });
    expect(mockClient.createDomain).toHaveBeenCalledWith(expect.objectContaining({ port }));
  }

  it("guesses 80 for a legacy static row", async () => {
    await expectGuessedPort("static", 80);
  });

  it("guesses 80 for a legacy railpack row", async () => {
    await expectGuessedPort("railpack", 80);
  });

  it("guesses 3000 for a legacy dockerfile row", async () => {
    await expectGuessedPort("dockerfile", 3000);
  });

  it("prefers the persisted port over the build-type guess", async () => {
    mockGetApplication.mockResolvedValue({
      dokployApplicationId: "app-1",
      buildType: "static",
      containerPort: 8123,
    });

    await applyDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(mockClient.createDomain).toHaveBeenCalledWith(expect.objectContaining({ port: 8123 }));
  });
});

describe("previewDomainConfigDokploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.listDomains.mockResolvedValue([]);
    mockListDomains.mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it("never emits nginx directives", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack", containerPort: 80 });
    mockClient.listDomains.mockResolvedValue([
      { domainId: "d1", host: "app.example.com", port: 80, https: true, certificateType: "letsencrypt" },
    ]);

    const { generatedConfig } = await previewDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(generatedConfig).not.toMatch(/proxy_pass|server_name|listen\s+\d/);
    expect(generatedConfig).toMatch(/edge proxy/);
  });

  it("lists the live domains with scheme, port and certificate type", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack", containerPort: 80 });
    mockClient.listDomains.mockResolvedValue([
      { domainId: "d1", host: "app.example.com", port: 80, https: true, certificateType: "letsencrypt" },
      { domainId: "d2", host: "abc.sslip.io", port: 80, https: false, certificateType: "none" },
    ]);

    const { generatedConfig } = await previewDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(generatedConfig).toContain("https://app.example.com → :80");
    expect(generatedConfig).toContain("letsencrypt");

    // The auto domain is annotated on its OWN line so a user doesn't try to
    // manage it, and the user domain is not annotated.
    const lines = generatedConfig.split("\n");
    const autoLine = lines.find((l) => l.includes("abc.sslip.io"));
    const userLine = lines.find((l) => l.includes("app.example.com"));
    expect(autoLine).toContain("auto-assigned");
    expect(autoLine).toContain("http://abc.sslip.io");
    expect(userLine).not.toContain("auto-assigned");
  });

  it("reports the inferred port when none is persisted", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "static", containerPort: null });

    const { generatedConfig } = await previewDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(generatedConfig).toContain("Container port: 80");
    expect(generatedConfig).toMatch(/inferred/);
  });

  it("falls back to desired state when Dokploy is unreachable", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1", buildType: "railpack", containerPort: 80 });
    mockClient.listDomains.mockRejectedValue(new Error("connect ECONNREFUSED"));
    mockListDomains.mockResolvedValue([{ id: "dom1", name: "app.example.com" }]);

    const { generatedConfig } = await previewDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(generatedConfig).toMatch(/Could not reach the platform/);
    expect(generatedConfig).toContain("https://app.example.com → :80");
  });

  it("says domains apply on next deployment when there is no application", async () => {
    mockGetApplication.mockResolvedValue(null);

    const { generatedConfig } = await previewDomainConfigDokploy({ tenantId: "t1", projectId: "p1" });

    expect(generatedConfig).toMatch(/next deployment/i);
    expect(mockClient.listDomains).not.toHaveBeenCalled();
  });
});
