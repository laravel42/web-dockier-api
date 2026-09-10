import type { TableRow } from "../../../shared/supabase/types.js";
import { SYSTEM_ROLE_KEYS } from "../../../shared/permissions/role-templates.js";

type RoleRow = TableRow<"roles">;

/** Display columns needed to build a RoleResponse. */
export type RoleDisplayRow = Pick<
  RoleRow,
  "id" | "name" | "description" | "system_key" | "is_system" | "is_editable" | "is_deletable"
>;

/**
 * The Admin role is never deletable regardless of its stored `is_deletable`
 * flag; every other role defers to the stored value.
 */
function resolveIsDeletable(systemKey: string | null, isDeletable: boolean): boolean {
  return systemKey !== SYSTEM_ROLE_KEYS.ADMIN && isDeletable;
}

/**
 * Map a database role row (snake_case) plus its resolved permission keys to the
 * API response shape (camelCase).
 *
 * Permissions are passed in explicitly because they come from a separate
 * `role_permissions` query rather than the role row itself.
 */
export function rowToRole(row: RoleDisplayRow, permissions: string[]) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemKey: row.system_key ?? null,
    isSystem: row.is_system,
    isEditable: row.is_editable,
    isDeletable: resolveIsDeletable(row.system_key ?? null, row.is_deletable),
    permissions,
  };
}
