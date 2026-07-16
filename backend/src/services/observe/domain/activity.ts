import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapList } from "../../../shared/supabase/query.js";
import type { ActivityRow } from "../schemas.js";
import { rowToActivity, type ActivityResponse } from "./mappers.js";

export type { ActivityResponse };

export const ActivityError = createDomainErrorClass<"not_found" | "bad_request" | "internal">("ActivityError");
export type ActivityError = InstanceType<typeof ActivityError>;

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

  const rows = unwrapList(data, error, ActivityError, { internalMsg: "Failed to list activity" });

  return {
    activity: rows.map((row) => {
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

  throwOnError(error, ActivityError, { internalMsg: "Failed to record activity" });
}
