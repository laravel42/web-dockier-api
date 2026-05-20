/**
 * Permission Registry
 *
 * All permission keys used in the application.
 * These are the source of truth — the database `permissions` table
 * is seeded from these constants.
 *
 * Format: resource:action (colon notation, singular resource names)
 */

export const PERMISSIONS = {
  // Project
  PROJECT_VIEW: "project:view",
  PROJECT_CREATE: "project:create",
  PROJECT_MANAGE: "project:manage",
  PROJECT_DELETE: "project:delete",

  // Deploy
  DEPLOY_VIEW: "deploy:view",
  DEPLOY_CREATE: "deploy:create",
  DEPLOY_MANAGE: "deploy:manage",

  // Scan
  SCAN_VIEW: "scan:view",
  SCAN_RUN: "scan:run",
  SCAN_MANAGE: "scan:manage",
  SCAN_CREATE_ISSUE: "scan:create_issue",
  SCAN_CREATE_MR: "scan:create_mr",

  // User
  USER_VIEW: "user:view",
  USER_MANAGE: "user:manage",
  USER_DELETE: "user:delete",

  // Roles
  ROLE_VIEW: "role:view",
  ROLE_MANAGE: "role:manage",

  // Credential (server providers, git connections)
  CREDENTIAL_VIEW: "credential:view",
  CREDENTIAL_MANAGE: "credential:manage",

  // Notification
  NOTIFICATION_VIEW: "notification:view",
  NOTIFICATION_MANAGE: "notification:manage",
  NOTIFICATION_SEND: "notification:send",

  // Billing
  BILLING_VIEW: "billing:view",
  BILLING_MANAGE: "billing:manage",

  // Organization (owner-only, enforced via requireOwner middleware)
  ORGANIZATION_MANAGE: "organization:manage",
  ORGANIZATION_DELETE: "organization:delete",
  OWNERSHIP_TRANSFER: "ownership:transfer",

  // Team
  TEAM_VIEW: "team:view",
  TEAM_CREATE: "team:create",
  TEAM_DELETE: "team:delete",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * All permission keys as an array — used for seeding and validation.
 */
export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/**
 * Permission metadata for seeding the `permissions` table.
 */
export interface PermissionDefinition {
  key: PermissionKey;
  resource: string;
  action: string;
  description: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Project
  { key: PERMISSIONS.PROJECT_VIEW, resource: "project", action: "view", description: "View projects and their details" },
  { key: PERMISSIONS.PROJECT_CREATE, resource: "project", action: "create", description: "Create new projects" },
  { key: PERMISSIONS.PROJECT_MANAGE, resource: "project", action: "manage", description: "Update project settings and configuration" },
  { key: PERMISSIONS.PROJECT_DELETE, resource: "project", action: "delete", description: "Delete projects" },

  // Deploy
  { key: PERMISSIONS.DEPLOY_VIEW, resource: "deploy", action: "view", description: "View deployments and their status" },
  { key: PERMISSIONS.DEPLOY_CREATE, resource: "deploy", action: "create", description: "Create and trigger deployments" },
  { key: PERMISSIONS.DEPLOY_MANAGE, resource: "deploy", action: "manage", description: "Manage and destroy deployments" },

  // Scan
  { key: PERMISSIONS.SCAN_VIEW, resource: "scan", action: "view", description: "View security scan results" },
  { key: PERMISSIONS.SCAN_RUN, resource: "scan", action: "run", description: "Trigger security scans" },
  { key: PERMISSIONS.SCAN_MANAGE, resource: "scan", action: "manage", description: "Manage scan rules and configuration" },
  { key: PERMISSIONS.SCAN_CREATE_ISSUE, resource: "scan", action: "create_issue", description: "Create issues from scan findings" },
  { key: PERMISSIONS.SCAN_CREATE_MR, resource: "scan", action: "create_mr", description: "Create fix merge requests from findings" },

  // User
  { key: PERMISSIONS.USER_VIEW, resource: "user", action: "view", description: "View user profiles" },
  { key: PERMISSIONS.USER_MANAGE, resource: "user", action: "manage", description: "Manage user accounts and roles" },
  { key: PERMISSIONS.USER_DELETE, resource: "user", action: "delete", description: "Delete user accounts" },

  // Roles
  { key: PERMISSIONS.ROLE_VIEW, resource: "role", action: "view", description: "View roles and their permissions" },
  { key: PERMISSIONS.ROLE_MANAGE, resource: "role", action: "manage", description: "Create, edit, and delete roles" },

  // Credential
  { key: PERMISSIONS.CREDENTIAL_VIEW, resource: "credential", action: "view", description: "View server provider credentials and git connections" },
  { key: PERMISSIONS.CREDENTIAL_MANAGE, resource: "credential", action: "manage", description: "Manage server provider credentials and git connections" },

  // Notification
  { key: PERMISSIONS.NOTIFICATION_VIEW, resource: "notification", action: "view", description: "View notifications and channels" },
  { key: PERMISSIONS.NOTIFICATION_MANAGE, resource: "notification", action: "manage", description: "Manage notification channels and settings" },
  { key: PERMISSIONS.NOTIFICATION_SEND, resource: "notification", action: "send", description: "Send notifications" },

  // Billing
  { key: PERMISSIONS.BILLING_VIEW, resource: "billing", action: "view", description: "View billing and subscription" },
  { key: PERMISSIONS.BILLING_MANAGE, resource: "billing", action: "manage", description: "Manage billing and subscription" },

  // Organization (owner-only)
  { key: PERMISSIONS.ORGANIZATION_MANAGE, resource: "organization", action: "manage", description: "Manage organization settings (owner-only)" },
  { key: PERMISSIONS.ORGANIZATION_DELETE, resource: "organization", action: "delete", description: "Delete the organization (owner-only)" },
  { key: PERMISSIONS.OWNERSHIP_TRANSFER, resource: "ownership", action: "transfer", description: "Transfer organization ownership (owner-only)" },

  // Team
  { key: PERMISSIONS.TEAM_VIEW, resource: "team", action: "view", description: "View teams" },
  { key: PERMISSIONS.TEAM_CREATE, resource: "team", action: "create", description: "Create teams" },
  { key: PERMISSIONS.TEAM_DELETE, resource: "team", action: "delete", description: "Delete teams" },
];

/**
 * Critical permissions that require special handling.
 * These cannot be assigned by users who don't already possess them.
 */
export const CRITICAL_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.ORGANIZATION_DELETE,
  PERMISSIONS.OWNERSHIP_TRANSFER,
  PERMISSIONS.BILLING_MANAGE,
  PERMISSIONS.ROLE_MANAGE,
];
