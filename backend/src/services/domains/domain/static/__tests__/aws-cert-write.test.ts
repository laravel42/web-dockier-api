/**
 * The production failure, in a test that would have caught it.
 *
 * Unlike `aws.test.ts`, this file leaves the REAL `certs.ts` in the module
 * graph and fakes Supabase instead, so the reconcile runs against the actual
 * query builder. A separate file rather than an edit to `aws.test.ts` because
 * the two need incompatible module mocks: that one replaces `../certs.js`
 * wholesale, which is exactly the hole this closes.
 *
 * Three behaviours are pinned here:
 *   1. The pre-0075 schema shape fails non-retryably and never reaches ACM.
 *   2. A denied `acm:RequestCertificate` writes `failed` onto every row (F1).
 *   3. A throttled `acm:RequestCertificate` writes the message but NOT `failed`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── AWS SDK mock, at the same seam the production code resolves ───
const acmSend = vi.fn();

class FakeAcmClient {
  constructor(public cfg: { region?: string }) {}
  send = acmSend;
}

const cmd = (name: string) =>
  class {
    readonly __type = name;
    constructor(public input: Record<string, unknown>) {}
  };

const cfnSend = vi.fn();
class FakeCfnClient {
  constructor(public cfg: { region?: string }) {}
  send = cfnSend;
}

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

// ─── Supabase mock: a builder that mimics PostgREST's chain ────────
interface QueryResult {
  data: unknown;
  error: { code?: string; message: string; details?: string; hint?: string } | null;
}

/** Per-table queued results, consumed in order. */
let selectResults: QueryResult[] = [];
let insertResults: QueryResult[] = [];
const updates: Array<Record<string, unknown>> = [];

function chainable(resolve: () => QueryResult): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    then: (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
  };
  for (const method of ["select", "eq", "in", "single", "maybeSingle"]) {
    chain[method] = () => chain;
  }
  return chain;
}

vi.mock("../../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => chainable(() => selectResults.shift() ?? { data: null, error: null }),
      insert: () => chainable(() => insertResults.shift() ?? { data: null, error: null }),
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return chainable(() => ({ data: null, error: null }));
      },
      delete: () => chainable(() => ({ data: null, error: null })),
    }),
  },
}));

vi.mock("../../../../../shared/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mocked rather than driven through the fake Supabase, so the queued results
// below map one-to-one onto the certificate reads this test is about.
vi.mock("../../apex-ack.js", () => ({
  listApexAcks: async () => [] as string[],
}));

const { reconcileAwsStaticDomains } = await import("../aws.js");

const target = {
  kind: "aws-static" as const,
  region: "eu-west-1",
  stackName: "image-builder-app-web-inky",
  distributionId: "E123",
  distributionDomain: "d3d8fr298zex5t.cloudfront.net",
  websiteBucket: "dockier-1-web-inky-static",
  credentials: { accessKeyId: "k", secretAccessKey: "s" },
} as unknown as Parameters<typeof reconcileAwsStaticDomains>[0]["target"];

const domains = [{ id: "domain-1", name: "www.skmdesignstudio.com" }];

/** A certificate row as PostgREST returns it, post-0075. */
const dbRow = {
  id: "cert-1",
  domain_name: "www.skmdesignstudio.com",
  type: "acm",
  status: "pending",
  provider_ref: null,
  validation_record: null,
  verification_state: "pending",
  verification_message: null,
  attach_started_at: null,
};

function awsError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

beforeEach(() => {
  acmSend.mockReset();
  cfnSend.mockReset();
  selectResults = [];
  insertResults = [];
  updates.length = 0;
});

describe("the pre-0075 schema (the production failure)", () => {
  it("fails non-retryably and never reaches RequestCertificate", async () => {
    // `verification_state` is absent from PostgREST's schema cache, exactly as
    // it was before migration 0075 was applied.
    selectResults = [
      { data: null, error: null }, // listStaticCertRows (orphan sweep)
      { data: null, error: null }, // findStaticCertRow: nothing there
    ];
    insertResults = [
      {
        data: null,
        error: {
          code: "PGRST204",
          message: "Could not find the 'verification_state' column of 'ssl_certificates'",
        },
      },
    ];

    const res = await reconcileAwsStaticDomains({
      tenantId: "tenant-1",
      projectId: "project-1",
      target,
      domains,
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
    // The message the user actually needed, instead of "Try Sync again".
    expect(res.message).toMatch(/pnpm db:migrate/);
    expect(res.message).toMatch(/readyz/);
    expect(res.message).not.toMatch(/try .*again/i);

    // The whole point: ACM was never called, so no certificate was leaked and
    // no AWS error masked the real cause.
    expect(acmSend).not.toHaveBeenCalled();
    expect(cfnSend).not.toHaveBeenCalled();
  });
});

describe("a denied acm:RequestCertificate", () => {
  beforeEach(() => {
    selectResults = [
      { data: [], error: null }, // orphan sweep: no existing rows
      { data: null, error: null }, // find: nothing
    ];
    insertResults = [{ data: dbRow, error: null }];
  });

  it("is non-retryable, names the action, and points at the IAM document", async () => {
    acmSend.mockImplementation(async (command: { __type?: string }) => {
      if (command.__type === "ListCertificates") return { CertificateSummaryList: [] };
      throw awsError(
        "AccessDeniedException",
        "User: arn:aws:iam::251486138355:user/dockier-dev is not authorized to perform: " +
          "acm:RequestCertificate on resource: arn:aws:acm:us-east-1:251486138355:certificate/*",
      );
    });

    const res = await reconcileAwsStaticDomains({
      tenantId: "tenant-1",
      projectId: "project-1",
      target,
      domains,
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
    expect(res.message).toContain("acm:RequestCertificate");
    expect(res.message).toContain("docs/operations/aws-static-hosting-iam.md");
    // The principal ARN is log-only; it carries the account id.
    expect(res.message).not.toContain("arn:aws:iam::");
  });

  it("writes `failed` and the message onto every row — the F1 guard", async () => {
    acmSend.mockImplementation(async (command: { __type?: string }) => {
      if (command.__type === "ListCertificates") return { CertificateSummaryList: [] };
      throw awsError(
        "AccessDeniedException",
        "User: arn:aws:iam::251486138355:user/dockier-dev is not authorized to perform: acm:RequestCertificate",
      );
    });

    await reconcileAwsStaticDomains({
      tenantId: "tenant-1",
      projectId: "project-1",
      target,
      domains,
    });

    // Before this fix the row stayed at `pending` with a null message forever:
    // visibly stuck, with no explanation on the row or in the response.
    const stateWrite = updates.find((u) => u.verification_state !== undefined);
    expect(stateWrite).toBeDefined();
    expect(stateWrite?.verification_state).toBe("failed");
    expect(String(stateWrite?.verification_message)).toContain("acm:RequestCertificate");
  });
});

describe("a throttled acm:RequestCertificate", () => {
  it("writes the message but leaves the state alone, so a retry can still land", async () => {
    selectResults = [
      { data: [], error: null },
      { data: null, error: null },
    ];
    insertResults = [{ data: dbRow, error: null }];

    acmSend.mockImplementation(async (command: { __type?: string }) => {
      if (command.__type === "ListCertificates") return { CertificateSummaryList: [] };
      throw awsError("ThrottlingException", "Rate exceeded");
    });

    const res = await reconcileAwsStaticDomains({
      tenantId: "tenant-1",
      projectId: "project-1",
      target,
      domains,
    });

    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);

    // A transient failure must NOT write `failed`: that would turn a momentary
    // rate limit into a dead end the user has to dig out of by hand.
    const wroteFailed = updates.some((u) => u.verification_state === "failed");
    expect(wroteFailed).toBe(false);
    // But the message is still recorded, so the row is not silently stuck.
    const wroteMessage = updates.some((u) => u.verification_message !== undefined);
    expect(wroteMessage).toBe(true);
  });
});
