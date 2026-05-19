/**
 * Built-in role identifiers.
 *
 * These roles are seeded in the database via migration 0034_seed_static_roles.sql.
 * They cannot be deleted through the API.
 */
export const BUILT_IN_ROLE_IDS = ["admin", "member"] as const;
