/**
 * All six resume rows.
 *
 * The rule under test: only a TERMINAL row is reset. Rewriting a row that is
 * still progressing would move its phase clock and push its own deadline out,
 * so "resume" on a healthy attachment must be a no-op plus an enqueue.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

let domain: { id: string; name: string } | null = { id: "dom-1", name: "www.example.com" };
let cloud: "aws" | "gcp" | null = "aws";
let certRow: { id: string; verificationState: string } | null = null;
let findFails = false;
let blocker: string | undefined;

const stateWrites: Array<{ id: string; update: Record<string, unknown>; current?: string }> = [];
const enqueued: Array<{ tenantId: string; projectId: string }> = [];

class FakeDomainsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

vi.mock("../domains.js", () => ({
  getDomainById: async () => domain,
  DomainsError: FakeDomainsError,
}));

vi.mock("../worker.js", () => ({
  enqueueDomainApply: async (tenantId: string, projectId: string) => {
    enqueued.push({ tenantId, projectId });
  },
}));

vi.mock("../applier.js", () => ({
  getDomainAttachment: async () => ({
    supported: true,
    ...(blocker ? { blocker } : {}),
    domains: [],
  }),
}));

vi.mock("../static/cloud.js", () => ({
  resolveStaticCloud: async () => ({ cloud, routeTarget: null, apexAliasAck: [] }),
}));

vi.mock("../static/certs.js", () => ({
  findStaticCertRow: async () =>
    findFails
      ? { ok: false, failure: { kind: "transient", retryable: true, message: "x", detail: {} } }
      : { ok: true, row: certRow },
  setCertState: async (id: string, update: Record<string, unknown>, current?: string) => {
    stateWrites.push({ id, update, current });
    return true;
  },
}));

const { resumeDomainAttachment } = await import("../resume.js");

const params = { tenantId: "t1", projectId: "proj-1", domainId: "dom-1" };

beforeEach(() => {
  domain = { id: "dom-1", name: "www.example.com" };
  cloud = "aws";
  certRow = null;
  findFails = false;
  blocker = undefined;
  stateWrites.length = 0;
  enqueued.length = 0;
});

describe("resumeDomainAttachment", () => {
  it("404s on an unknown domain and enqueues nothing", async () => {
    domain = null;

    await expect(resumeDomainAttachment(params)).rejects.toMatchObject({ code: "not_found" });
    expect(enqueued).toEqual([]);
  });

  it("409s on a non-static project and enqueues nothing", async () => {
    cloud = null;

    await expect(resumeDomainAttachment(params)).rejects.toMatchObject({ code: "conflict" });
    expect(enqueued).toEqual([]);
  });

  it("enqueues with no state write when there is no certificate row yet", async () => {
    // The job is what creates the row.
    certRow = null;

    const result = await resumeDomainAttachment(params);

    expect(result.success).toBe(true);
    expect(result.verificationState).toBe("pending");
    expect(stateWrites).toEqual([]);
    expect(enqueued).toHaveLength(1);
  });

  it("resets a timed_out row to pending with a fresh phase clock", async () => {
    certRow = { id: "cert-1", verificationState: "timed_out" };

    const result = await resumeDomainAttachment(params);

    expect(result.verificationState).toBe("pending");
    expect(stateWrites).toHaveLength(1);
    expect(stateWrites[0].update).toMatchObject({
      verificationState: "pending",
      verificationMessage: null,
    });
    // Explicitly set, because the 30-minute pending budget reads this clock and
    // a stale one would re-expire the row on the very next sweep.
    expect(stateWrites[0].update.attachStartedAt).toBeTypeOf("string");
    expect(stateWrites[0].current).toBe("timed_out");
    expect(enqueued).toHaveLength(1);
  });

  it("resets a failed row the same way", async () => {
    certRow = { id: "cert-1", verificationState: "failed" };

    const result = await resumeDomainAttachment(params);

    expect(result.verificationState).toBe("pending");
    expect(stateWrites).toHaveLength(1);
  });

  it("leaves a non-terminal row alone and just re-enqueues", async () => {
    // Rewriting it would move the phase clock and push its deadline out.
    certRow = { id: "cert-1", verificationState: "awaiting_dns" };

    const result = await resumeDomainAttachment(params);

    expect(result.verificationState).toBe("awaiting_dns");
    expect(stateWrites).toEqual([]);
    expect(enqueued).toHaveLength(1);
  });

  it("leaves a live row alone and just re-enqueues", async () => {
    certRow = { id: "cert-1", verificationState: "live" };

    const result = await resumeDomainAttachment(params);

    expect(result.verificationState).toBe("live");
    expect(stateWrites).toEqual([]);
    expect(enqueued).toHaveLength(1);
  });

  it("returns the blocker verbatim as a 200, still enqueueing", async () => {
    // Nothing is wrong with the REQUEST — the instruction is "redeploy first".
    blocker = "This site was deployed before custom domains were supported. Redeploy once.";
    certRow = { id: "cert-1", verificationState: "timed_out" };

    const result = await resumeDomainAttachment(params);

    expect(result.success).toBe(true);
    expect(result.message).toBe(blocker);
    expect(enqueued).toHaveLength(1);
  });

  it("still enqueues when the certificate row cannot be read", async () => {
    findFails = true;

    const result = await resumeDomainAttachment(params);

    expect(result.success).toBe(true);
    expect(stateWrites).toEqual([]);
    expect(enqueued).toHaveLength(1);
  });
});
