import type { ActivityRow, HeartbeatRow } from "../schemas.js";
import type { z } from "zod";
import type { activityEventTypeSchema, heartbeatFrequencySchema, heartbeatGracePeriodSchema, heartbeatStatusSchema } from "../schemas.js";

type ActivityEventType = z.infer<typeof activityEventTypeSchema>;
type HeartbeatFrequency = z.infer<typeof heartbeatFrequencySchema>;
type HeartbeatGracePeriod = z.infer<typeof heartbeatGracePeriodSchema>;
type HeartbeatStatus = z.infer<typeof heartbeatStatusSchema>;

// ─── Activity ──────────────────────────────────────────────────────

export interface ActivityResponse {
  id: string;
  projectId: string;
  userId: string | null;
  actorName: string | null;
  eventType: ActivityEventType;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export function rowToActivity(row: ActivityRow & { actor_name?: string | null }): ActivityResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    actorName: row.actor_name ?? null,
    eventType: row.event_type as ActivityEventType,
    description: row.description,
    metadata: (row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata))
      ? row.metadata as Record<string, unknown>
      : undefined,
    createdAt: row.created_at,
  };
}

// ─── Heartbeats ────────────────────────────────────────────────────

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

export function rowToHeartbeat(row: HeartbeatRow): HeartbeatResponse {
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
