import type { PMIntegrationRow } from "./pm-integrations.js";

export function rowToSummary(row: Pick<PMIntegrationRow, "id" | "provider" | "name" | "enabled" | "created_at">) {
  return {
    id: row.id,
    type: row.provider,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}
