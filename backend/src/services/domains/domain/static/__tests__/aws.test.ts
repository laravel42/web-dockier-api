/**
 * AWS static-hosting domain reconcile — Unit Tests
 *
 * The ACM and CloudFormation clients are mocked at the `lib/aws-sdk.js` seam,
 * the same place the production code resolves them, so no AWS call is made.
 *
 * The behaviours that matter here and are easy to get wrong:
 *  - ONE multi-SAN certificate for every domain, because a CloudFront
 *    distribution has exactly one ViewerCertificate.
 *  - the certificate is requested in us-east-1 regardless of the stack region.
 *  - apex domains are refused with an actionable message instead of attached.
 *  - nothing blocks on the 5-20 minute distribution update.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── ACM mock ──────────────────────────────────────────────────────
const acmSend = vi.fn();
const acmCtorArgs: Array<{ region?: string }> = [];

class FakeAcmClient {
  constructor(cfg: { region?: string }) {
    acmCtorArgs.push(cfg);
  }
  send = acmSend;
}

const cmd = (name: string) =>
  class {
    readonly __type = name;
    constructor(public input: Record<string, unknown>) {}
  };

vi.mock("../../../../../lib/aws-sdk.js", () => ({
  getAcm: async () => ({
    ACMClient: FakeAcmClient,
    RequestCertificateCommand: cmd("RequestCertificate"),
    DescribeCertificateCommand: cmd("DescribeCertificate"),
    ListCertificatesCommand: cmd("ListCertificates"),
    ListTagsForCertificateCommand: cmd("ListTagsForCertificate"),
    DeleteCertificateCommand: cmd("DeleteCertificate"),
  }),
  getCfn: async () => ({
    CloudFormationClient: FakeCfnClient,
    UpdateStackCommand: cmd("UpdateStack"),
    DescribeStacksCommand: cmd("DescribeStacks"),
  }),
}));

// ─── CloudFormation mock ───────────────────────────────────────────
const cfnSend = vi.fn();
class FakeCfnClient {
  constructor(public cfg: { region?: string }) {}
  send = cfnSend;
}

// ─── Certificate row store ─────────────────────────────────────────
interface Row {
  id: string;
  domainName: string;
  type: "acm";
  status: string;
  providerRef: string | null;
  validationRecord: { name: string; type: string; value: string } | null;
  verificationState: string;
  verificationMessage: string | null;
  attachStartedAt: string | null;
  createdAt?: string | null;
  issuedAt?: string | null;
  updatedAt?: string | null;
}

let rows: Row[] = [];
const stateWrites: Array<{
  id: string;
  update: Record<string, unknown>;
  currentState?: string;
}> = [];
const deletedRowNames: string[] = [];

// Apex acknowledgements live in `projects.settings`; the reconcile reads them
// as a backstop. Empty by default so the apex-refusal cases still refuse.
let apexAcks: string[] = [];

vi.mock("../../apex-ack.js", () => ({
  listApexAcks: async () => apexAcks,
}));

// Routing verification is pure node:dns. Mocked so the suite makes no real DNS
// query, and so each transition can be driven deliberately.
let routingOutcome: "verified" | "inconclusive" | "missing" | "mismatched" = "verified";
let validationRecordVisible = false;

vi.mock("../routing.js", () => ({
  verifyRoutingRecordAws: async (host: string, expected: string) => ({
    outcome: routingOutcome,
    serverIp: expected,
    resolved: routingOutcome === "verified" ? expected : "other.example.net",
    message: `routing:${routingOutcome}:${host}`,
  }),
  isValidationRecordVisible: async () => validationRecordVisible,
  missingRoutingRecordMessage: (host: string, expected: string) =>
    `add a record for ${host} at ${expected}`,
}));

vi.mock("../certs.js", () => ({
  STATIC_CERT_TYPES: ["acm", "gcp_managed"],
  listStaticCertRows: async () => ({ ok: true, rows }),
  findStaticCertRow: async (_p: string, domainName: string) => ({
    ok: true,
    row: rows.find((r) => r.domainName === domainName) ?? null,
  }),
  ensureStaticCertRow: async (p: { domainName: string }) => {
    const found = rows.find((r) => r.domainName === p.domainName);
    if (found) return { ok: true, row: found };
    const row: Row = {
      id: `cert-${rows.length + 1}`,
      domainName: p.domainName,
      type: "acm",
      status: "pending",
      providerRef: null,
      validationRecord: null,
      verificationState: "pending",
      verificationMessage: null,
      attachStartedAt: null,
    };
    rows.push(row);
    return { ok: true, row };
  },
  setCertState: async (id: string, update: Record<string, unknown>, currentState?: string) => {
    stateWrites.push({ id, update, currentState });
    const row = rows.find((r) => r.id === id);
    if (row) {
      if (typeof update.providerRef === "string") row.providerRef = update.providerRef;
      if (typeof update.verificationState === "string") row.verificationState = update.verificationState;
      if (typeof update.status === "string") row.status = update.status;
    }
    return true;
  },
  deleteStaticCertRows: async (_p: string, names: string[]) => {
    deletedRowNames.push(...names);
    rows = rows.filter((r) => !names.includes(r.domainName));
  },
}));

const { reconcileAwsStaticDomains, awsDnsInstructions, isPastCertDeadline } = await import("../aws.js");

const TARGET = {
  kind: "aws-static" as const,
  projectId: "proj-1",
  region: "eu-west-1", // deliberately NOT us-east-1
  credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
  accountId: "111122223333",
  stackName: "dockier-site",
  distributionId: "E1234",
  distributionDomain: "d111.cloudfront.net",
  websiteBucket: "bucket-1",
};

/** Build a DescribeCertificate response. */
function describeResponse(opts: {
  status: string;
  domainName: string;
  sans?: string[];
  withRecords?: boolean;
}) {
  const names = [opts.domainName, ...(opts.sans ?? [])];
  return {
    Certificate: {
      DomainName: opts.domainName,
      SubjectAlternativeNames: opts.sans ?? [],
      Status: opts.status,
      DomainValidationOptions:
        opts.withRecords === false
          ? []
          : names.map((n) => ({
              DomainName: n,
              ResourceRecord: { Name: `_val.${n}.`, Type: "CNAME", Value: `_tok.acm-validations.aws.` },
            })),
    },
  };
}

beforeEach(() => {
  rows = [];
  stateWrites.length = 0;
  deletedRowNames.length = 0;
  apexAcks = [];
  routingOutcome = "verified";
  validationRecordVisible = false;
  acmSend.mockReset();
  cfnSend.mockReset();
  acmCtorArgs.length = 0;
  cfnSend.mockResolvedValue({});
});

describe("reconcileAwsStaticDomains — requesting a certificate", () => {
  it("requests ONE certificate covering every domain as SANs", async () => {
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/1" };
      if (c.__type === "DescribeCertificate") {
        return describeResponse({ status: "PENDING_VALIDATION", domainName: "a.example.com", sans: ["b.example.com"] });
      }
      return {};
    });

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [
        { id: "d1", name: "a.example.com" },
        { id: "d2", name: "b.example.com" },
      ],
    });

    const requests = acmSend.mock.calls.filter((c) => (c[0] as { __type: string }).__type === "RequestCertificate");
    expect(requests).toHaveLength(1);

    const input = (requests[0][0] as { input: Record<string, unknown> }).input;
    // Sorted canonical order: a then b.
    expect(input.DomainName).toBe("a.example.com");
    expect(input.SubjectAlternativeNames).toEqual(["b.example.com"]);
    expect(input.ValidationMethod).toBe("DNS");

    expect(res.success).toBe(true);
    expect(res.message).toMatch(/Publish the DNS validation record/i);
  });

  it("requests the certificate in us-east-1 even though the stack is elsewhere", async () => {
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/1" };
      return describeResponse({ status: "PENDING_VALIDATION", domainName: "a.example.com" });
    });

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(acmCtorArgs.length).toBeGreaterThan(0);
    for (const cfg of acmCtorArgs) {
      expect(cfg.region).toBe("us-east-1");
    }
  });

  it("tags the certificate with the project so it can be adopted later", async () => {
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/1" };
      return describeResponse({ status: "PENDING_VALIDATION", domainName: "a.example.com" });
    });

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    const req = acmSend.mock.calls.find((c) => (c[0] as { __type: string }).__type === "RequestCertificate");
    const tags = ((req![0] as { input: { Tags: Array<{ Key: string; Value: string }> } }).input.Tags);
    expect(tags).toEqual(expect.arrayContaining([{ Key: "dockier:projectId", Value: "proj-1" }]));
  });

  it("persists each domain's own validation record, matched by domain not index", async () => {
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/1" };
      return describeResponse({ status: "PENDING_VALIDATION", domainName: "a.example.com", sans: ["b.example.com"] });
    });

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [
        { id: "d1", name: "a.example.com" },
        { id: "d2", name: "b.example.com" },
      ],
    });

    const recordWrites = stateWrites.filter((w) => w.update.validationRecord);
    expect(recordWrites).toHaveLength(2);

    const byName = new Map(
      recordWrites.map((w) => {
        const vr = w.update.validationRecord as { name: string };
        return [rows.find((r) => r.id === w.id)!.domainName, vr.name];
      }),
    );
    expect(byName.get("a.example.com")).toBe("_val.a.example.com.");
    expect(byName.get("b.example.com")).toBe("_val.b.example.com.");
  });

  it("does not touch the distribution while the certificate is unissued", async () => {
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/1" };
      return describeResponse({ status: "PENDING_VALIDATION", domainName: "a.example.com" });
    });

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    // Attaching an alias without a covering certificate is rejected by
    // CloudFront, so no UpdateStack may be issued yet.
    expect(cfnSend).not.toHaveBeenCalled();
  });
});

describe("reconcileAwsStaticDomains — attaching an issued certificate", () => {
  beforeEach(() => {
    rows = [
      {
        id: "cert-1",
        domainName: "a.example.com",
        type: "acm",
        status: "pending",
        providerRef: "arn:acm:cert/1",
        validationRecord: null,
        verificationState: "awaiting_dns",
        verificationMessage: null,
        attachStartedAt: null,
      },
    ];
    acmSend.mockImplementation(async () =>
      describeResponse({ status: "ISSUED", domainName: "a.example.com" }),
    );
  });

  it("updates the stack with the alias and the certificate ARN", async () => {
    const res = await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    const update = cfnSend.mock.calls.find((c) => (c[0] as { __type: string }).__type === "UpdateStack");
    expect(update).toBeDefined();

    const input = (update![0] as { input: Record<string, unknown> }).input;
    expect(input.UsePreviousTemplate).toBe(true);

    const params = input.Parameters as Array<{ ParameterKey: string; ParameterValue?: string; UsePreviousValue?: boolean }>;
    const byKey = new Map(params.map((p) => [p.ParameterKey, p]));
    expect(byKey.get("DomainAliases")?.ParameterValue).toBe("a.example.com");
    expect(byKey.get("CertificateArn")?.ParameterValue).toBe("arn:acm:cert/1");
    // Unrelated parameters must be preserved, not reset to defaults.
    expect(byKey.get("SourceBucket")?.UsePreviousValue).toBe(true);
    expect(byKey.get("ErrorPagePath")?.UsePreviousValue).toBe(true);

    expect(res.success).toBe(true);
  });

  it("moves to `provisioning` once the validation record is visible", async () => {
    // ACM's ValidationStatus stays PENDING_VALIDATION whether or not the user
    // has published the record, so resolving the record's own name is the only
    // signal that distinguishes "waiting on you" from "waiting on AWS".
    validationRecordVisible = true;
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/1" };
      return describeResponse({ status: "PENDING_VALIDATION", domainName: "a.example.com" });
    });

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    const write = stateWrites.find((w) => w.update.verificationState === "provisioning");
    expect(write).toBeDefined();
    expect(String(write!.update.verificationMessage)).toMatch(/visible/i);
  });

  it("stays on `awaiting_dns` while the validation record is not visible", async () => {
    validationRecordVisible = false;
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/1" };
      return describeResponse({ status: "PENDING_VALIDATION", domainName: "a.example.com" });
    });

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(stateWrites.some((w) => w.update.verificationState === "provisioning")).toBe(false);
    expect(stateWrites.some((w) => w.update.verificationState === "awaiting_dns")).toBe(true);
  });

  it("reports the update as in progress rather than waiting for it", async () => {
    const res = await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(true);
    expect(res.anyLive).toBeFalsy();
    expect(res.message).toMatch(/in progress|5-20 minutes/i);
    expect(stateWrites.some((w) => w.update.verificationState === "attaching")).toBe(true);
  });

  it("never sends an unconditional phase clock, and always says what the row holds", async () => {
    // The old code wrote `attachStartedAt: attach.inProgress ? nowIso() :
    // undefined` on every `attaching` write. Under a repeating sweep a clock
    // re-stamped on every look never ages, so the 90-minute attach deadline
    // and both upper backoff tiers become unreachable. The decision now
    // belongs to setCertState's phase-clock invariant, which needs to be told
    // the row's persisted state.
    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(stateWrites.length).toBeGreaterThan(0);
    for (const write of stateWrites) {
      expect(write.update.attachStartedAt).toBeUndefined();
      expect(write.currentState).toBeTypeOf("string");
    }
  });

  it("stamps issued_at once and never re-stamps it", async () => {
    // The post-attach 72-hour routing deadline reads `issued_at`, so a
    // re-stamp makes it as unreachable as a re-stamped phase clock.
    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });
    const firstStamps = stateWrites.filter((w) => w.update.issuedAt !== undefined);
    expect(firstStamps.length).toBeGreaterThan(0);

    // The row now carries an issuedAt; a second reconcile must not touch it.
    for (const row of rows) row.issuedAt = "2026-10-01T00:00:00.000Z";
    stateWrites.length = 0;

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(stateWrites.filter((w) => w.update.issuedAt !== undefined)).toHaveLength(0);
  });

  it("keeps a transient stack conflict out of `failed`", async () => {
    // A CloudFormation update already running is a 30-second wait, not a dead
    // end. Writing `failed` here would strand the attachment and, once the
    // poller lands, re-stamp a phase clock whose state never actually changed.
    cfnSend.mockRejectedValue(
      new Error("Stack:arn is in UPDATE_IN_PROGRESS state and can not be updated"),
    );

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);
    expect(stateWrites.some((w) => w.update.verificationState === "failed")).toBe(false);
    // The message is still recorded, so the row explains itself. The LAST
    // write is the failure one — earlier writes in this reconcile persist the
    // "attaching" narration before the stack update is attempted.
    const messageWrites = stateWrites.filter((w) => w.update.verificationMessage !== undefined);
    const lastMessage = messageWrites[messageWrites.length - 1];
    expect(String(lastMessage?.update.verificationMessage)).toMatch(/already being updated/i);
  });

  it("treats 'No updates are to be performed' as already live", async () => {
    cfnSend.mockRejectedValue(new Error("No updates are to be performed."));

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(true);
    expect(res.anyLive).toBe(true);
    expect(stateWrites.some((w) => w.update.verificationState === "live")).toBe(true);
  });

  it("withholds `live` when the routing record does not point here", async () => {
    // `live` must mean SERVING. A certificate attached with no CNAME serves
    // nothing, and a green "live" there is exactly the kind of silently-wrong
    // status this work exists to remove.
    cfnSend.mockRejectedValue(new Error("No updates are to be performed."));
    routingOutcome = "missing";

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(stateWrites.some((w) => w.update.verificationState === "live")).toBe(false);
    // Post-attach awaiting_dns: `status` is already active, which is what
    // distinguishes this from the pre-issuance wait.
    expect(stateWrites.some((w) => w.update.verificationState === "awaiting_dns")).toBe(true);
  });

  it("treats an INCONCLUSIVE check on an apex as live — the D1 guard", async () => {
    // verifyFlattenedAlias returns null on a miss by design, because
    // CloudFront's edge IPs rotate. For a flattened apex "no overlap" means
    // UNKNOWN, and calling it awaiting_dns would strand the one configuration
    // the apex acknowledgement enables, then time it out 72 hours later.
    apexAcks = ["example.com"];
    cfnSend.mockRejectedValue(new Error("No updates are to be performed."));
    routingOutcome = "inconclusive";
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/apex" };
      return describeResponse({ status: "ISSUED", domainName: "example.com" });
    });

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "example.com" }],
    });

    const live = stateWrites.find((w) => w.update.verificationState === "live");
    expect(live).toBeDefined();
    // Carries the caveat rather than a cleared message.
    expect(String(live!.update.verificationMessage)).toContain("inconclusive");
  });

  it("treats an inconclusive check on a SUBDOMAIN as not live", async () => {
    // The apex rule must not leak to names where a CNAME is perfectly legal.
    cfnSend.mockRejectedValue(new Error("No updates are to be performed."));
    routingOutcome = "inconclusive";

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(stateWrites.some((w) => w.update.verificationState === "live")).toBe(false);
  });

  it("reuses the existing certificate when the domain set is unchanged", async () => {
    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    const requests = acmSend.mock.calls.filter((c) => (c[0] as { __type: string }).__type === "RequestCertificate");
    expect(requests).toHaveLength(0);
  });

  it("requests a new certificate when a domain is added, since ACM names are immutable", async () => {
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "DescribeCertificate") {
        // The stored cert still covers only the original domain.
        return describeResponse({ status: "ISSUED", domainName: "a.example.com" });
      }
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/2" };
      return {};
    });

    await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [
        { id: "d1", name: "a.example.com" },
        { id: "d2", name: "b.example.com" },
      ],
    });

    const requests = acmSend.mock.calls.filter((c) => (c[0] as { __type: string }).__type === "RequestCertificate");
    expect(requests).toHaveLength(1);
    const input = (requests[0][0] as { input: Record<string, unknown> }).input;
    expect(input.SubjectAlternativeNames).toEqual(["b.example.com"]);
  });
});

describe("reconcileAwsStaticDomains — apex domains", () => {
  it("refuses an apex domain with an actionable message and does not attach it", async () => {
    const res = await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "example.com" }],
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain("www.example.com");

    const failure = stateWrites.find((w) => w.update.verificationState === "failed");
    expect(failure).toBeDefined();
    expect(String(failure!.update.verificationMessage)).toContain("CNAME");

    // No certificate requested, no distribution change for an impossible domain.
    const requests = acmSend.mock.calls.filter((c) => (c[0] as { __type: string }).__type === "RequestCertificate");
    expect(requests).toHaveLength(0);
  });

  it("attaches an apex the user has acknowledged as flattening-capable", async () => {
    // D1: refuse by default, but honour an explicit confirmation. Route 53
    // Alias and Cloudflare flattening both reach a CloudFront alias, so a
    // blanket refusal would be wrong for those users.
    apexAcks = ["example.com"];
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/apex" };
      return describeResponse({ status: "PENDING_VALIDATION", domainName: "example.com" });
    });

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [{ id: "d1", name: "example.com" }],
    });

    expect(res.success).toBe(true);
    // Refused, it would have written `failed` and requested nothing.
    expect(stateWrites.some((w) => w.update.verificationState === "failed")).toBe(false);
    const requests = acmSend.mock.calls.filter(
      (c) => (c[0] as { __type: string }).__type === "RequestCertificate",
    );
    expect(requests).toHaveLength(1);
  });

  it("still serves the usable domains alongside a rejected apex", async () => {
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") return { CertificateArn: "arn:acm:cert/1" };
      return describeResponse({ status: "PENDING_VALIDATION", domainName: "www.example.com" });
    });

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1",
      projectId: "proj-1",
      target: TARGET,
      domains: [
        { id: "d1", name: "example.com" },
        { id: "d2", name: "www.example.com" },
      ],
    });

    expect(res.success).toBe(true);
    const req = acmSend.mock.calls.find((c) => (c[0] as { __type: string }).__type === "RequestCertificate");
    const input = (req![0] as { input: Record<string, unknown> }).input;
    // Only the usable domain is on the certificate.
    expect(input.DomainName).toBe("www.example.com");
    expect(input.SubjectAlternativeNames).toBeUndefined();
  });
});

describe("reconcileAwsStaticDomains — failures", () => {
  it("maps CNAMEAlreadyExists to a specific, non-retryable message", async () => {
    rows = [
      {
        id: "cert-1", domainName: "a.example.com", type: "acm", status: "pending",
        providerRef: "arn:acm:cert/1", validationRecord: null,
        verificationState: "awaiting_dns", verificationMessage: null, attachStartedAt: null,
      },
    ];
    acmSend.mockImplementation(async () => describeResponse({ status: "ISSUED", domainName: "a.example.com" }));
    cfnSend.mockRejectedValue(new Error("CNAMEAlreadyExists: One or more aliases are already in use"));

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
    expect(res.message).toMatch(/already attached to another CloudFront/i);
  });

  it("flags an ACM quota failure as non-retryable with remediation", async () => {
    acmSend.mockImplementation(async (c: { __type: string }) => {
      if (c.__type === "ListCertificates") return { CertificateSummaryList: [] };
      if (c.__type === "RequestCertificate") throw new Error("LimitExceededException: too many certificates");
      return {};
    });

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
    expect(res.message).toMatch(/certificate limit/i);
  });

  it("explains that a pre-existing stack needs one redeploy", async () => {
    rows = [
      {
        id: "cert-1", domainName: "a.example.com", type: "acm", status: "pending",
        providerRef: "arn:acm:cert/1", validationRecord: null,
        verificationState: "awaiting_dns", verificationMessage: null, attachStartedAt: null,
      },
    ];
    acmSend.mockImplementation(async () => describeResponse({ status: "ISSUED", domainName: "a.example.com" }));
    cfnSend.mockRejectedValue(
      new Error("ValidationError: Parameters: [DomainAliases, CertificateArn] do not exist in the template"),
    );

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
    expect(res.message).toMatch(/Redeploy the project/i);
  });

  it("never throws, even when every AWS call fails", async () => {
    acmSend.mockRejectedValue(new Error("network down"));
    cfnSend.mockRejectedValue(new Error("network down"));

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET,
      domains: [{ id: "d1", name: "a.example.com" }],
    });

    expect(res.success).toBe(false);
    expect(res.message).toBeTruthy();
  });
});

describe("reconcileAwsStaticDomains — removing domains", () => {
  it("clears the aliases and certificate when the last domain is removed", async () => {
    rows = [
      {
        id: "cert-1", domainName: "old.example.com", type: "acm", status: "active",
        providerRef: "arn:acm:cert/1", validationRecord: null,
        verificationState: "live", verificationMessage: null, attachStartedAt: null,
      },
    ];

    const res = await reconcileAwsStaticDomains({
      tenantId: "t1", projectId: "proj-1", target: TARGET, domains: [],
    });

    expect(deletedRowNames).toContain("old.example.com");

    const update = cfnSend.mock.calls.find((c) => (c[0] as { __type: string }).__type === "UpdateStack");
    const params = (update![0] as { input: { Parameters: Array<{ ParameterKey: string; ParameterValue?: string }> } })
      .input.Parameters;
    const byKey = new Map(params.map((p) => [p.ParameterKey, p.ParameterValue]));
    expect(byKey.get("DomainAliases")).toBe("");
    expect(byKey.get("CertificateArn")).toBe("");

    expect(res.success).toBe(true);
  });
});

describe("awsDnsInstructions", () => {
  it("returns the validation CNAME and the routing CNAME, in that order", () => {
    const { records, note } = awsDnsInstructions({
      target: TARGET,
      domainName: "www.example.com",
      validationRecord: { name: "_val.www.example.com.", type: "CNAME", value: "_tok.acm-validations.aws." },
    });

    expect(records).toHaveLength(2);
    expect(records[0].value).toBe("_tok.acm-validations.aws.");
    expect(records[1]).toMatchObject({
      name: "www.example.com",
      type: "CNAME",
      value: "d111.cloudfront.net",
    });
    expect(note).toMatch(/5-20 minutes/);
  });

  it("returns only the routing record before AWS reports a validation record", () => {
    const { records } = awsDnsInstructions({
      target: TARGET,
      domainName: "www.example.com",
      validationRecord: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].type).toBe("CNAME");
    expect(records[0].value).toBe("d111.cloudfront.net");
  });

  it("explains what each record is for", () => {
    const { records } = awsDnsInstructions({
      target: TARGET,
      domainName: "www.example.com",
      validationRecord: { name: "_v.", type: "CNAME", value: "_t." },
    });

    for (const r of records) {
      expect(r.purpose.length).toBeGreaterThan(10);
    }
  });
});

describe("isPastCertDeadline", () => {
  it("is false for a null or unparseable timestamp", () => {
    expect(isPastCertDeadline(null)).toBe(false);
    expect(isPastCertDeadline("not a date")).toBe(false);
  });

  it("is false inside the two-hour window", () => {
    const now = Date.parse("2026-01-01T02:00:00Z");
    expect(isPastCertDeadline("2026-01-01T01:00:00Z", now)).toBe(false);
  });

  it("is true past the two-hour window", () => {
    const now = Date.parse("2026-01-01T05:00:00Z");
    expect(isPastCertDeadline("2026-01-01T01:00:00Z", now)).toBe(true);
  });
});
