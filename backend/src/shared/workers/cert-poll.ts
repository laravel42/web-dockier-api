/**
 * The heartbeat that drives certificate polling.
 *
 * One pg-boss cron schedule, not per-certificate self-rescheduling jobs. A
 * per-certificate job would give exact per-row timing but needs its own
 * recovery story for a job lost to a crash or a retention expiry — and
 * `idx_ssl_certificates_pending_verification` exists precisely so a sweep can
 * find the truth in the table instead. The TABLE is the source of truth; the
 * schedule is only a heartbeat.
 *
 * The cron is every minute, because cron granularity is one minute and the
 * sweep's tightest tier is one minute. An every-other-minute cron would
 * silently round every interval up to the next even minute.
 */

import { CERT_POLL_QUEUE, createWorker, getQueue, isQueueReady } from "../database/queue.js";
import { logger } from "../logger.js";
import { runCertPollSweep } from "../../services/domains/domain/static/poll-sweep.js";

/**
 * A schedule's identity is `(name, key)`, so passing `key` makes repeated
 * installation an upsert rather than a duplicate across split instances.
 */
const CERT_POLL_SCHEDULE_KEY = "cert-poll-sweep";

const certPollWorker = createWorker<Record<string, never>>(
  CERT_POLL_QUEUE,
  async () => {
    const summary = await runCertPollSweep();
    // Only log when the sweep actually did something, so a steady-state
    // installation does not write a line every minute forever.
    if (summary.considered > 0) {
      logger.info({ ...summary }, "[domains:poll] sweep complete");
    }
  },
  {
    // A sweep is cheap and idempotent; the next heartbeat is a better retry
    // than pg-boss's.
    retryLimit: 1,
    expireInSeconds: 120,
    pollingIntervalSeconds: 5,
  },
);

async function scheduleCertPollSweep(): Promise<void> {
  const boss = getQueue();
  if (!boss) return;

  try {
    await boss.schedule(
      CERT_POLL_QUEUE,
      "* * * * *",
      {},
      {
        key: CERT_POLL_SCHEDULE_KEY,
        // Applies to the jobs the schedule SENDS, collapsing two sweeps that
        // land in the same minute.
        singletonKey: CERT_POLL_SCHEDULE_KEY,
      },
    );
    logger.info("[domains:poll] sweep schedule installed");
  } catch (err) {
    // Deliberately not fatal. A missing schedule degrades to today's manual
    // behaviour — the user clicks Check now — whereas a thrown startup is an
    // outage.
    logger.error({ err }, "[domains:poll] could not install the sweep schedule");
  }
}

/**
 * Register the worker and THEN install the schedule. The order matters.
 *
 * `pgboss.schedule` has a foreign key to the queue row, and pg-boss rewrites
 * the violation to the unhelpful `Queue cert-poll not found`. `createWorker`'s
 * `register()` is what creates that row, and `run-server.ts` runs `onStartup`
 * hooks BEFORE `register` — so installing the schedule from an `onStartup`
 * hook would throw on every first deploy. This registry entry therefore has no
 * `onStartup` hook at all.
 */
export async function registerCertPollWorker(): Promise<void> {
  await certPollWorker.register();
  if (!isQueueReady()) return;
  await scheduleCertPollSweep();
}

export { CERT_POLL_SCHEDULE_KEY };
