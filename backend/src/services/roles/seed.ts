/**
 * Seed default roles for a tenant.
 *
 * Called during organization creation to give each tenant their own
 * copy of the role templates that they can customize freely.
 *
 * Also seeds the global `permissions` table if not already populated.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { PERMISSION_DEFINITIONS } from "../../shared/permissions/constants.js";
import { DEFAULT_ROLE_TEMPLATES, SYSTEM_ROLE_KEYS } from "../../shared/permissions/role-templates.js";

export interface SeededRoles {
  adminRoleId: string;
  memberRoleId: string;
}

/**
 * Ensure all permission definitions exist in the `permissions` table.
 * Uses upsert so it's idempotent.
 */
export async function seedPermissions(): Promise<void> {
  const rows = PERMISSION_DEFINITIONS.map((def) => ({
    id: def.key, // Use the key as the ID for simplicity
    key: def.key,
    resource: def.resource,
    action: def.action,
    description: def.description,
  }));

  await supabaseAdmin.from("permissions").upsert(rows, { onConflict: "key", ignoreDuplicates: true });
}

/**
 * Seed default roles for an organization.
 *
 * Creates org-scoped role rows from the backend templates and assigns
 * permissions via the `role_permissions` join table.
 *
 * Idempotent: if a role with the same system_key already exists for
 * this org, it is not overwritten.
 */
export async function seedDefaultRoles(organizationId: string): Promise<SeededRoles> {
  // Ensure permissions exist first
  await seedPermissions();

  const roleIds: Record<string, string> = {};

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const roleId = randomUUID();

    // Check if role already exists for this org+system_key
    const { data: existing } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("system_key", template.systemKey)
      .is("deleted_at", null)
      .maybeSingle();

    let finalRoleId: string;

    if (existing) {
      finalRoleId = existing.id;
    } else {
      const { error } = await supabaseAdmin.from("roles").insert({
        id: roleId,
        organization_id: organizationId,
        name: template.name,
        description: template.description,
        system_key: template.systemKey,
        is_system: template.isSystem,
        is_editable: template.isEditable,
        is_deletable: template.isDeletable,
      });
      if (error) {
        // Race condition: another request created it. Fetch the existing one.
        const { data: raceExisting } = await supabaseAdmin
          .from("roles")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("system_key", template.systemKey)
          .is("deleted_at", null)
          .maybeSingle();
        finalRoleId = raceExisting?.id ?? roleId;
      } else {
        finalRoleId = roleId;
      }

      // Seed role_permissions for this role
      const permRows = template.permissions.map((permKey) => ({
        role_id: finalRoleId,
        permission_id: permKey, // permission.id === permission.key
      }));

      if (permRows.length > 0) {
        await supabaseAdmin
          .from("role_permissions")
          .upsert(permRows, { onConflict: "role_id,permission_id", ignoreDuplicates: true });
      }
    }

    roleIds[template.systemKey] = finalRoleId;
  }

  return {
    adminRoleId: roleIds[SYSTEM_ROLE_KEYS.ADMIN] ?? "",
    memberRoleId: roleIds[SYSTEM_ROLE_KEYS.MEMBER] ?? "",
  };
}
