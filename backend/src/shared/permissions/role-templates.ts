/**
 * Default Role Templates
 *
 * These are backend-owned blueprints. During organization creation,
 * each template is copied into org-scoped rows in the `roles` table
 * with corresponding `role_permissions` entries.
 *
 * Organizations can customize their copies freely without affecting
 * other tenants or the templates themselves.
 */

import { PERMISSIONS, type PermissionKey } from "./constants.js";

export interface RoleTemplate {
  /** Stable identifier — stored in roles.system_key */
  systemKey: string;
  /** Default display name */
  name: string;
  /** Default description */
  description: string;
  /** Whether this role is a system role (cannot be deleted) */
  isSystem: boolean;
  /** Whether the role's permissions can be edited by tenant admins */
  isEditable: boolean;
  /** Whether the role can be deleted by tenant admins */
  isDeletable: boolean;
  /** Permissions granted to this role */
  permissions: PermissionKey[];
  /** Hierarchy level (lower = more powerful). Used for escalation prevention. */
  hierarchyLevel: number;
}

/**
 * System keys for built-in roles.
 * Used to identify roles created from templates regardless of name changes.
 */
export const SYSTEM_ROLE_KEYS = {
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS];

/**
 * Default role templates — ordered by hierarchy (most powerful first).
 */
export const DEFAULT_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    systemKey: SYSTEM_ROLE_KEYS.ADMIN,
    name: "Admin",
    description: "Full operational management of the organization including members, roles, and all resources.",
    isSystem: true,
    isEditable: true,
    isDeletable: false,
    hierarchyLevel: 0,
    permissions: [
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.PROJECT_MANAGE,
      PERMISSIONS.PROJECT_DELETE,
      PERMISSIONS.DEPLOY_VIEW,
      PERMISSIONS.DEPLOY_CREATE,
      PERMISSIONS.DEPLOY_MANAGE,
      PERMISSIONS.SCAN_VIEW,
      PERMISSIONS.SCAN_RUN,
      PERMISSIONS.SCAN_MANAGE,
      PERMISSIONS.SCAN_CREATE_ISSUE,
      PERMISSIONS.SCAN_CREATE_MR,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.USER_MANAGE,
      PERMISSIONS.USER_DELETE,
      PERMISSIONS.ROLE_VIEW,
      PERMISSIONS.ROLE_MANAGE,
      PERMISSIONS.CREDENTIAL_VIEW,
      PERMISSIONS.CREDENTIAL_MANAGE,
      PERMISSIONS.NOTIFICATION_VIEW,
      PERMISSIONS.NOTIFICATION_MANAGE,
      PERMISSIONS.NOTIFICATION_SEND,
      PERMISSIONS.BILLING_VIEW,
      PERMISSIONS.BILLING_MANAGE,
      PERMISSIONS.TEAM_VIEW,
      PERMISSIONS.TEAM_CREATE,
      PERMISSIONS.TEAM_DELETE,
    ],
  },
  {
    systemKey: SYSTEM_ROLE_KEYS.MEMBER,
    name: "Member",
    description: "Standard access to view and work with projects, deployments, and scans.",
    isSystem: true,
    isEditable: true,
    isDeletable: false,
    hierarchyLevel: 1,
    permissions: [
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.PROJECT_MANAGE,
      PERMISSIONS.DEPLOY_VIEW,
      PERMISSIONS.DEPLOY_CREATE,
      PERMISSIONS.SCAN_VIEW,
      PERMISSIONS.SCAN_RUN,
      PERMISSIONS.SCAN_CREATE_ISSUE,
      PERMISSIONS.SCAN_CREATE_MR,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.ROLE_VIEW,
      PERMISSIONS.CREDENTIAL_VIEW,
      PERMISSIONS.NOTIFICATION_VIEW,
      PERMISSIONS.TEAM_VIEW,
    ],
  },
];

/**
 * Get a role template by system key.
 */
export function getRoleTemplate(systemKey: SystemRoleKey): RoleTemplate | undefined {
  return DEFAULT_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey);
}

/**
 * Get the hierarchy level for a system key.
 * Returns Infinity for unknown keys (least powerful).
 */
export function getHierarchyLevel(systemKey: string | null): number {
  if (!systemKey) return Infinity;
  const template = DEFAULT_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey);
  return template?.hierarchyLevel ?? Infinity;
}
