/**
 * GCP static-hosting domain reconcile — Unit Tests
 *
 * The Compute REST layer is mocked at the `gcp-static-lb.js` seam, so no GCP
 * call is made. The behaviours that matter and are easy to get wrong:
 *  - ONE managed certificate per domain SET, named from a hash of that set,
 *    because Google-managed certificates are immutable in their domain list.
 *  - the HTTPS front end reuses the EXISTING url map and global IP, so the A
 *    record a user already published stays valid.
 *  - the certificate is swapped on the proxy BEFORE the old one is deleted.
 *  - FAILED_NOT_VISIBLE is reported as "publish your A record", not as an error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Compute REST mock ─────────────────────────────────────────────
const calls: string[] = [];
let certState: { status: string; domainStatus: Record<string, string> } = {
  status: "PROVISIONING",
  domainStatus: {},
};
let existingProxyCerts: string[] = [];
let listedCertNames: string[] = [];

const ensureManagedCertificate = vi.fn(async (_c: unknown, name: string, domains: string[]) => {
  calls.push(`ensureCert:${name}`);
  return {
    name,
    selfLink: `https://selfLink/sslCertificates/${name}`,
    status: certState.status,
    domainStatus: certState.domainStatus,
    domains,
  };
});

const ensureHttpsProxy = vi.fn(async (_c: unknown, p: { name: string; urlMapSelfLink: string }) => {
  calls.push(`ensureProxy:${p.name}:${p.urlMapSelfLink}`);
  return {
    name: p.name,
    selfLink: `https://selfLink/targetHttpsProxies/${p.name}`,
    sslCertificates: existingProxyCerts,
    urlMap: p.urlMapSelfLink,
  };
});

const setProxySslCertificates = vi.fn(async (_c: unknown, proxy: string, certs: string[]) => {
  calls.push(`setCerts:${proxy}:${certs.join(",")}`);
});

const ensureHttpsForwardingRule = vi.fn(
  async (_c: unknown, p: { name: string; ipAddress: string; proxySelfLink: string }) => {
    calls.push(`ensureRule:${p.name}:${p.ipAddress}`);
    return { name: p.name, target: p.proxySelfLink, ipAddress: p.ipAddress, portRange: "443" };
  },
);

const deleteManagedCertificate = vi.fn(async (_c: unknown, name: string) => {
  calls.push(`deleteCert:${name}`);
});

const listGlobalResourceNames = vi.fn(async () => listedCertNames);
const teardownGcpStaticHttps = vi.fn(async () => {
  calls.push("teardownHttps");
  return { errors: [] as string[] };
});
const getHttpsProxy = vi.fn(async () => null);

vi.mock("../../../../deploy/domain/infra/gcp-static-lb.js", () => ({
  ensureManagedCertificate: (...a: unknown[]) => ensureManagedCertificate(...(a as [unknown, string, string[]])),
  ensureHttpsProxy: (...a: unknown[]) => ensureHttpsProxy(...(a as [unknown, { name: string; urlMapSelfLink: string }])),
  setProxySslCertificates: (...a: unknown[]) => setProxySslCertificates(...(a as [unknown, string, string[]])),
  ensureHttpsForwardingRule: (...a: unknown[]) =>
    ensureHttpsForwardingRule(...(a as [unknown, { name: string; ipAddress: string; proxySelfLink: string }])),
  deleteManagedCertificate: (...a: unknown[]) => deleteManagedCertificate(...(a as [unknown, string])),
  listGlobalResourceNames: () => listGlobalResourceNames(),
  teardownGcpStaticHttps: () => teardownGcpStaticHttps(),
  getHttpsProxy: () => getHttpsProxy(),
}));

// ─── Certificate row store ─────────────────────────────────────────
interface Row {
  id: string;
  domainName: string;
  type: "gcp_managed";
  status: string;
  providerRef: string | null;
  validationRecord: null;
  verificationState: string;
  verificationMessage: string | null;
  attachStartedAt: string | null;
}

let rows: Row[] = [];
const stateWrites: Array<{ id: string; update: Record<string, unknown> }> = [];
const deletedRowNames: string[] = [];

vi.mock("../certs.js", () => ({
  STATIC_CERT_TYPES: ["acm", "gcp_managed"],
  listStaticCertRows: async () => rows,
  findStaticCertRow: async (_p: string, d: string) => rows.find((r) => r.domainName === d) ?? null,
  ensureStaticCertRow: async (p: { domainName: string }) => {
    const found = rows.find((r) => r.domainName === p.domainName);
    if (found) return found;
    const row: Row = {
      id: `cert-${rows.length + 1}`,
      domainName: p.domainName,
      type: "gcp_managed",
      status: "pending",
      providerRef: null,
      validationRecord: null,
      verificationState: "pending",
      verificationMessage: null,
      attachStartedAt: null,
    };
    rows.push(row);
    return row;
  },
  setCertState: async (id: string, update: Record<string, unknown>) => {
    stateWrites.push({ id, update });
    return true;
  },
  deleteStaticCertRows: async (_p: string, names: string[]) => {
    deletedRowNames.push(...names);
    rows = rows.filter((r) => !names.includes(r.domainName));
  },
}));

const { reconcileGcpStaticDomains, certificateNameFor, gcpDnsInstructions } = await import("../gcp.js");

const TARGET = {
  kind: "gcp-static" as const,
  projectId: "proj-1",
  gcpProjectId: "gcp-proj",
  client: {} as never,
  cdnIp: "34.1.2.3",
  appName: "mysite",
  urlMapSelfLink: "https://selfLink/urlMaps/mysite-url-map-abc",
  bucketName: "mysite-site-123",
};

function stateWriteFor(domain: string): Record<string, unknown> | undefined {
  const row = rows.find((r) => r.domainName === domain);
  if (!row) return undefined;
  const writes = stateWrites.filter((w) => w.id === row.id);
  return writes[writes.length - 1]?.update;
}

beforeEach(() => {
  rows = [];
  stateWrites.length = 0;
  deletedRowNames.length = 0;
  calls.length = 0;
  certState = { status: "PROVISIONING", domainStatus: {} };
  existingProxyCerts = [];
  listedCertNames = [];
  vi.clearAllMocks();
  listGlobalResourceNames.mockImplementation(async () => listedCertNames);
});

describe("certificateNameFor", () => {
  it("is stable for the same domain set regardless of order", () => {
    const a = certificateNameFor("mysite", ["b.example.com", "a.example.com"]);
    const b = certificateNameFor("mysite", ["a.example.com", "b.example.com"]);
    expect(a).toBe(b);
  });

  it("changes when the domain set changes, since managed certs are immutable", () => {
    const one = certificateNameFor("mysite", ["a.example.com"]);
    const two = certificateNameFor("mysite", ["a.example.com", "b.example.com"]);
    expect(one).not.toBe(two);
  });

  it("produces a GCP-legal name: lowercase, starts with a letter, <= 63 chars", () => {
    const name = certificateNameFor("a-very-long-application-name-that-goes-on-and-on-forever", [
      "a.example.com",
    ]);
    expect(name.length).toBeLessThanOrEqual(63);
    expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe("reconcileGcpStaticDomains — provisioning", () => {
  it("creates ONE certificate covering every domain", async () => {
    await reconcileGcpStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [
        { id: "d1", name: "a.example.com" },
        { id: "d2", name: "b.example.com" },
      ],
    });

    expect(ensureManagedCertificate).toHaveBeenCalledTimes(1);
    const [, , domains] = ensureManagedCertificate.mock.calls[0] as [unknown, string, string[]];
    expect(domains).toEqual(["a.example.com", "b.example.com"]);
  });

  it("reuses the existing url map and global IP rather than creating new ones", async () => {
    await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(calls.some((c) => c.includes(`ensureProxy:mysite-https-proxy:${TARGET.urlMapSelfLink}`))).toBe(true);
    expect(calls.some((c) => c === `ensureRule:mysite-fwd-https:${TARGET.cdnIp}`)).toBe(true);
  });

  it("tells the user to publish an A record at the load balancer IP", async () => {
    const res = await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(true);
    expect(res.message).toContain("34.1.2.3");
  });

  it("stores no validation record — Google validates against the A record itself", async () => {
    await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(stateWriteFor("a.example.com")?.validationRecord).toBeNull();
  });
});

describe("reconcileGcpStaticDomains — certificate states", () => {
  it("marks a domain live when its certificate is ACTIVE", async () => {
    certState = { status: "ACTIVE", domainStatus: { "a.example.com": "ACTIVE" } };

    const res = await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.anyLive).toBe(true);
    const update = stateWriteFor("a.example.com");
    expect(update?.verificationState).toBe("live");
    expect(update?.status).toBe("active");
  });

  it("treats FAILED_NOT_VISIBLE as 'publish your A record', not a failure", async () => {
    certState = {
      status: "PROVISIONING",
      domainStatus: { "a.example.com": "FAILED_NOT_VISIBLE" },
    };

    const res = await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    // Not an error: the user's DNS is the missing piece.
    expect(res.success).toBe(true);
    const update = stateWriteFor("a.example.com");
    expect(update?.verificationState).toBe("awaiting_dns");
    expect(String(update?.verificationMessage)).toContain("34.1.2.3");
  });

  it("reports a genuine provisioning failure as failed and non-retryable", async () => {
    certState = {
      status: "PROVISIONING",
      domainStatus: { "a.example.com": "FAILED_CAA_FORBIDDEN" },
    };

    const res = await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
    const update = stateWriteFor("a.example.com");
    expect(update?.verificationState).toBe("failed");
    expect(String(update?.verificationMessage)).toContain("CAA");
  });

  it("reports mixed states per domain", async () => {
    certState = {
      status: "PROVISIONING",
      domainStatus: { "a.example.com": "ACTIVE", "b.example.com": "FAILED_NOT_VISIBLE" },
    };

    await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [
        { id: "d1", name: "a.example.com" },
        { id: "d2", name: "b.example.com" },
      ],
    });

    expect(stateWriteFor("a.example.com")?.verificationState).toBe("live");
    expect(stateWriteFor("b.example.com")?.verificationState).toBe("awaiting_dns");
  });
});

describe("reconcileGcpStaticDomains — changing the domain set", () => {
  it("swaps the certificate on the proxy before deleting the superseded one", async () => {
    // The proxy currently serves an older certificate.
    existingProxyCerts = ["https://selfLink/sslCertificates/mysite-cert-old"];
    listedCertNames = ["mysite-cert-old"];

    await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    const swapIndex = calls.findIndex((c) => c.startsWith("setCerts:"));
    const deleteIndex = calls.findIndex((c) => c === "deleteCert:mysite-cert-old");

    expect(swapIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    // GCP refuses to delete a certificate a proxy still references.
    expect(swapIndex).toBeLessThan(deleteIndex);
  });

  it("does not swap when the proxy already serves the right certificate", async () => {
    const certName = certificateNameFor("mysite", ["a.example.com"]);
    existingProxyCerts = [`https://selfLink/sslCertificates/${certName}`];

    await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(setProxySslCertificates).not.toHaveBeenCalled();
  });

  it("removes certificate rows for domains no longer configured", async () => {
    rows = [
      {
        id: "cert-1", domainName: "gone.example.com", type: "gcp_managed", status: "active",
        providerRef: "x", validationRecord: null, verificationState: "live",
        verificationMessage: null, attachStartedAt: null,
      },
    ];

    await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d2", name: "kept.example.com" }],
    });

    expect(deletedRowNames).toContain("gone.example.com");
  });

  it("tears the HTTPS front end down when the last domain is removed", async () => {
    rows = [
      {
        id: "cert-1", domainName: "gone.example.com", type: "gcp_managed", status: "active",
        providerRef: "x", validationRecord: null, verificationState: "live",
        verificationMessage: null, attachStartedAt: null,
      },
    ];

    const res = await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET, domains: [],
    });

    expect(calls).toContain("teardownHttps");
    expect(res.success).toBe(true);
    expect(ensureManagedCertificate).not.toHaveBeenCalled();
  });
});

describe("reconcileGcpStaticDomains — limits and failures", () => {
  it("refuses more domains than a managed certificate can hold", async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ id: `d${i}`, name: `h${i}.example.com` }));

    const res = await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET, domains: many,
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
    expect(res.message).toMatch(/at most 100 domains/i);
    // The count is named so the user knows how far over they are.
    expect(res.message).toContain("101");
  });

  it("never throws when the Compute API fails", async () => {
    ensureManagedCertificate.mockRejectedValueOnce(new Error("compute unavailable"));

    const res = await reconcileGcpStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);
    expect(res.message).toContain("compute unavailable");
  });
});

describe("gcpDnsInstructions", () => {
  it("returns a single A record — valid at an apex as well as a subdomain", () => {
    const { records, note } = gcpDnsInstructions({ target: TARGET, domainName: "example.com" });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: "example.com", type: "A", value: "34.1.2.3" });
    expect(note).toMatch(/domain root/i);
  });

  it("explains that the certificate depends on this record being live", () => {
    const { records, note } = gcpDnsInstructions({ target: TARGET, domainName: "www.example.com" });

    expect(records[0].purpose).toMatch(/validat/i);
    expect(note).toMatch(/15-60 minutes/);
  });
});
