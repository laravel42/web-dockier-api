import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList, deleteOrThrow, selectAllRows } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import { emit } from "../../../shared/events.js";
import { logger } from "../../../shared/logger.js";
import type { HeartbeatRow } from "../schemas.js";
import { rowToHeartbeat, type HeartbeatResponse } from "./mappers.js";

export type { HeartbeatResponse };

export const HeartbeatsError = createDomainErrorClass<"not_found" | "bad_request" | "internal">("HeartbeatsError");
export type HeartbeatsError = InstanceType<typeof HeartbeatsError>;

export async function createHeartbeat(params: {
  tenantId: string;
  projectId: string;
  name: string;
  frequency: string;
  gracePeriod: string;
}): Promise<HeartbeatResponse> {
  const { tenantId, projectId, name, frequency, gracePeriod } = params;

  const { data, error } = await supabaseAdmin
    .from("heartbeats")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      name,
      frequency,
      grace_period: gracePeriod,
      status: "waiting",
    })
    .select()
    .single();

  const row = unwrapQuery(data, error, HeartbeatsError, { internalMsg: "Failed to create heartbeat" });

  return rowToHeartbeat(row as HeartbeatRow);
}

export async function listHeartbeats(params: {
  tenantId: string;
  projectId: string;
}): Promise<{ heartbeats: HeartbeatResponse[] }> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("heartbeats")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const rows = unwrapList(data, error, HeartbeatsError, { internalMsg: "Failed to list heartbeats" });

  return {
    heartbeats: rows.map((row) => rowToHeartbeat(row as HeartbeatRow)),
  };
}

export async function deleteHeartbeat(params: {
  tenantId: string;
  projectId: string;
  heartbeatId: string;
}): Promise<void> {
  const { tenantId, projectId, heartbeatId } = params;

  await deleteOrThrow(
    supabaseAdmin
      .from("heartbeats")
      .delete({ count: "exact" })
      .eq("organization_id", tenantId)
      .eq("project_id", projectId)
      .eq("id", heartbeatId),
    HeartbeatsError,
    { notFoundMsg: "Heartbeat not found", internalMsg: "Failed to delete heartbeat" },
  );
}

/**
 * Public ping endpoint — updates the heartbeat status and last_pinged_at.
 * No authentication required (used by external cron jobs).
 */
export async function pingHeartbeat(heartbeatId: string): Promise<void> {
  const { data: current, error: fetchError } = await supabaseAdmin
    .from("heartbeats")
    .select("status, organization_id, project_id, name")
    .eq("id", heartbeatId)
    .single();

  const heartbeat = unwrapQuery(current, fetchError, HeartbeatsError, { notFoundMsg: "Heartbeat not found" });

  const { error: updateError } = await supabaseAdmin
    .from("heartbeats")
    .update({
      status: "healthy",
      last_pinged_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", heartbeatId);

  throwOnError(updateError, HeartbeatsError, { internalMsg: "Failed to update heartbeat" });

  if (heartbeat.status === "missed") {
    const { recordActivity } = await import("./activity.js");
    await recordActivity({
      tenantId: heartbeat.organization_id,
      projectId: heartbeat.project_id,
      eventType: "heartbeat_recovered",
      description: `Heartbeat "${heartbeat.name}" recovered`,
    });
  }
}

// ─── Missed-ping sweep ─────────────────────────────────────────────

const MINUTE = 60_000;

/** Expected time between pings. `custom` has no stored interval, so it is never judged. */
const FREQUENCY_MS: Record<string, number> = {
  every_minute: MINUTE,
  every_5_minutes: 5 * MINUTE,
  every_10_minutes: 10 * MINUTE,
  every_15_minutes: 15 * MINUTE,
  every_30_minutes: 30 * MINUTE,
  hourly: 60 * MINUTE,
  daily: 24 * 60 * MINUTE,
  weekly: 7 * 24 * 60 * MINUTE,
  // shortcut: 31 days, the longest month, so a job on the 1st never alarms falsely; a missed February run is reported up to 3 days late. Upgrade to calendar months if that matters.
  monthly: 31 * 24 * 60 * MINUTE,
};

const GRACE_MS: Record<string, number> = {
  after_1_minute: MINUTE,
  after_5_minutes: 5 * MINUTE,
  after_10_minutes: 10 * MINUTE,
  after_15_minutes: 15 * MINUTE,
  after_30_minutes: 30 * MINUTE,
  after_1_hour: 60 * MINUTE,
};

type SweepRow = Pick<HeartbeatRow, "id" | "organization_id" | "project_id" | "name" | "frequency" | "grace_period" | "last_pinged_at">;

/** When a healthy heartbeat counts as missed, or null when it cannot be judged. */
export function missedAt(row: Pick<SweepRow, "frequency" | "grace_period" | "last_pinged_at">): number | null {
  const interval = FREQUENCY_MS[row.frequency];
  if (!interval || !row.last_pinged_at) return null;
  return Date.parse(row.last_pinged_at) + interval + (GRACE_MS[row.grace_period] ?? 0);
}

/**
 * Flip every overdue `healthy` heartbeat to `missed`, record it and notify the tenant.
 *
 * Only `healthy` ones are judged: a `waiting` heartbeat has never pinged, so its
 * job may simply not be set up yet, and alerting on it would be noise. The update
 * is conditional on the `last_pinged_at` that was read, so a ping landing between
 * the read and the write wins and nothing is reported.
 */
export async function markMissedHeartbeats(now = Date.now()): Promise<number> {
  const { data, error } = await selectAllRows<SweepRow>(() =>
    supabaseAdmin
      .from("heartbeats")
      .select("id, organization_id, project_id, name, frequency, grace_period, last_pinged_at")
      .eq("status", "healthy")
      .order("id"),
  );
  throwOnError(error, HeartbeatsError, { internalMsg: "Failed to list heartbeats to check" });

  let missed = 0;
  for (const row of data) {
    const deadline = missedAt(row);
    if (deadline === null || now <= deadline) continue;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("heartbeats")
      .update({ status: "missed", updated_at: nowIso() })
      .eq("id", row.id)
      .eq("status", "healthy")
      .eq("last_pinged_at", row.last_pinged_at!)
      .select("id");
    if (updateError) {
      // One bad row must not stop the rest of the sweep; the next minute retries it.
      logger.warn({ err: updateError, heartbeatId: row.id }, "[observe] could not mark heartbeat missed");
      continue;
    }
    if (!updated?.length) continue;

    missed += 1;
    const { safeRecordActivity } = await import("./activity.js");
    safeRecordActivity({
      tenantId: row.organization_id,
      projectId: row.project_id,
      eventType: "heartbeat_missed",
      description: `Heartbeat "${row.name}" missed`,
    });
    emit("notification:send", {
      tenantId: row.organization_id,
      title: "Heartbeat missed",
      message: `Heartbeat "${row.name}" did not ping in time. Last ping: ${row.last_pinged_at}.`,
    });
  }
  return missed;
}
