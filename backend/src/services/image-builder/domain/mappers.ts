export function rowToBuild(row: any) {
  return {
    id: row.id,
    codebuildId: row.codebuild_id ?? "",
    sourceRepo: row.source_repo ?? "",
    sourceRef: row.source_ref ?? "",
    commitSha: row.commit_sha ?? "",
    imageUri: row.image_uri ?? "",
    status: row.status,
    statusReason: row.status_reason ?? "",
    logsUrl: row.logs_url ?? "",
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags ?? [],
    buildMetadata: typeof row.build_metadata === "string" ? JSON.parse(row.build_metadata) : row.build_metadata ?? {},
    startedAt: row.started_at ?? "",
    finishedAt: row.finished_at ?? "",
    createdAt: row.created_at,
  };
}
