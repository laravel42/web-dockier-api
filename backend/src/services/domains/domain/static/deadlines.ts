/**
 * Poll cadence and give-up deadlines for static-hosting certificates.
 *
 * A pure table module. It imports nothing from `aws.ts` — the dependency runs
 * one way on purpose, which is what keeps this unit-testable without touching
 * an AWS client.
 *
 * Both functions are EXHAUSTIVE over the nine (cloud, state) pairs the sweep's
 * filter admits, with `assertNever` on the default. That is a deliberate choice
 * over a permissive fallback: a lenient default is precisely what turned a
 * state-less `pending` row into a permanent per-minute poll, and the same
 * leniency applied to an unlisted pair would hide the next one. Adding a state
 * to the sweep's filter without adding a cadence here is a COMPILE error.
 */

import type { CertVerificationState } from "../mappers.js";

export type StaticCloud = "aws" | "gcp";

/**
 * The four states the sweep polls. `live`, `failed` and `timed_out` are
 * terminal and excluded, so a timed-out row consumes no poll slots.
 */
export type PollableCertState = Extract<
  CertVerificationState,
  "pending" | "awaiting_dns" | "provisioning" | "attaching"
>;

/**
 * The original flat 2-hour budget, kept as `isPastCertDeadline`'s default third
 * argument so nothing that calls it today changes meaning. Lives here rather
 * than in `aws.ts` so the tables and the constant cannot drift apart.
 */
export const CERT_DEADLINE_MS = 2 * 60 * 60 * 1000;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unhandled value ${JSON.stringify(value)}`);
}

/**
 * How long to wait before looking at this row again.
 *
 * `phaseAgeMs` selects a backoff tier; it is not itself the gap. The sweep
 * compares the returned interval against `now - updated_at`.
 *
 * `status` is a parameter because on AWS one `verification_state` covers two
 * different waits: `awaiting_dns` before issuance means "publish the validation
 * record", and after issuance (`status === "active"`) means "publish the
 * routing record". It is the SAME discriminator the stage model uses.
 */
export function pollIntervalMs(
  cloud: StaticCloud,
  state: PollableCertState,
  status: string,
  phaseAgeMs: number,
): number {
  if (cloud === "aws") {
    switch (state) {
      case "pending":
        // Escalates for the same reason awaiting_dns does: a reconcile failing
        // TRANSIENTLY rests here, and an unescalated 1-minute tier would spend
        // a throttled provider call every minute for as long as it lasts.
        return phaseAgeMs < 5 * MINUTE ? MINUTE : 5 * MINUTE;
      case "awaiting_dns":
        // The user is the blocker either way. Escalating keeps a 72-hour wait
        // from costing hundreds of DescribeCertificate calls (pre-issuance) or
        // from spinning on a DNS lookup (post-attach).
        if (phaseAgeMs < 30 * MINUTE) return 5 * MINUTE;
        if (phaseAgeMs < 6 * HOUR) return 15 * MINUTE;
        return 60 * MINUTE;
      case "provisioning":
        // The record is visible and ACM is validating: minutes, so this is the
        // one phase worth watching closely.
        return 2 * MINUTE;
      case "attaching":
        // A CloudFront distribution update takes 5-20 minutes.
        return 5 * MINUTE;
      default:
        return assertNever(state, "pollIntervalMs(aws)");
    }
  }

  switch (state) {
    case "pending":
      return phaseAgeMs < 5 * MINUTE ? MINUTE : 5 * MINUTE;
    case "awaiting_dns":
      // Google re-checks on its own schedule; polling faster tells us nothing.
      return 15 * MINUTE;
    case "provisioning":
      // 15-60 minutes is typical for a Google-managed certificate.
      return 10 * MINUTE;
    case "attaching":
      // Not written by any current GCP path (`gcp.ts` writes only live /
      // failed / awaiting_dns / provisioning), but the 0075 CHECK permits it
      // and the sweep's filter admits it, so the pair gets a value rather
      // than falling to a default. Matches the AWS tier.
      return 5 * MINUTE;
    default:
      return assertNever(state, "pollIntervalMs(gcp)");
  }
}

/**
 * Which clock a deadline is measured against.
 *
 * One clock cannot carry both a phase budget and a provider budget: a phase
 * entry resets the phase clock, and a provider's window does not care. An AWS
 * domain whose validation record resolves intermittently would otherwise
 * ping-pong `awaiting_dns → provisioning → awaiting_dns`, re-stamp the phase
 * clock on every hop, and never time out — while ACM silently discarded the
 * certificate at the real 72-hour mark.
 */
export type DeadlineClock = "phase" | "created" | "issued";

export interface CertDeadline {
  ms: number;
  clock: DeadlineClock;
  /** `false` means "revert to an earlier state", not "give up". */
  terminal: boolean;
}

/**
 * The give-up budget for a (cloud, state) pair, or `null`.
 *
 * `null` has exactly ONE meaning: "poll on the cadence, never time out". The
 * sweep skips the deadline comparison entirely for such a row. It never falls
 * back to {@link CERT_DEADLINE_MS} and never treats `null` as expired.
 *
 * After this revision no input produces `null` — all nine pairs have a budget.
 * The type keeps it because a future pair may legitimately want cadence only.
 */
export function certDeadlineMs(
  cloud: StaticCloud,
  state: PollableCertState,
  status: string,
): CertDeadline | null {
  if (cloud === "aws") {
    switch (state) {
      case "pending":
        // A row rests here only while the reconcile keeps failing TRANSIENTLY
        // — a permanent failure now writes `failed` — and 30 minutes of that
        // is a condition a human needs to look at.
        //
        // The PHASE clock, not bare `created_at`: on a first attempt the chain
        // resolves to `created_at` so the budget is the same, but resume sets
        // `pending` with a fresh phase clock, and a `created_at` budget would
        // re-expire an hours-old resumed row on the very next sweep and make
        // the Resume button useless.
        return { ms: 30 * MINUTE, clock: "phase", terminal: true };
      case "awaiting_dns":
        return status === "active"
          ? // The post-attach routing wait starts when the certificate was
            // issued, and `issued_at` is never re-stamped by a phase change.
            { ms: 72 * HOUR, clock: "issued", terminal: true }
          : // ACM's own PENDING_VALIDATION discard window, counted from when
            // the row and the request came into existence. A phase revert must
            // not reset it.
            { ms: 72 * HOUR, clock: "created", terminal: true };
      case "provisioning":
        // NOT terminal: reverts to awaiting_dns. The 72-hour ACM budget is not
        // reset by that revert, because it reads `created_at`.
        return { ms: 2 * HOUR, clock: "phase", terminal: false };
      case "attaching":
        return { ms: 90 * MINUTE, clock: "phase", terminal: true };
      default:
        return assertNever(state, "certDeadlineMs(aws)");
    }
  }

  switch (state) {
    case "pending":
      return { ms: 30 * MINUTE, clock: "phase", terminal: true };
    case "awaiting_dns":
      return { ms: 72 * HOUR, clock: "created", terminal: true };
    case "provisioning":
      // Google validates by reaching the load balancer at the domain, so this
      // measures how long it has had a live A record.
      return { ms: 24 * HOUR, clock: "phase", terminal: true };
    case "attaching":
      // Unreachable today; present to make the table total.
      return { ms: 90 * MINUTE, clock: "phase", terminal: true };
    default:
      return assertNever(state, "certDeadlineMs(gcp)");
  }
}

/** The four states the sweep polls, as a runtime list for the candidate query. */
export const POLLABLE_CERT_STATES: readonly PollableCertState[] = [
  "pending",
  "awaiting_dns",
  "provisioning",
  "attaching",
];

/** Narrow a persisted state into {@link PollableCertState}, or `null`. */
export function asPollableState(state: string): PollableCertState | null {
  return (POLLABLE_CERT_STATES as readonly string[]).includes(state)
    ? (state as PollableCertState)
    : null;
}
