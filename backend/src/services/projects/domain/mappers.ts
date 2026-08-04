import type { TableRow } from "../../../shared/supabase/types.js";
import { projectConfigSchema, projectSettingsSchema } from "../schemas.js";

type ProjectRow = TableRow<"projects">;

/**
 * Map a database project row (snake_case) to the API response shape (camelCase).
 *
 * Accepts a Pick of the full ProjectRow so it works with both full rows and
 * partial selects (the `.select("id,name,repository,...")` pattern).
 */
type InfraState = "none" | "live" | "torn_down";

function toInfraState(value: string | null | undefined): InfraState {
  return value === "live" || value === "torn_down" ? value : "none";
}

export function rowToProject(
  row: Pick<ProjectRow, "id" | "name" | "repository" | "branch" | "connection_id" | "platform" | "source_type" | "template" | "config" | "settings" | "created_at"> &
    Partial<Pick<ProjectRow, "infra_state">>,
  lastCommitHash = "",
) {
  return {
    id: row.id,
    name: row.name,
    repository: row.repository,
    branch: row.branch,
    connectionId: row.connection_id ?? "",
    platform: row.platform ?? "",
    sourceType: row.source_type ?? "repository",
    template: row.template ?? "",
    config: projectConfigSchema.parse(row.config ?? {}),
    settings: projectSettingsSchema.parse(row.settings ?? {}),
    infraState: toInfraState(row.infra_state),
    lastCommitHash,
    createdAt: row.created_at,
  };
}
