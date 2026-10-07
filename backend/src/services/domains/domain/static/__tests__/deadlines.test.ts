/**
 * One case per row of both D2 tables.
 *
 * These are cheap to change later — that is the point of keeping them in a pure
 * table module — but they must be TOTAL over the nine (cloud, state) pairs the
 * sweep's filter admits. A missing pair falling through to a permissive default
 * is what turned a state-less `pending` row into a permanent per-minute poll.
 */

import { describe, expect, it } from "vitest";

import {
  POLLABLE_CERT_STATES,
  asPollableState,
  certDeadlineMs,
  pollIntervalMs,
  type PollableCertState,
  type StaticCloud,
} from "../deadlines.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("pollIntervalMs — AWS", () => {
  it("escalates `pending` so a transiently failing reconcile does not spin", () => {
    expect(pollIntervalMs("aws", "pending", "pending", 0)).toBe(MINUTE);
    expect(pollIntervalMs("aws", "pending", "pending", 4 * MINUTE)).toBe(MINUTE);
    expect(pollIntervalMs("aws", "pending", "pending", 6 * MINUTE)).toBe(5 * MINUTE);
  });

  it("escalates `awaiting_dns` through three tiers", () => {
    // A 72-hour wait on the user's DNS must not cost hundreds of
    // DescribeCertificate calls.
    expect(pollIntervalMs("aws", "awaiting_dns", "pending", 0)).toBe(5 * MINUTE);
    expect(pollIntervalMs("aws", "awaiting_dns", "pending", 31 * MINUTE)).toBe(15 * MINUTE);
    expect(pollIntervalMs("aws", "awaiting_dns", "pending", 7 * HOUR)).toBe(60 * MINUTE);
  });

  it("uses the same escalation post-attach, where the poll is pure DNS", () => {
    expect(pollIntervalMs("aws", "awaiting_dns", "active", 0)).toBe(5 * MINUTE);
    expect(pollIntervalMs("aws", "awaiting_dns", "active", 7 * HOUR)).toBe(60 * MINUTE);
  });

  it("watches `provisioning` closely and `attaching` at CDN pace", () => {
    expect(pollIntervalMs("aws", "provisioning", "pending", 0)).toBe(2 * MINUTE);
    expect(pollIntervalMs("aws", "attaching", "active", 0)).toBe(5 * MINUTE);
  });
});

describe("pollIntervalMs — GCP", () => {
  it("covers all four states, including the one no code writes yet", () => {
    expect(pollIntervalMs("gcp", "pending", "pending", 0)).toBe(MINUTE);
    expect(pollIntervalMs("gcp", "pending", "pending", 6 * MINUTE)).toBe(5 * MINUTE);
    expect(pollIntervalMs("gcp", "awaiting_dns", "pending", 0)).toBe(15 * MINUTE);
    expect(pollIntervalMs("gcp", "provisioning", "pending", 0)).toBe(10 * MINUTE);
    // Unreachable today, but the sweep's filter admits it.
    expect(pollIntervalMs("gcp", "attaching", "pending", 0)).toBe(5 * MINUTE);
  });
});

describe("certDeadlineMs", () => {
  it("gives `pending` 30 minutes on the PHASE clock, so Resume works", () => {
    // Bare `created_at` would re-expire a resumed hours-old row on the very
    // next sweep and make the button useless.
    for (const cloud of ["aws", "gcp"] as StaticCloud[]) {
      expect(certDeadlineMs(cloud, "pending", "pending")).toEqual({
        ms: 30 * MINUTE,
        clock: "phase",
        terminal: true,
      });
    }
  });

  it("reads ACM's own 72-hour window from `created_at` before issuance", () => {
    // A phase revert must not reset a provider's budget.
    expect(certDeadlineMs("aws", "awaiting_dns", "pending")).toEqual({
      ms: 72 * HOUR,
      clock: "created",
      terminal: true,
    });
  });

  it("reads the post-attach routing wait from `issued_at`", () => {
    expect(certDeadlineMs("aws", "awaiting_dns", "active")).toEqual({
      ms: 72 * HOUR,
      clock: "issued",
      terminal: true,
    });
  });

  it("makes AWS `provisioning` a revert, not a give-up", () => {
    const deadline = certDeadlineMs("aws", "provisioning", "pending");
    expect(deadline).toEqual({ ms: 2 * HOUR, clock: "phase", terminal: false });
  });

  it("gives AWS `attaching` 90 minutes on the phase clock", () => {
    expect(certDeadlineMs("aws", "attaching", "active")).toEqual({
      ms: 90 * MINUTE,
      clock: "phase",
      terminal: true,
    });
  });

  it("covers every GCP state", () => {
    expect(certDeadlineMs("gcp", "awaiting_dns", "pending")).toEqual({
      ms: 72 * HOUR,
      clock: "created",
      terminal: true,
    });
    expect(certDeadlineMs("gcp", "provisioning", "pending")).toEqual({
      ms: 24 * HOUR,
      clock: "phase",
      terminal: true,
    });
    expect(certDeadlineMs("gcp", "attaching", "pending")).toEqual({
      ms: 90 * MINUTE,
      clock: "phase",
      terminal: true,
    });
  });
});

describe("totality over the sweep's own filter", () => {
  it("answers for all nine (cloud, state) pairs with no default", () => {
    // Nine, not eight: AWS `awaiting_dns` splits on `status`.
    const pairs: Array<[StaticCloud, PollableCertState, string]> = [];
    for (const cloud of ["aws", "gcp"] as StaticCloud[]) {
      for (const state of POLLABLE_CERT_STATES) {
        pairs.push([cloud, state, "pending"]);
      }
    }
    pairs.push(["aws", "awaiting_dns", "active"]);

    expect(pairs).toHaveLength(9);
    for (const [cloud, state, status] of pairs) {
      const interval = pollIntervalMs(cloud, state, status, 0);
      expect(interval).toBeGreaterThan(0);
      // No pair produces `null` after this revision; the type keeps it for a
      // future cadence-only pair.
      expect(certDeadlineMs(cloud, state, status)).not.toBeNull();
    }
  });

  it("throws rather than guessing for a state outside the union", () => {
    // The sweep narrows first and skips-and-logs, so this should be
    // unreachable — but a guessed interval is the failure mode worth making
    // loud rather than silent.
    expect(() =>
      pollIntervalMs("aws", "live" as unknown as PollableCertState, "active", 0),
    ).toThrow(/unhandled value/);
    expect(() =>
      certDeadlineMs("gcp", "timed_out" as unknown as PollableCertState, "pending"),
    ).toThrow(/unhandled value/);
  });
});

describe("asPollableState", () => {
  it("admits the four polled states and rejects the three terminal ones", () => {
    expect(asPollableState("pending")).toBe("pending");
    expect(asPollableState("awaiting_dns")).toBe("awaiting_dns");
    expect(asPollableState("provisioning")).toBe("provisioning");
    expect(asPollableState("attaching")).toBe("attaching");

    expect(asPollableState("live")).toBeNull();
    expect(asPollableState("failed")).toBeNull();
    // Excluded so a timed-out row consumes no poll slots.
    expect(asPollableState("timed_out")).toBeNull();
    expect(asPollableState("nonsense")).toBeNull();
  });
});

