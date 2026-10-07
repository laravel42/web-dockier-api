/**
 * The sweep's full behaviour matrix.
 *
 * The cases that matter most are the ones that keep polling BOUNDED: every due
 * row gets its clock touched even if the enqueue throws, a not-due row is not
 * touched, and a row the tables have no cadence for is skipped rather than
 * polled on a guess. Each of those is a path by which this could quietly
 * become a per-minute provider call per project, forever.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  projectId: string;
  organizationId: string;
  domainName: string;
  type: "acm" | "gcp_managed";
  status: string;
  providerRef: string | null;
  validationRecord: null;
  verificationState: string;
  verificationMessage: string | null;
  attachStartedAt: string | null;
  createdAt: string | null;
  issuedAt: string | null;
  updatedAt: string | null;
};

let candidates: Row[] = [];
let listFails = false;
const touched: string[] = [];
const stateWrites: Array<{ id: string; update: Record<string, unknown>; current?: string }> = [];
const enqueued: Array<{ tenantId: string; projectId: string }> = [];
let touchThrowsFor: string | null = null;
let enqueueThrows = false;

vi.mock("../certs.js", () => ({
  listCertRowsForPoll: async () =>
    listFails
      ? { ok: false, failure: { kind: "transient", retryable: true, message: "nope", detail: {} } }
      : { ok: true, rows: candidates },
  touchCertPolled: async (id: string) => {
    touched.push(id);
    if (touchThrowsFor === id) throw new Error("touch failed");
    return true;
  },
  setCertState: async (id: string, update: Record<string, unknown>, current?: string) => {
    stateWrites.push({ id, update, current });
    return true;
  },
}));

vi.mock("../../../../../shared/workers/config-apply.js", () => ({
  enqueueDomainApply: async (tenantId: string, projectId: string) => {
    if (enqueueThrows) throw new Error("queue down");
    enqueued.push({ tenantId, projectId });
  },
}));

const logError = vi.fn();

vi.mock("../../../../../shared/logger.js", () => ({
  logger: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { runCertPollSweep } = await import("../poll-sweep.js");

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "cert-1",
    projectId: "proj-1",
    organizationId: "tenant-1",
    domainName: "www.example.com",
    type: "acm",
    status: "pending",
    providerRef: null,
    validationRecord: null,
    verificationState: "awaiting_dns",
    verificationMessage: null,
    attachStartedAt: iso(10 * MINUTE),
    createdAt: iso(10 * MINUTE),
    issuedAt: null,
    updatedAt: iso(10 * MINUTE),
    ...overrides,
  };
}

beforeEach(() => {
  candidates = [];
  listFails = false;
  touched.length = 0;
  stateWrites.length = 0;
  enqueued.length = 0;
  touchThrowsFor = null;
  enqueueThrows = false;
  logError.mockReset();
});

describe("due-ness", () => {
  it("touches and enqueues a due row", async () => {
    // awaiting_dns in its first 30 min polls every 5; last seen 10 min ago.
    candidates = [row()];

    const summary = await runCertPollSweep(NOW);

    expect(summary.due).toBe(1);
    expect(touched).toEqual(["cert-1"]);
    expect(enqueued).toEqual([{ tenantId: "tenant-1", projectId: "proj-1" }]);
  });

  it("leaves a not-due row completely untouched", async () => {
    // Only a LOOK costs a touch.
    candidates = [row({ updatedAt: iso(1 * MINUTE) })];

    const summary = await runCertPollSweep(NOW);

    expect(summary.due).toBe(0);
    expect(touched).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it("treats a row with no updated_at as due", async () => {
    candidates = [row({ updatedAt: null })];

    await runCertPollSweep(NOW);

    expect(touched).toEqual(["cert-1"]);
  });

  it("splits the two AWS awaiting_dns cadences on status", async () => {
    // Both tiers are 5 min in the first 30, so use the escalated tier to show
    // `status` is read at all: 7h of phase age → 60 min for both.
    candidates = [
      row({ id: "pre", attachStartedAt: iso(7 * HOUR), updatedAt: iso(30 * MINUTE) }),
      row({
        id: "post",
        status: "active",
        issuedAt: iso(7 * HOUR),
        attachStartedAt: iso(7 * HOUR),
        updatedAt: iso(30 * MINUTE),
      }),
    ];

    const summary = await runCertPollSweep(NOW);

    // 30 min since last look < 60 min tier, so neither is due.
    expect(summary.due).toBe(0);
  });
});

describe("deadlines", () => {
  it("times out an AWS pre-issuance row at 72h on created_at", async () => {
    candidates = [
      row({ createdAt: iso(73 * HOUR), attachStartedAt: iso(1 * MINUTE), updatedAt: iso(1 * HOUR) }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.timedOut).toBe(1);
    expect(stateWrites[0].update.verificationState).toBe("timed_out");
    expect(String(stateWrites[0].update.verificationMessage)).toMatch(/never saw the validation record/i);
    // Not enqueued: there is nothing for a reconcile to do.
    expect(enqueued).toEqual([]);
  });

  it("an oscillated row still times out, because the clock is created_at", async () => {
    // awaiting_dns → provisioning → awaiting_dns re-stamps the PHASE clock on
    // every hop. If the 72h budget read that clock, ACM would discard the
    // certificate while we polled an ARN that no longer exists.
    candidates = [
      row({ createdAt: iso(80 * HOUR), attachStartedAt: iso(30 * 1000), updatedAt: iso(1 * HOUR) }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.timedOut).toBe(1);
  });

  it("uses the routing message for a post-attach timeout", async () => {
    candidates = [
      row({
        status: "active",
        issuedAt: iso(73 * HOUR),
        createdAt: iso(80 * HOUR),
        updatedAt: iso(2 * HOUR),
      }),
    ];

    await runCertPollSweep(NOW);

    expect(String(stateWrites[0].update.verificationMessage)).toMatch(/routing record/i);
  });

  it("falls back to created_at when a post-attach row has no issued_at", async () => {
    candidates = [
      row({
        status: "active",
        issuedAt: null,
        attachStartedAt: null,
        createdAt: iso(73 * HOUR),
        updatedAt: iso(2 * HOUR),
      }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.timedOut).toBe(1);
  });

  it("REVERTS rather than giving up on AWS provisioning at 2h", async () => {
    candidates = [
      row({
        verificationState: "provisioning",
        attachStartedAt: iso(3 * HOUR),
        createdAt: iso(4 * HOUR),
        updatedAt: iso(30 * MINUTE),
      }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.reverted).toBe(1);
    expect(summary.timedOut).toBe(0);
    expect(stateWrites[0].update.verificationState).toBe("awaiting_dns");
    expect(String(stateWrites[0].update.verificationMessage)).toMatch(/trailing dot/i);
  });

  it("times out AWS attaching at 90 min on the phase clock", async () => {
    candidates = [
      row({
        verificationState: "attaching",
        status: "active",
        attachStartedAt: iso(100 * MINUTE),
        createdAt: iso(10 * HOUR),
        updatedAt: iso(10 * MINUTE),
      }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.timedOut).toBe(1);
    expect(String(stateWrites[0].update.verificationMessage)).toMatch(/CloudFront update/i);
  });

  it("times out a pending row at 30 min on both clouds", async () => {
    candidates = [
      row({ id: "aws-pending", verificationState: "pending", attachStartedAt: iso(31 * MINUTE), createdAt: iso(31 * MINUTE), updatedAt: iso(5 * MINUTE) }),
      row({
        id: "gcp-pending",
        projectId: "proj-2",
        type: "gcp_managed",
        verificationState: "pending",
        attachStartedAt: iso(31 * MINUTE),
        createdAt: iso(31 * MINUTE),
        updatedAt: iso(5 * MINUTE),
      }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.timedOut).toBe(2);
    expect(String(stateWrites[0].update.verificationMessage)).toMatch(/request a certificate/i);
    expect(String(stateWrites[1].update.verificationMessage)).toMatch(/set up HTTPS/i);
  });

  it("does not time out a freshly resumed pending row", async () => {
    // Resume sets `pending` with a fresh phase clock. A created_at budget here
    // would re-expire an hours-old row on the very next sweep and make the
    // button useless.
    candidates = [
      row({
        verificationState: "pending",
        attachStartedAt: iso(1 * MINUTE),
        createdAt: iso(100 * HOUR),
        updatedAt: iso(1 * MINUTE),
      }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.timedOut).toBe(0);
  });

  it("passes the row's current state so the phase clock is not re-stamped", async () => {
    candidates = [
      row({ createdAt: iso(73 * HOUR), updatedAt: iso(1 * HOUR), verificationState: "awaiting_dns" }),
    ];

    await runCertPollSweep(NOW);

    expect(stateWrites[0].current).toBe("awaiting_dns");
  });
});

describe("robustness", () => {
  it("skips and logs a row whose state has no cadence", async () => {
    // Never poll on a guessed interval.
    candidates = [row({ verificationState: "some_future_state" })];

    const summary = await runCertPollSweep(NOW);

    expect(summary.skipped).toBe(1);
    expect(touched).toEqual([]);
    expect(enqueued).toEqual([]);

    // Assert the DELIBERATE skip path, not merely that nothing happened.
    // Letting the state fall through to `certDeadlineMs` would throw
    // `assertNever`, be caught by the per-row handler, and produce an
    // identical `skipped: 1` — so counting alone cannot tell the two apart.
    // The log naming the unhandled state is what distinguishes them.
    const messages = logError.mock.calls.map((call) => String(call[1]));
    expect(messages.some((m) => /no cadence for/i.test(m))).toBe(true);
    expect(messages.some((m) => /row failed during sweep/i.test(m))).toBe(false);
    // And the log must name the pair, or it is not actionable.
    const context = logError.mock.calls.find((call) => /no cadence for/i.test(String(call[1])));
    expect(context?.[0]).toMatchObject({ state: "some_future_state", type: "acm" });
  });

  it("touches the clock even when the enqueue throws", async () => {
    // Otherwise a broken queue becomes a per-minute enqueue storm.
    enqueueThrows = true;
    candidates = [row()];

    await runCertPollSweep(NOW);

    expect(touched).toEqual(["cert-1"]);
  });

  it("one row failing does not abort the sweep", async () => {
    touchThrowsFor = "cert-1";
    candidates = [row({ id: "cert-1" }), row({ id: "cert-2", projectId: "proj-2" })];

    const summary = await runCertPollSweep(NOW);

    expect(summary.skipped).toBe(1);
    expect(enqueued).toEqual([{ tenantId: "tenant-1", projectId: "proj-2" }]);
  });

  it("enqueues once per project however many domains are due", async () => {
    candidates = [
      row({ id: "a", domainName: "a.example.com" }),
      row({ id: "b", domainName: "b.example.com" }),
      row({ id: "c", projectId: "proj-2", domainName: "c.example.com" }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.due).toBe(3);
    expect(summary.enqueuedProjects).toBe(2);
    expect(enqueued.map((e) => e.projectId).sort()).toEqual(["proj-1", "proj-2"]);
  });

  it("derives the cloud from the row type for both types", async () => {
    // GCP awaiting_dns polls every 15 min; 10 min since the last look is not
    // due, while the AWS row at the same age is.
    candidates = [
      row({ id: "aws", type: "acm" }),
      row({ id: "gcp", projectId: "proj-2", type: "gcp_managed" }),
    ];

    const summary = await runCertPollSweep(NOW);

    expect(summary.due).toBe(1);
    expect(touched).toEqual(["aws"]);
  });

  it("does nothing but report when the candidate read fails", async () => {
    // A failed read must never be treated as an empty table.
    listFails = true;

    const summary = await runCertPollSweep(NOW);

    expect(summary).toMatchObject({ considered: 0, due: 0, enqueuedProjects: 0 });
    expect(touched).toEqual([]);
    expect(stateWrites).toEqual([]);
  });

  it("reports an empty sweep without touching anything", async () => {
    const summary = await runCertPollSweep(NOW);

    expect(summary.considered).toBe(0);
    expect(enqueued).toEqual([]);
  });
});
