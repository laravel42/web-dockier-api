import type { Database } from "../../../shared/supabase/types.js";
import type { BuildStatus } from "../schemas.js";

type BuildRow = Database["public"]["Tables"]["builds"]["Row"];

/**
 * Typed shape of the `build_metadata` JSON field stored in the `builds` table.
 *
 * Fields are populated at different lifecycle stages:
 * - Build creation: runtime, containerPort, deployTarget, deployParams, buildspecPreview
 * - Deploy completion: appUrl, stackName
 *
 * Additional dynamic keys from deploy params may also be present, hence the
 * index signature.
 */
export interface BuildMetadata {
  /** Inferred runtime (e.g. "node", "php", "python", "go") */
  runtime?: string;
  /** Container port as string (e.g. "3000") */
  containerPort?: string;
  /** Deploy target (e.g. "ecs", "ec2", "s3") */
  deployTarget?: string;
  /** Stringified JSON of deploy parameters */
  deployParams?: string;
  /** Buildspec YAML preview */
  buildspecPreview?: string;
  /** Deployed application URL (set after successful deploy) */
  appUrl?: string;
  /** CloudFormation stack name (set after successful deploy) */
  stackName?: string;
  /** Image URI resolved during deploy */
  imageUri?: string;
  /** Additional dynamic deploy parameters */
  [key: string]: string | undefined;
}

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
    buildMetadata: (typeof row.build_metadata === "string" ? JSON.parse(row.build_metadata) : row.build_metadata ?? {}) as BuildMetadata,
    startedAt: row.started_at ?? "",
    finishedAt: row.finished_at ?? "",
    createdAt: row.created_at,
  };
}
