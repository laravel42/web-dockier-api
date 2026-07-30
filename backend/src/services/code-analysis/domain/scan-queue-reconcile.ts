import pg from "pg";
import { getQueue, SECURITY_SCAN_QUEUE } from "../../../shared/database/queue.js";
import { getPostgresConnectionConfig } from "../../../shared/database/postgres.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { env } from "../../../shared/config.js";

interface ActiveJobRow {
  id: string;
  data: { scanId?: string };
  started_on: string;
}

/** Running scans must heartbeat within this window (see scan-worker heartbeat). */
const HEARTBEAT_STALE_MS = 90 * 1000;

async function listActiveScanJobs(): Promise<ActiveJobRow[]> {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) return [];

  const client = new pg.Client(getPostgresConnectionConfig(databaseUrl));
  try {
    await client.connect();
    const { rows } = await client.query<ActiveJobRow>(
      `SELECT id, data, started_on::text AS started_on
       FROM pgboss.job
       WHERE name = $1 AND state = 'active'`,
      [SECURITY_SCAN_QUEUE],
    );
    return rows;
  } finally {
    await client.end();
  }
}

async function shouldCancelJob(scanId: string, startedOn: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("scans")
    .select("status,updated_at")
    .eq("id", scanId)
    .single();

  if (error || !data) return true;

  if (data.status === "completed" || data.status === "failed") return true;

  const updatedAgeMs = Date.now() - new Date(data.updated_at).getTime();
  if (data.status === "running" && updatedAgeMs > HEARTBEAT_STALE_MS) return true;

  const startedAgeMs = Date.now() - new Date(startedOn).getTime();
  if (data.status === "pending" && startedAgeMs > 5 * 60 * 1000) return true;

  return false;
}

/**
 * Cancel pg-boss jobs left active after a server crash or killed worker.
 * Call on startup before registering workers.
 */
export async function reconcileStaleScanJobs(): Promise<number> {
  const queue = getQueue();
  if (!queue) return 0;

  const jobs = await listActiveScanJobs();
  let cancelled = 0;

  for (const job of jobs) {
    const scanId = job.data?.scanId;
    if (!scanId) continue;

    if (!(await shouldCancelJob(scanId, job.started_on))) continue;

    try {
      await queue.cancel(SECURITY_SCAN_QUEUE, job.id);
      cancelled++;
      logger.info(`[security-scan] Cancelled stale active job ${job.id} (scan ${scanId.slice(0, 8)})`);
    } catch (err) {
      logger.error({ err }, `[security-scan] Failed to cancel job ${job.id}`);
    }
  }

  return cancelled;
}
