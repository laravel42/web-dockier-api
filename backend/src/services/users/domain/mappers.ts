export function rowToUser(row: {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  country: string | null;
  language: string | null;
  timezone: string | null;
  organization_id: string | null;
  created_at: string;
}) {
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
