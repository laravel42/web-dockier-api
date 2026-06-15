import { projectConfigSchema } from "../schemas.js";

export function rowToProject(row: {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connection_id: string | null;
  platform: string | null;
  source_type: string | null;
  template: string | null;
  config: unknown;
  created_at: string;
}) {
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
    createdAt: row.created_at,
  };
}
