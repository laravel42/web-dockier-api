import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { HeartbeatRow } from "../schemas.js";
import type { z } from "zod";
import type { heartbeatFrequencySchema, heartbeatGracePeriodSchema, heartbeatStatusSchema } from "../schemas.js";

type HeartbeatFrequency = z.infer<typeof heartbeatFrequencySchema>;
type HeartbeatGracePeriod = z.infer<typeof heartbeatGracePeriodSchema>;
type HeartbeatStatus = z.infer<typeof heartbeatStatusSchema>;

export interface HeartbeatResponse {
  id: string;
  projectId: string;
  name: string;
  frequency: HeartbeatFrequency;
  gracePeriod: HeartbeatGracePeriod;
  status: HeartbeatStatus;
  lastPingedAt: string | null;
  pingUrl: string;
  createdAt: string;
  updatedAt: string;
}

function buildPingUrl(heartbeatId: string): string {
  const base = process.env.API_PUBLIC_URL || "https://api.dockier.dev";
  return `${base}/heartbeats/${heartbeatId}/ping`;
}

function rowToHeartbeat(row: HeartbeatRow): HeartbeatResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    frequency: row.frequency as HeartbeatFrequency,
    gracePeriod: row.grace_period as HeartbeatGracePeriod,
    status: row.status as HeartbeatStatus,
    lastPingedAt: row.last_pinged_at,
    pingUrl: buildPingUrl(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function createHeartbeat(params: {
  tenantId: string;
  projectId: string;
  name: string;
  frequency: string;
  gracePeriod: string;
}): Promise<HeartbeatResponse> {
  const { tenantId, projectId, name, frequency, gracePeriod } = params;

  // Validate the project belongs to this tenant
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();

  if (projectError || !project) {
    throw httpError(404, "Project not found");
  }

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

  if (error || !data) {
    throw httpError(500, error?.message || "Failed to create heartbeat");
  }

  return rowToHeartbeat(data as HeartbeatRow);
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

  if (error) {
    throw httpError(500, error.message);
  }

  return {
    heartbeats: (data || []).map((row) => rowToHeartbeat(row as HeartbeatRow)),
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

  if (error) {
    throw httpError(500, error.message);
  }

  if (count === 0) {
    throw httpError(404, "Heartbeat not found");
  }
}

/**
 * Public ping endpoint — updates the heartbeat status and last_pinged_at.
 * No authentication required (used by external cron jobs).
 */
export async function pingHeartbeat(heartbeatId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("heartbeats")
    .update({
      status: "healthy",
      last_pinged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", heartbeatId)
    .select("id");

  if (error) {
    throw httpError(500, error.message);
  }

  if (!data || data.length === 0) {
    throw httpError(404, "Heartbeat not found");
  }
}
