/**
 * One pass over every certificate still waiting on something.
 *
 * Makes NO provider calls. It reads the table, decides which rows are due or
 * past a deadline, and enqueues the existing `domain-apply` job for the
 * projects that need one. The state machine is not reimplemented here — the
 * reconcilers already own it.
 *
 * THE SWEEP IS THE ONLY WRITER OF THE POLL CLOCK. For every row it deems due
 * it calls `touchCertPolled` BEFORE enqueueing, and even if the enqueue then
 * throws. This is not an optimisation: several reconcile paths return without
 * writing anything — the deadline path, a thrown reconcile, the schema-drift
 * case where the write path itself is broken, and an unresolvable target
 * ("redeploy once"). Were the clock left to the reconcile, each of those would
 * leave `updated_at` untouched and re-enqueue that project every minute,
 * forever, which is the exact provider-call cost the cadence table exists to
 * bound. A row the sweep deems NOT due is not touched — only a look costs a
 * touch.
 */

import { logger } from "../../../../shared/logger.js";
import { enqueueDomainApply } from "../../../../shared/workers/config-apply.js";
import {
  asPollableState,
  certDeadlineMs,
  pollIntervalMs,
  type DeadlineClock,
  type StaticCloud,
} from "./deadlines.js";
import {
  listCertRowsForPoll,
  setCertState,
  touchCertPolled,
  type PollCandidateRow,
} from "./certs.js";

export interface SweepSummary {
  considered: number;
  due: number;
  timedOut: number;
  reverted: number;
  skipped: number;
  enqueuedProjects: number;
}

function parseMs(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Resolve the clock a deadline names.
 *
 * Every chain terminates at `created_at`, which is `NOT NULL` in the schema, so
 * a row can never be left with no clock to measure against.
 */
function clockFor(row: PollCandidateRow, clock: DeadlineClock): number | null {
  const phase = parseMs(row.attachStartedAt);
  const created = parseMs(row.createdAt);
  const issued = parseMs(row.issuedAt);

  switch (clock) {
    case "phase":
      return phase ?? created;
    case "issued":
      return issued ?? phase ?? created;
    case "created":
      return created;
  }
}

/** `acm` → aws, `gcp_managed` → gcp. Total over the query's own type filter. */
function cloudFor(row: PollCandidateRow): StaticCloud {
  return row.type === "acm" ? "aws" : "gcp";
}

function timedOutMessage(cloud: StaticCloud, state: string, status: string, host: string): string {
  if (state === "pending") {
    return cloud === "aws"
      ? `Dockier has not been able to request a certificate for ${host}. Open the project's Deployments tab, check that its last deploy succeeded, then choose Resume.`
      : `Dockier has not been able to set up HTTPS for ${host}. Open the project's Deployments tab, check that its last deploy succeeded, then choose Resume.`;
  }

  if (state === "attaching") {
    return cloud === "aws"
      ? `The CloudFront update for ${host} has not finished after 90 minutes, which usually means the site's CloudFormation stack is stuck or rolled back. Open the project's Deployments tab, redeploy once, then choose Resume.`
      : `The load balancer update for ${host} has not finished after 90 minutes. Open the project's Deployments tab, redeploy once, then choose Resume.`;
  }

  if (cloud === "gcp") {
    return state === "provisioning"
      ? `Google has not issued the certificate for ${host} within 24 hours. Check that the A record points at this project's load balancer IP and that the domain's CAA records permit Google to issue certificates, then choose Resume.`
      : `Google never saw a working A record for ${host}. Publish the record shown here and choose Resume.`;
  }

  // AWS awaiting_dns, split on whether the certificate was ever issued.
  return status === "active"
    ? `${host} has a valid certificate attached to the CDN, but the routing record still does not point at it, so nothing is being served. Publish the routing record shown here and choose Resume.`
    : `AWS never saw the validation record for ${host}, and has now discarded the certificate request. The record was probably never published, or was published with a changed name. Publish the record shown here and choose Resume to request a new certificate.`;
}

/**
 * Run one sweep pass.
 *
 * Never throws: each row is processed in its own try/catch so one bad row
 * cannot abort the pass, and the whole function reports rather than rejecting.
 */
export async function runCertPollSweep(now = Date.now()): Promise<SweepSummary> {
  const summary: SweepSummary = {
    considered: 0,
    due: 0,
    timedOut: 0,
    reverted: 0,
    skipped: 0,
    enqueuedProjects: 0,
  };

  const candidates = await listCertRowsForPoll();
  if (!candidates.ok) {
    logger.error(
      { kind: candidates.failure.kind, detail: candidates.failure.detail },
      "[domains:poll] could not read poll candidates; skipping this sweep",
    );
    return summary;
  }

  summary.considered = candidates.rows.length;
  /** Enqueue once per project, however many of its domains are due. */
  const dueProjects = new Map<string, { tenantId: string; projectId: string }>();

  for (const row of candidates.rows) {
    try {
      const state = asPollableState(row.verificationState);
      if (!state) {
        // Never poll on a guessed interval. A row holding a state outside the
        // union is a hand-edited row or a future writer, and a lenient default
        // is what hid this class of bug before.
        summary.skipped += 1;
        logger.error(
          { certificateId: row.id, state: row.verificationState, type: row.type },
          "[domains:poll] skipping row with a state the sweep has no cadence for",
        );
        continue;
      }

      const cloud = cloudFor(row);
      const deadline = certDeadlineMs(cloud, state, row.status);

      // `null` means "poll on the cadence, never time out" — the comparison is
      // skipped entirely rather than falling back to any other budget.
      if (deadline) {
        const startedAt = clockFor(row, deadline.clock);
        if (startedAt !== null && now - startedAt > deadline.ms) {
          if (deadline.terminal) {
            await setCertState(
              row.id,
              {
                verificationState: "timed_out",
                verificationMessage: timedOutMessage(cloud, state, row.status, row.domainName),
              },
              row.verificationState,
            );
            summary.timedOut += 1;
          } else {
            // AWS `provisioning`: revert rather than give up. The 72-hour ACM
            // budget is not reset by this, because it reads `created_at`.
            await setCertState(
              row.id,
              {
                verificationState: "awaiting_dns",
                verificationMessage:
                  `The validation record for ${row.domainName} is visible but AWS has not issued the certificate. ` +
                  "Check that its value matches exactly, including any trailing dot your registrar adds.",
              },
              row.verificationState,
            );
            summary.reverted += 1;
          }
          continue;
        }
      }

      const phaseStart = clockFor(row, "phase");
      const phaseAgeMs = phaseStart === null ? 0 : now - phaseStart;
      const lastSeen = parseMs(row.updatedAt);
      const interval = pollIntervalMs(cloud, state, row.status, phaseAgeMs);

      // A row with no `updated_at` at all is treated as due.
      const due = lastSeen === null || now - lastSeen >= interval;
      if (!due) continue;

      summary.due += 1;
      // Before the enqueue, and regardless of whether it succeeds.
      await touchCertPolled(row.id);
      dueProjects.set(row.projectId, {
        tenantId: row.organizationId,
        projectId: row.projectId,
      });
    } catch (err) {
      // One row's failure never aborts the sweep.
      summary.skipped += 1;
      logger.error({ err, certificateId: row.id }, "[domains:poll] row failed during sweep");
    }
  }

  for (const { tenantId, projectId } of dueProjects.values()) {
    try {
      await enqueueDomainApply(tenantId, projectId);
      summary.enqueuedProjects += 1;
    } catch (err) {
      // The clock was already touched, so a broken queue cannot turn into a
      // per-minute enqueue storm.
      logger.error({ err, projectId }, "[domains:poll] could not enqueue domain apply");
    }
  }

  return summary;
}
