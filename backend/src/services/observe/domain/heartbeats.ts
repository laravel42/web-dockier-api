import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
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

  const { error, count } = await supabaseAdmin
    .from("heartbeats")
    .delete({ count: "exact" })
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .eq("id", heartbeatId);

  throwOnError(error, HeartbeatsError, { internalMsg: "Failed to delete heartbeat" });

  if (count === 0) {
    throw new HeartbeatsError("Heartbeat not found", "not_found");
  }
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
      last_pinged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
