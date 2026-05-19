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

/**
 * Insert default roles for a tenant. Idempotent — skips if roles already exist.
 */
export async function seedDefaultRoles(appId: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("app_id", appId)
    .limit(1);

  if (existing && existing.length > 0) return;

  const now = new Date().toISOString();
  const rows = DEFAULT_ROLES.map((role) => ({
    id: randomUUID(),
    app_id: appId,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    created_at: now,
  }));

  await supabaseAdmin.from("roles").insert(rows);
}
