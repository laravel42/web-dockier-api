/**
 * Cron that turns overdue heartbeats into "missed". Without it nothing ever
 * judged a late ping, so the status never left "healthy" and no alert was sent.
 *
 * Same shape as `shared/workers/cert-poll.ts`: one schedule, the table is the
 * source of truth, and register() must run before schedule() (the schedule has
 * a foreign key to the queue row that register() creates).
 */

import { HEARTBEAT_CHECK_QUEUE, createWorker, getQueue, isQueueReady } from "../../../shared/database/queue.js";
import { logger } from "../../../shared/logger.js";
import { markMissedHeartbeats } from "./heartbeats.js";

const HEARTBEAT_CHECK_SCHEDULE_KEY = "heartbeat-check-sweep";

const heartbeatCheckWorker = createWorker<Record<string, never>>(
  HEARTBEAT_CHECK_QUEUE,
  async () => {
    const missed = await markMissedHeartbeats();
    if (missed > 0) logger.info({ missed }, "[observe] heartbeats marked missed");
  },
  // Idempotent sweep re-derived from the table every minute: no retries, no dead letters worth keeping.
  { retryLimit: 1, expireInSeconds: 120, pollingIntervalSeconds: 5, deadLetter: false },
);

export async function registerHeartbeatCheckWorker(): Promise<void> {
  await heartbeatCheckWorker.register();
  if (!isQueueReady()) return;
  const boss = getQueue();
  if (!boss) return;
  try {
    await boss.schedule(HEARTBEAT_CHECK_QUEUE, "* * * * *", {}, {
      key: HEARTBEAT_CHECK_SCHEDULE_KEY,
      singletonKey: HEARTBEAT_CHECK_SCHEDULE_KEY,
    });
  } catch (err) {
    // Not fatal: without the schedule heartbeats only stop alerting, as before.
    logger.error({ err }, "[observe] could not install the heartbeat check schedule");
  }
}
