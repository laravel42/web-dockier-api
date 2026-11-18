/**
 * "Monitor with heartbeats" for scheduled jobs.
 *
 * The flag used to be stored and nothing else: no heartbeat, no URL, no ping, so
 * a job that stopped running alerted nobody. Now the job owns an observe
 * heartbeat, pings it after every successful run, and a missed run is reported
 * by the observe service's missed-ping sweep like any other heartbeat.
 */
import {
  createHeartbeat,
  deleteHeartbeat,
  setHeartbeatWaiting,
} from "../../../shared/service-clients/heartbeats.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import type { ScheduledJobRow } from "../schemas.js";
import { ProcessesError } from "./processes.js";
import { shQuote } from "./scripts.js";

/**
 * Heartbeat schedule per job frequency. On reboot and a custom cron expression
 * have no fixed interval, so the sweep could never tell a missed run from a late
 * one; monitoring is refused for them rather than offered and silent.
 */
const MONITORED: Record<string, { frequency: string; gracePeriod: string }> = {
  every_minute: { frequency: "every_minute", gracePeriod: "after_5_minutes" },
  hourly: { frequency: "hourly", gracePeriod: "after_5_minutes" },
  nightly: { frequency: "daily", gracePeriod: "after_1_hour" },
  weekly: { frequency: "weekly", gracePeriod: "after_1_hour" },
  monthly: { frequency: "monthly", gracePeriod: "after_1_hour" },
};

export const UNMONITORABLE_MESSAGE =
  "Heartbeat monitoring needs a fixed schedule, so it is not available for On reboot or a custom cron expression.";

export function assertMonitorable(frequency: string, monitor: boolean): void {
  if (monitor && !MONITORED[frequency]) throw new ProcessesError(UNMONITORABLE_MESSAGE, "bad_request");
}

/** The heartbeat id inside a ping URL we generated (`…/heartbeats/<uuid>/ping`). */
export function heartbeatIdFromUrl(url: string | null): string | null {
  return url?.match(/\/heartbeats\/([0-9a-f-]{36})\/ping$/i)?.[1] ?? null;
}

/**
 * The line cron runs. With monitoring, a successful run (`&&`) pings the
 * heartbeat. curl, else wget: images ship one or the other. Ping failures are
 * silenced so a monitoring outage never fails the job itself.
 */
export function jobCronCommand(job: Pick<ScheduledJobRow, "command" | "monitor_heartbeat" | "heartbeat_url">): string {
  if (!job.monitor_heartbeat || !job.heartbeat_url) return job.command;
  const url = shQuote(job.heartbeat_url);
  const ping = `{ curl -fsS -m 10 -o /dev/null ${url} || wget -q -T 10 -O /dev/null ${url}; } >/dev/null 2>&1`;
  return `${job.command} && ${ping}`;
}

async function dropHeartbeat(tenantId: string, projectId: string, heartbeatId: string): Promise<void> {
  // Already gone (deleted from Observe) is fine: the goal is that it no longer exists.
  await deleteHeartbeat({ tenantId, projectId, heartbeatId }).catch((err: unknown) =>
    logger.warn({ err: getErrMsg(err), heartbeatId }, "[scheduler] Could not delete the job's heartbeat"),
  );
}

/**
 * Make the job's heartbeat match its settings, and return the row as stored.
 * A changed frequency gets a fresh heartbeat (and URL): the caller reinstalls the
 * cron line, so the old URL is never pinged again.
 */
export async function syncJobHeartbeat(job: ScheduledJobRow, frequencyChanged: boolean): Promise<ScheduledJobRow> {
  const current = heartbeatIdFromUrl(job.heartbeat_url);
  const wanted = job.monitor_heartbeat ? MONITORED[job.frequency] : undefined;
  if (current && (!wanted || frequencyChanged)) await dropHeartbeat(job.organization_id, job.project_id, current);
  if (current && wanted && !frequencyChanged) return job;

  let heartbeatUrl: string | null = null;
  if (wanted) {
    const hb = await createHeartbeat({
      tenantId: job.organization_id,
      projectId: job.project_id,
      name: `Scheduled job: ${job.name}`,
      frequency: wanted.frequency,
      gracePeriod: wanted.gracePeriod,
    });
    heartbeatUrl = hb.pingUrl;
  }
  if (heartbeatUrl === job.heartbeat_url) return job;

  const { data, error } = await supabaseAdmin
    .from("scheduled_jobs")
    .update({ heartbeat_url: heartbeatUrl })
    .eq("id", job.id)
    .select()
    .single();
  if (error || !data) throw new ProcessesError("Failed to save the job's heartbeat", "internal");
  return data as ScheduledJobRow;
}

/**
 * Which of a project's heartbeats belong to a scheduled job, keyed by heartbeat id,
 * for the Observe list. One query for the project, not one per heartbeat. Jobs per
 * project are few (one cron line each), well under the 1000-row cap.
 */
export async function listJobsOwningHeartbeats(
  tenantId: string,
  projectId: string,
): Promise<Map<string, { id: string; name: string }>> {
  const { data, error } = await supabaseAdmin
    .from("scheduled_jobs")
    .select("id,name,heartbeat_url")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .not("heartbeat_url", "is", null);
  if (error) throw new ProcessesError("Failed to list the project's monitored jobs", "internal");
  const owners = new Map<string, { id: string; name: string }>();
  for (const job of data ?? []) {
    const heartbeatId = heartbeatIdFromUrl(job.heartbeat_url);
    if (heartbeatId) owners.set(heartbeatId, { id: job.id, name: job.name });
  }
  return owners;
}

/**
 * The scheduled job whose monitoring owns this heartbeat, if any. Observe refuses
 * to delete such a heartbeat: the job would keep pinging a URL that no longer
 * exists, looking monitored while nothing watched it.
 */
export async function findJobOwningHeartbeat(
  tenantId: string,
  heartbeatId: string,
): Promise<{ id: string; name: string } | null> {
  // heartbeatId is a validated UUID (route schema), so it carries no LIKE wildcards.
  const { data, error } = await supabaseAdmin
    .from("scheduled_jobs")
    .select("id,name")
    .eq("organization_id", tenantId)
    .like("heartbeat_url", `%/heartbeats/${heartbeatId}/ping`)
    .limit(1)
    .maybeSingle();
  if (error) throw new ProcessesError("Failed to check the heartbeat's scheduled job", "internal");
  return data;
}

/** Before deleting the job. */
export async function removeJobHeartbeat(job: ScheduledJobRow): Promise<void> {
  const id = heartbeatIdFromUrl(job.heartbeat_url);
  if (id) await dropHeartbeat(job.organization_id, job.project_id, id);
}

/** A paused job does not run, so its heartbeat must not report missed runs. */
export async function pauseJobHeartbeat(job: ScheduledJobRow): Promise<void> {
  const id = heartbeatIdFromUrl(job.heartbeat_url);
  if (!id) return;
  await setHeartbeatWaiting({ tenantId: job.organization_id, heartbeatId: id }).catch((err: unknown) =>
    logger.warn({ err: getErrMsg(err), heartbeatId: id }, "[scheduler] Could not pause the job's heartbeat"),
  );
}
