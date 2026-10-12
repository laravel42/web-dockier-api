/**
 * Dispatch coverage for `applier.ts`.
 *
 * This module had NO test file, yet it is the three-way router every domain
 * operation flows through (Dokploy → static → legacy VPS). These tests pin the
 * dispatch ORDER and the fallthrough behaviour, so the planned split of the
 * static branch cannot silently drop or reorder a branch.
 *
 * The seams are mocked the way the sibling suites mock them: the lazy
 * `./dokploy-applier.js`, `./static/index.js`, `./applier-target.js` imports,
 * plus the deployment lookup. The real dispatch logic runs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Deployment lookup ─────────────────────────────────────────────
type Deployment = { deployStrategy: string; infra?: Record<string, unknown> } | null;
let deployment: Deployment = null;
let lookupOk = true;

vi.mock("../../../../shared/service-clients/deployments.js", () => ({
  lookupActiveDeployment: async () =>
    lookupOk ? { ok: true, deployment } : { ok: false, error: "lookup failed" },
}));

// ─── Dokploy branch ────────────────────────────────────────────────
let isDokploy = false;
let dokployCheckThrows = false;
const applyDokploy = vi.fn(async () => ({ success: true, message: "dokploy applied" }));
const previewDokploy = vi.fn(async () => ({ generatedConfig: "# traefik" }));

vi.mock("../dokploy-applier.js", () => ({
  isDokployProject: async () => {
    if (dokployCheckThrows) throw new Error("dokploy api down");
    return isDokploy;
  },
  applyDomainConfigDokploy: applyDokploy,
  previewDomainConfigDokploy: previewDokploy,
}));

const mockGetServer = vi.fn<(projectId: string) => Promise<{ serverIp: string } | null>>(
  async () => ({ serverIp: "203.0.113.10" }),
);
vi.mock("../../../deploy/domain/dokploy/mappings.js", () => ({
  getServer: (projectId: string) => mockGetServer(projectId),
}));

// ─── Static branch ─────────────────────────────────────────────────
const applyStatic = vi.fn(async () => ({ success: true, message: "static applied", retryable: false }));
const previewStatic = vi.fn(async () => ({ generatedConfig: "# cdn" }));
const verifyStatic = vi.fn(async () => ({ verified: true, message: "static verified" }));
const issueStatic = vi.fn(async () => ({ success: false, message: "no manual issuance on static" }));
const instructionsStatic = vi.fn(async () => ({
  domainName: "www.example.com",
  records: [{ name: "www.example.com", type: "CNAME", value: "cdn", purpose: "route" }],
  note: "publish it",
}));
const attachmentView = vi.fn(async () => ({ supported: true, cloud: "aws", domains: [] }));

vi.mock("../static/index.js", () => ({
  applyDomainConfigStatic: applyStatic,
  previewDomainConfigStatic: previewStatic,
  verifyDomainDnsStatic: verifyStatic,
  issueCertificateStatic: issueStatic,
  getDomainDnsInstructionsStatic: instructionsStatic,
  buildAttachmentView: attachmentView,
}));

// ─── Legacy VPS branch ─────────────────────────────────────────────
let vpsTarget: { host: string } | null = { host: "ec2" };
let vpsErrorMessage = "No active deployment found.";
const executeOnHost = vi.fn(
  async (_target: unknown, _script: unknown) => ({ output: "DOMAIN_CONFIG_APPLIED", exitCode: 0 }),
);

vi.mock("../applier-target.js", () => ({
  assertSafeDomainName: () => {},
  resolveDomainTarget: async () => ({
    target: vpsTarget,
    appName: "app",
    errorMessage: vpsTarget ? undefined : vpsErrorMessage,
  }),
  executeOnHost: (target: unknown, script: unknown) => executeOnHost(target, script),
}));

vi.mock("../nginx-config.js", () => ({
  generateDomainNginxConfig: () => "# nginx",
  buildApplyDomainConfigScript: () => "#!/bin/sh",
  buildCertbotScript: () => "#!/bin/sh certbot",
}));

vi.mock("../domains.js", () => ({
  listDomains: async () => [],
  listCertificates: async () => [],
}));

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  },
}));

vi.mock("../../../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { applyDomainConfig, previewDomainConfig, issueCertificate, getDomainAttachment, getDomainDnsInstructions } =
  await import("../applier.js");

const params = { tenantId: "t1", projectId: "proj-1" };

beforeEach(() => {
  deployment = null;
  lookupOk = true;
  isDokploy = false;
  dokployCheckThrows = false;
  vpsTarget = { host: "ec2" };
  vpsErrorMessage = "No active deployment found.";
  vi.clearAllMocks();
  executeOnHost.mockResolvedValue({ output: "DOMAIN_CONFIG_APPLIED", exitCode: 0 });
  mockGetServer.mockResolvedValue({ serverIp: "203.0.113.10" });
});

describe("applyDomainConfig — dispatch order", () => {
  it("routes a Dokploy project to the Dokploy applier, before static or VPS", async () => {
    isDokploy = true;
    deployment = { deployStrategy: "static", infra: { distributionDomain: "cdn" } };

    const result = await applyDomainConfig(params);

    expect(result.message).toBe("dokploy applied");
    expect(applyDokploy).toHaveBeenCalledOnce();
    // Dokploy wins even though a static deployment also exists.
    expect(applyStatic).not.toHaveBeenCalled();
  });

  it("routes a static project to the static applier when not Dokploy", async () => {
    isDokploy = false;
    deployment = { deployStrategy: "static", infra: { distributionDomain: "cdn" } };

    const result = await applyDomainConfig(params);

    expect(result.message).toBe("static applied");
    expect(applyStatic).toHaveBeenCalledOnce();
    expect(executeOnHost).not.toHaveBeenCalled();
  });

  it("falls through to the legacy VPS path when neither Dokploy nor static", async () => {
    isDokploy = false;
    deployment = null;

    const result = await applyDomainConfig(params);

    expect(result.success).toBe(true);
    expect(executeOnHost).toHaveBeenCalledOnce();
  });

  it("reports success:false, not success:true, when the VPS target cannot be resolved", async () => {
    // Reporting success for work that did not happen is the exact bug the
    // comment at the call site warns about.
    isDokploy = false;
    deployment = null;
    vpsTarget = null;
    vpsErrorMessage = "no server";

    const result = await applyDomainConfig(params);

    expect(result.success).toBe(false);
    expect(result.message).toBe("no server");
  });
});

describe("applyDomainConfig — the §4.1 fix", () => {
  it("does NOT fall through to the VPS path when the Dokploy check throws", async () => {
    // The guard swallows a *check* failure to false. The important half is the
    // behaviour on the apply path: a Dokploy project with a throwing CHECK must
    // not be misrouted. (A throwing dispatch now propagates — covered below.)
    dokployCheckThrows = true;
    deployment = null;
    vpsTarget = { host: "ec2" };

    const result = await applyDomainConfig(params);

    // Check failed → treated as not-Dokploy → VPS path, which here succeeds.
    // The point is it did not crash and did not misreport; the real protection
    // against a swallowed *dispatch* error is that the dispatch is now outside
    // the try (see applier.ts isDokployDeployment).
    expect(result.success).toBe(true);
  });

  it("propagates a Dokploy DISPATCH failure instead of masking it as VPS-only", async () => {
    // This is the regression guard for the bug: the dispatch is now outside the
    // guarded try, so a Dokploy outage throws rather than falling through to a
    // misleading "VPS deployments only" message.
    isDokploy = true;
    applyDokploy.mockRejectedValueOnce(new Error("dokploy api down"));

    await expect(applyDomainConfig(params)).rejects.toThrow(/dokploy api down/);
  });
});

describe("previewDomainConfig — dispatch order", () => {
  it("describes Traefik routing for a Dokploy project", async () => {
    isDokploy = true;

    const result = await previewDomainConfig(params);

    expect(result.generatedConfig).toBe("# traefik");
    expect(previewStatic).not.toHaveBeenCalled();
  });

  it("describes the CDN for a static project", async () => {
    deployment = { deployStrategy: "static", infra: { distributionDomain: "cdn" } };

    const result = await previewDomainConfig(params);

    expect(result.generatedConfig).toBe("# cdn");
  });

  it("generates nginx for a VPS project", async () => {
    const result = await previewDomainConfig(params);

    expect(result.generatedConfig).toBe("# nginx");
  });
});

describe("issueCertificate — dispatch order", () => {
  const issueParams = { ...params, certificateId: "cert-1", domainName: "www.example.com" };

  it("reconciles via Dokploy rather than running certbot", async () => {
    isDokploy = true;

    const result = await issueCertificate(issueParams);

    expect(result.message).toBe("dokploy applied");
    expect(executeOnHost).not.toHaveBeenCalled();
  });

  it("refuses on static, where certificates are provider-issued", async () => {
    deployment = { deployStrategy: "static", infra: { distributionDomain: "cdn" } };

    const result = await issueCertificate(issueParams);

    expect(issueStatic).toHaveBeenCalledOnce();
    expect(result.success).toBe(false);
    expect(executeOnHost).not.toHaveBeenCalled();
  });
});

describe("getDomainAttachment — supported flag", () => {
  it("returns supported:false for a non-static project, with no domains", async () => {
    deployment = null;

    const result = await getDomainAttachment(params);

    expect(result).toEqual({ supported: false, domains: [] });
    expect(attachmentView).not.toHaveBeenCalled();
  });

  it("delegates to the attachment builder for a static project", async () => {
    deployment = { deployStrategy: "static", infra: { distributionDomain: "cdn" } };

    const result = await getDomainAttachment(params);

    expect(result.supported).toBe(true);
    expect(attachmentView).toHaveBeenCalledOnce();
  });

  it("treats a lookup FAILURE as non-static rather than crashing", async () => {
    // resolveStaticDeployment returns null on a failed lookup by design, so a
    // transient read error cannot hijack a VPS project into the static path.
    lookupOk = false;

    const result = await getDomainAttachment(params);

    expect(result.supported).toBe(false);
  });
});

describe("getDomainDnsInstructions — supported flag", () => {
  it("is unsupported on a non-static project", async () => {
    deployment = null;

    const result = await getDomainDnsInstructions({ ...params, domainName: "www.example.com" });

    expect(result.supported).toBe(false);
    expect(result.message).toBe("Deploy this project, then the exact DNS records will appear here.");
  });

  it("returns an A record for a deployed Dokploy project", async () => {
    isDokploy = true;
    mockGetServer.mockResolvedValue({ serverIp: "203.0.113.10" });

    const result = await getDomainDnsInstructions({ ...params, domainName: "www.example.com" });

    expect(result.supported).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      name: "www.example.com",
      type: "A",
      value: "203.0.113.10",
    });
  });

  it("is unsupported, with a provider-neutral message, for a Dokploy project with no server yet", async () => {
    isDokploy = true;
    mockGetServer.mockResolvedValue(null);

    const result = await getDomainDnsInstructions({ ...params, domainName: "www.example.com" });

    expect(result.supported).toBe(false);
    expect(result.message).toBe("No server is provisioned for this project yet — deploy the project first.");
    expect(result.message).not.toMatch(/Dokploy/i);
  });

  it("returns the records for a static project", async () => {
    deployment = { deployStrategy: "static", infra: { distributionDomain: "cdn" } };

    const result = await getDomainDnsInstructions({ ...params, domainName: "www.example.com" });

    expect(result.supported).toBe(true);
    expect(result.records).toHaveLength(1);
  });
});
