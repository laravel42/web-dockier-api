import type { TableRow } from "../../../shared/supabase/types.js";

type UserRow = TableRow<"users">;

/**
 * Map a database user row (snake_case) to the API response shape (camelCase).
 *
 * Accepts a Pick of the full UserRow so it works with both full rows and
 * partial selects (e.g., select("id,email,name,...")).
 */
export function rowToUser(row: Pick<UserRow, "id" | "email" | "name" | "avatar_url" | "country" | "language" | "timezone" | "organization_id" | "created_at">) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    country: row.country ?? "",
    language: row.language ?? "en",
    timezone: row.timezone ?? "UTC",
    tenantId: row.organization_id,
    createdAt: row.created_at,
  };
}
