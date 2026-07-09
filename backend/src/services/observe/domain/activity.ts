import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { ActivityRow } from "../schemas.js";
import type { z } from "zod";
import type { activityEventTypeSchema } from "../schemas.js";

type ActivityEventType = z.infer<typeof activityEventTypeSchema>;

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

function rowToActivity(row: ActivityRow & { actor_name?: string | null }): ActivityResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    actorName: row.actor_name ?? null,
    eventType: row.event_type as ActivityEventType,
    description: row.description,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
  };
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function listActivity(params: {
  tenantId: string;
  projectId: string;
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<{ activity: ActivityResponse[]; total: number }> {
  const { tenantId, projectId, limit = 50, offset = 0, search } = params;

  let query = supabaseAdmin
    .from("project_activity")
    .select("*, users!project_activity_user_id_fkey(name)", { count: "exact" })
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("description", `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw httpError(500, error.message);
  }

  return {
    activity: (data || []).map((row) => {
      const userJoin = (row as Record<string, unknown>).users as { name?: string } | null;
      const activityRow: ActivityRow & { actor_name?: string | null } = {
        ...(row as unknown as ActivityRow),
        actor_name: userJoin?.name ?? null,
      };
      return rowToActivity(activityRow);
    }),
    total: count ?? 0,
  };
}

/**
 * Record a new activity event for a project.
 * Used internally by other services (deploy, commands, etc.)
 */
export async function recordActivity(params: {
  tenantId: string;
  projectId: string;
  userId?: string;
  eventType: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { tenantId, projectId, userId, eventType, description, metadata } = params;

  const { error } = await supabaseAdmin.from("project_activity").insert({
    organization_id: tenantId,
    project_id: projectId,
    user_id: userId ?? null,
    event_type: eventType,
    description,
    metadata: (metadata ?? {}) as unknown as import("../../../shared/supabase/types.js").Json,
  });

  if (error) {
    throw httpError(500, error.message);
  }
}
