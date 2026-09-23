import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────
const mockGetApplication = vi.fn();
vi.mock("../../deploy/domain/dokploy/mappings.js", () => ({
  getApplication: (...a: unknown[]) => mockGetApplication(...a),
}));

const mockClient = {
  listAppMiddlewares: vi.fn(),
  deleteSecurity: vi.fn(async () => undefined),
  deleteRedirect: vi.fn(async () => undefined),
  createSecurity: vi.fn(async () => ({ securityId: "s-new" })),
  createRedirect: vi.fn(async () => ({ redirectId: "r-new" })),
};
vi.mock("../../deploy/domain/dokploy/client.js", () => ({
  createDokployClient: () => mockClient,
}));

const mockListRedirectRules = vi.fn();
const mockListSecurityRulesWithSecrets = vi.fn();
vi.mock("../domain/network.js", () => ({
  listRedirectRules: (...a: unknown[]) => mockListRedirectRules(...a),
  listSecurityRulesWithSecrets: (...a: unknown[]) => mockListSecurityRulesWithSecrets(...a),
}));

const { applyNetworkRulesDokploy, redirectToDokploy, isDokployProject } = await import("../domain/dokploy-applier.js");

describe("redirectToDokploy", () => {
  it("matches the FULL url (scheme+host) and preserves host, mapping permanent", () => {
    const out = redirectToDokploy({ fromPath: "/old", toPath: "/new", type: "permanent" } as never);
    expect(out).toEqual({
      regex: "^(https?://[^/]+)/old$",
      replacement: "$1/new",
      permanent: true,
    });
    // Sanity: the regex actually matches a real URL and produces the target.
    expect("http://app.example.com/old".replace(new RegExp(out.regex), out.replacement)).toBe("http://app.example.com/new");
    expect("https://app.example.com/old".replace(new RegExp(out.regex), out.replacement)).toBe("https://app.example.com/new");
  });

  it("temporary → permanent:false and escapes regex specials in fromPath", () => {
    const out = redirectToDokploy({ fromPath: "/blog/post.html", toPath: "/blog", type: "temporary" } as never);
    expect(out.permanent).toBe(false);
    // The "." must be escaped so it matches literally, not any-char.
    expect(out.regex).toBe("^(https?://[^/]+)/blog/post\\.html$");
    expect(out.replacement).toBe("$1/blog");
  });

  it("redirects to an absolute URL as-is (external redirect)", () => {
    const out = redirectToDokploy({ fromPath: "/go", toPath: "https://example.com/landing", type: "permanent" } as never);
    expect(out.regex).toBe("^(https?://[^/]+)/go$");
    expect(out.replacement).toBe("https://example.com/landing");
  });

  it("tolerates paths without a leading slash", () => {
    const out = redirectToDokploy({ fromPath: "old", toPath: "new", type: "temporary" } as never);
    expect(out.regex).toBe("^(https?://[^/]+)/old$");
    expect(out.replacement).toBe("$1/new");
  });
});

describe("isDokployProject", () => {
  beforeEach(() => mockGetApplication.mockReset());

  it("true when a mapping with an application id exists", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1" });
    expect(await isDokployProject("p1")).toBe(true);
  });

  it("false when no mapping / no id", async () => {
    mockGetApplication.mockResolvedValue(null);
    expect(await isDokployProject("p1")).toBe(false);
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "" });
    expect(await isDokployProject("p1")).toBe(false);
  });

  it("false (never throws) when the mapping lookup errors", async () => {
    mockGetApplication.mockRejectedValueOnce(new Error("db"));
    await expect(isDokployProject("p1")).resolves.toBe(false);
  });
});

describe("applyNetworkRulesDokploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.listAppMiddlewares.mockResolvedValue({ security: [], redirects: [] });
    mockListRedirectRules.mockResolvedValue([]);
    mockListSecurityRulesWithSecrets.mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it("no-ops (soft success) when the project has no Dokploy application yet", async () => {
    mockGetApplication.mockResolvedValue(null);
    const res = await applyNetworkRulesDokploy({ tenantId: "t1", projectId: "p1" });
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/next deployment/i);
    expect(mockClient.createSecurity).not.toHaveBeenCalled();
  });

  it("reconciles: clears existing middlewares, then creates security + redirects from DB", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1" });
    mockClient.listAppMiddlewares.mockResolvedValue({
      security: [{ securityId: "old-s", username: "u", applicationId: "app-1" }],
      redirects: [{ redirectId: "old-r", regex: "x", replacement: "y", permanent: false, applicationId: "app-1" }],
    });
    mockListSecurityRulesWithSecrets.mockResolvedValue([
      { id: "sr1", name: "admin", path: null, credentials: [{ username: "alice", password: "pw1" }] },
    ]);
    mockListRedirectRules.mockResolvedValue([
      { id: "rr1", fromPath: "/old", toPath: "/new", type: "permanent" },
    ]);

    const res = await applyNetworkRulesDokploy({ tenantId: "t1", projectId: "p1" });

    // Cleared the pre-existing entries.
    expect(mockClient.deleteSecurity).toHaveBeenCalledWith("old-s");
    expect(mockClient.deleteRedirect).toHaveBeenCalledWith("old-r");
    // Created fresh from DB, forwarding the decrypted plaintext password.
    expect(mockClient.createSecurity).toHaveBeenCalledWith({ applicationId: "app-1", username: "alice", password: "pw1" });
    expect(mockClient.createRedirect).toHaveBeenCalledWith({ applicationId: "app-1", regex: "^(https?://[^/]+)/old$", replacement: "$1/new", permanent: true });
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/1 security credential\(s\).*1 redirect\(s\)/);
  });

  it("reports skipped credentials and never throws when a create fails", async () => {
    mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1" });
    mockListSecurityRulesWithSecrets.mockResolvedValue([
      { id: "sr1", name: "admin", path: null, credentials: [{ username: "bob", password: "pw" }] },
    ]);
    mockClient.createSecurity.mockRejectedValueOnce(new Error("dokploy 500"));

    const res = await applyNetworkRulesDokploy({ tenantId: "t1", projectId: "p1" });
    expect(res.success).toBe(true); // non-fatal
    expect(res.message).toMatch(/skipped/i);
  });
});
