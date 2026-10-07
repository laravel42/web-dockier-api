/**
 * Coverage for the branch-heavy, previously-untested parts of `static/index.ts`:
 * `buildAttachmentView` and `getDomainDnsInstructionsStatic`.
 *
 * These exist so the planned carve-out of `verify.ts` / `attachment.ts` from
 * this grab-bag module has a safety net — and so the attachment-view N+1 fix
 * can be made against a pinned behaviour rather than blind. The per-domain
 * certificate lookups are mocked here, so the test asserts OUTCOMES (states,
 * stages, blocker, records) that must survive the switch to a single list read.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── listDomains ───────────────────────────────────────────────────
let domains: Array<{ id: string; name: string }> = [];
vi.mock("../../domains.js", () => ({
  listDomains: async () => domains,
}));

// ─── target resolution (cached, read path) ─────────────────────────
type Target =
  | { kind: "aws-static"; distributionDomain: string }
  | { kind: "gcp-static"; cdnIp: string; appName: string };
let target: Target | null = { kind: "aws-static", distributionDomain: "cdn.example.net" };
let targetError = "Could not resolve the CDN for this static site.";

vi.mock("../target-cache.js", () => ({
  resolveStaticTargetCached: async () => ({
    target,
    errorMessage: target ? undefined : targetError,
  }),
}));

// `getDomainDnsInstructionsStatic` uses the uncached resolver.
vi.mock("../target.js", () => ({
  resolveStaticTarget: async () => ({
    target,
    errorMessage: target ? undefined : targetError,
  }),
}));

// ─── per-domain certificate rows ───────────────────────────────────
type CertRow = {
  verificationState: string;
  status: string;
  verificationMessage: string | null;
  validationRecord: null;
};
/** Keyed by host; absent → read returns null; "FAIL" → read returns a failure. */
let certRows: Record<string, CertRow | "FAIL"> = {};

const SCHEMA_FAILURE = {
  kind: "schema_drift",
  retryable: false,
  message: "migration missing",
  detail: {},
};

vi.mock("../certs.js", () => ({
  // Still used by getDomainDnsInstructionsStatic / previewDomainConfigStatic.
  findStaticCertRow: async (_projectId: string, host: string) => {
    const entry = certRows[host];
    if (entry === "FAIL") return { ok: false, failure: SCHEMA_FAILURE };
    return { ok: true, row: entry ?? null };
  },
  // buildAttachmentView now reads the whole project in one query. A "FAIL" on
  // ANY host stands in for a failed list, since the list is all-or-nothing.
  listStaticCertRows: async () => {
    const entries = Object.entries(certRows);
    if (entries.some(([, v]) => v === "FAIL")) {
      return { ok: false, failure: SCHEMA_FAILURE };
    }
    return {
      ok: true,
      rows: entries.map(([host, row]) => ({ ...(row as object), domainName: host })),
    };
  },
}));

// ─── DNS instruction builders ──────────────────────────────────────
vi.mock("../aws.js", () => ({
  awsDnsInstructions: ({ domainName }: { domainName: string }) => ({
    records: [{ name: domainName, type: "CNAME", value: "cdn.example.net", purpose: "route" }],
    note: "aws note",
  }),
  reconcileAwsStaticDomains: vi.fn(),
}));

vi.mock("../gcp.js", () => ({
  gcpDnsInstructions: ({ domainName }: { domainName: string }) => ({
    records: [{ name: domainName, type: "A", value: "1.2.3.4", purpose: "route" }],
    note: "gcp note",
  }),
  reconcileGcpStaticDomains: vi.fn(),
}));

vi.mock("../routing.js", () => ({
  verifyRoutingRecordAws: vi.fn(),
}));

const { buildAttachmentView, getDomainDnsInstructionsStatic } = await import("../index.js");

const deployment = { deployStrategy: "static" } as never;
const base = { tenantId: "t1", projectId: "proj-1", deployment };

beforeEach(() => {
  domains = [];
  target = { kind: "aws-static", distributionDomain: "cdn.example.net" };
  targetError = "Could not resolve the CDN for this static site.";
  certRows = {};
});

describe("buildAttachmentView — domain counts", () => {
  it("returns an empty, supported view for a project with no domains", async () => {
    const view = await buildAttachmentView(base);

    expect(view.supported).toBe(true);
    expect(view.cloud).toBe("aws");
    expect(view.domains).toEqual([]);
  });

  it("builds an entry for a single domain, keyed to its persisted state", async () => {
    domains = [{ id: "d1", name: "www.example.com" }];
    certRows["www.example.com"] = {
      verificationState: "awaiting_dns",
      status: "pending",
      verificationMessage: "publish the record",
      validationRecord: null,
    };

    const view = await buildAttachmentView(base);

    expect(view.domains).toHaveLength(1);
    expect(view.domains[0]).toMatchObject({
      domainId: "d1",
      domainName: "www.example.com",
      verificationState: "awaiting_dns",
    });
    expect(view.domains[0].stages.length).toBeGreaterThan(0);
    expect(view.domains[0].records).toHaveLength(1);
  });

  it("builds an entry per domain for several domains", async () => {
    domains = [
      { id: "d1", name: "www.example.com" },
      { id: "d2", name: "shop.example.com" },
      { id: "d3", name: "blog.example.com" },
    ];

    const view = await buildAttachmentView(base);

    expect(view.domains.map((d) => d.domainId)).toEqual(["d1", "d2", "d3"]);
    // A domain with no cert row defaults to pending, not failed.
    expect(view.domains.every((d) => d.verificationState === "pending")).toBe(true);
  });
});

describe("buildAttachmentView — cloud selection", () => {
  it("uses the GCP stage model and records for a GCP target", async () => {
    target = { kind: "gcp-static", cdnIp: "1.2.3.4", appName: "app" };
    domains = [{ id: "d1", name: "example.com" }];

    const view = await buildAttachmentView(base);

    expect(view.cloud).toBe("gcp");
    expect(view.domains[0].records[0].type).toBe("A");
    // GCP has no validation-record stage.
    expect(view.domains[0].stages.map((s) => s.id)).not.toContain("publish-validation");
  });
});

describe("buildAttachmentView — unresolved target", () => {
  it("still lists the domains and carries the reason in blocker", async () => {
    // Returning an empty list would show a user with a half-attached domain
    // nothing at all — the failure mode this view exists to replace.
    target = null;
    targetError = "Redeploy the project and try again.";
    domains = [{ id: "d1", name: "www.example.com" }];

    const view = await buildAttachmentView(base);

    expect(view.blocker).toBe("Redeploy the project and try again.");
    expect(view.cloud).toBeUndefined();
    expect(view.domains).toHaveLength(1);
    // No target → no records to publish yet.
    expect(view.domains[0].records).toEqual([]);
  });
});

describe("buildAttachmentView — a failed certificate read", () => {
  it("marks the domain failed and surfaces the failure message, not a bogus pending", async () => {
    domains = [{ id: "d1", name: "www.example.com" }];
    certRows["www.example.com"] = "FAIL";

    const view = await buildAttachmentView(base);

    expect(view.domains[0].verificationState).toBe("failed");
    // The stage model renders the failure's message on the terminal stage.
    const terminal = view.domains[0].stages.find((s) => s.status === "failed");
    expect(terminal?.detail).toBe("migration missing");
  });
});

describe("getDomainDnsInstructionsStatic", () => {
  it("returns an error when the target cannot be resolved", async () => {
    target = null;
    targetError = "no cdn";

    const result = await getDomainDnsInstructionsStatic({
      projectId: "proj-1",
      domainName: "www.example.com",
      deployment,
    });

    expect(result).toEqual({ error: "no cdn" });
  });

  it("returns records straight away for a GCP target, with no cert read", async () => {
    target = { kind: "gcp-static", cdnIp: "1.2.3.4", appName: "app" };

    const result = await getDomainDnsInstructionsStatic({
      projectId: "proj-1",
      domainName: "example.com",
      deployment,
    });

    expect(result).toMatchObject({ domainName: "example.com" });
    if ("records" in result) expect(result.records[0].type).toBe("A");
  });

  it("returns the failure message when the AWS cert read fails", async () => {
    certRows["www.example.com"] = "FAIL";

    const result = await getDomainDnsInstructionsStatic({
      projectId: "proj-1",
      domainName: "www.example.com",
      deployment,
    });

    expect(result).toEqual({ error: "migration missing" });
  });

  it("returns AWS records when the cert row reads cleanly", async () => {
    certRows["www.example.com"] = {
      verificationState: "awaiting_dns",
      status: "pending",
      verificationMessage: null,
      validationRecord: null,
    };

    const result = await getDomainDnsInstructionsStatic({
      projectId: "proj-1",
      domainName: "www.example.com",
      deployment,
    });

    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.records[0].type).toBe("CNAME");
  });
});
