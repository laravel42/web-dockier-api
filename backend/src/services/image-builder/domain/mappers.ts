import type { Database } from "../../../shared/supabase/types.js";
import type { BuildStatus } from "../schemas.js";

type BuildRow = Database["public"]["Tables"]["builds"]["Row"];

/**
 * Accepts both full query rows and freshly-built insert payloads, which omit
 * the started_at/finished_at/codebuild_id fields (populated once the build
 * runs) and are read here with `?? ""` fallbacks.
 */
type BuildRowInput = Partial<BuildRow> & Pick<BuildRow, "id" | "status" | "created_at">;

export function rowToBuild(row: BuildRowInput) {
  return {
    id: row.id,
    codebuildId: row.codebuild_id ?? "",
    sourceRepo: row.source_repo ?? "",
    sourceRef: row.source_ref ?? "",
    commitSha: row.commit_sha ?? "",
    imageUri: row.image_uri ?? "",
    status: row.status as BuildStatus,
    statusReason: row.status_reason ?? "",
    logsUrl: row.logs_url ?? "",
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags ?? [],
    buildMetadata: typeof row.build_metadata === "string" ? JSON.parse(row.build_metadata) : row.build_metadata ?? {},
    startedAt: row.started_at ?? "",
    finishedAt: row.finished_at ?? "",
    createdAt: row.created_at,
  };
}
