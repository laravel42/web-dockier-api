/**
 * Seed default roles for a new tenant.
 *
 * Called during organization creation to give each tenant their own
 * copy of the admin/member roles that they can customize freely.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../shared/supabase/client.js";

const DEFAULT_ROLES = [
  {
    name: "Admin",
    description: "Can manage tenant settings, users, memberships, and projects.",
    permissions: [
      "tenant.manage",
      "membership.manage",
      "project.manage",
      "user.manage",
      "user:view",
      "user:manage",
      "deploy:view",
      "deploy:create",
      "project:delete",
      "credential:manage",
      "notification:manage",
      "organization:manage",
      "scan:manage",
    ],
  },
  {
    name: "Member",
    description: "Can access tenant resources within assigned organization scope.",
    permissions: ["project.read", "user.read", "user:view", "deploy:view"],
  },
];

export interface SeededRoles {
  adminRoleId: string;
  memberRoleId: string;
}

/**
 * Ensure default roles exist for a tenant. Uses upsert on (organization_id, name)
 * so it's atomic, idempotent, and handles partial seeding (e.g., if only
 * one default role exists).
 *
 * Returns the admin and member role IDs.
 */
export async function seedDefaultRoles(organizationId: string): Promise<SeededRoles> {
  const now = new Date().toISOString();
  const adminId = randomUUID();
  const memberId = randomUUID();

  const rows = [
    { id: adminId, organization_id: organizationId, name: DEFAULT_ROLES[0].name, description: DEFAULT_ROLES[0].description, permissions: DEFAULT_ROLES[0].permissions, created_at: now },
    { id: memberId, organization_id: organizationId, name: DEFAULT_ROLES[1].name, description: DEFAULT_ROLES[1].description, permissions: DEFAULT_ROLES[1].permissions, created_at: now },
  ];

  // Upsert on (organization_id, name) — if the role already exists, don't overwrite it.
  // ignoreDuplicates ensures existing rows keep their current id/permissions.
  await supabaseAdmin.from("roles").upsert(rows, { onConflict: "organization_id,name", ignoreDuplicates: true });

  // Fetch the actual IDs (may differ from adminId/memberId if rows already existed)
  const { data: seeded } = await supabaseAdmin
    .from("roles")
    .select("id,name")
    .eq("organization_id", organizationId)
    .in("name", [DEFAULT_ROLES[0].name, DEFAULT_ROLES[1].name]);

  const adminRole = seeded?.find((r) => r.name === DEFAULT_ROLES[0].name);
  const memberRole = seeded?.find((r) => r.name === DEFAULT_ROLES[1].name);

  return {
    adminRoleId: adminRole?.id ?? "",
    memberRoleId: memberRole?.id ?? adminRole?.id ?? "",
  };
}
