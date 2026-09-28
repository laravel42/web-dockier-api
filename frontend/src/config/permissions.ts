/**
 * Canonical permission vocabulary for the frontend.
 *
 * Mirrors `backend/src/shared/permissions/constants.ts`. The backend validates
 * incoming permission keys against its own registry with `z.enum`, so a typo
 * here surfaces as a 400 on role create/update — but typing `has()` against
 * this union catches it at compile time instead.
 */
export const PERMISSION_KEYS = [
  "project:view",
  "project:create",
  "project:manage",
  "project:delete",
  "deploy:view",
  "deploy:create",
  "deploy:manage",
  "scan:view",
  "scan:run",
  "scan:manage",
  "scan:create_issue",
  "scan:create_mr",
  "user:view",
  "user:manage",
  "user:delete",
  "role:view",
  "role:manage",
  "credential:view",
  "credential:manage",
  "notification:view",
  "notification:manage",
  "notification:send",
  "billing:view",
  "billing:manage",
  "organization:manage",
  "organization:delete",
  "ownership:transfer",
  "team:view",
  "team:create",
  "team:delete",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export interface PermissionItem {
  key: PermissionKey;
  /** Human-readable description. Shown as the primary label in the role editor. */
  label: string;
  /**
   * Baseline permission: every role implicitly holds it, so the checkbox is
   * rendered locked. Enforced server-side by `BASELINE_PERMISSIONS`.
   */
  locked?: boolean;
}

export interface PermissionGroup {
  name: string;
  permissions: PermissionItem[];
}

export interface PermissionSection {
  name: string;
  description: string;
  groups: PermissionGroup[];
}

/**
 * Permission catalogue for the role editor, grouped to match the product's
 * navigation rather than the backend's resource names — so "this role gets
 * Security" is legible at a glance.
 *
 * Deliberately omitted:
 *   `team:*` — no Teams feature exists and no backend route enforces these
 *     keys, so showing the toggles would promise behaviour that never happens.
 *   `organization:*` / `ownership:transfer` — owner-only, enforced through
 *     `requireOwner` rather than role permissions, so they are not assignable.
 */
export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    name: "Workspace",
    description: "Day-to-day access to the product surfaces.",
    groups: [
      {
        name: "Projects",
        permissions: [
          { key: "project:view", label: "View projects and their details" },
          { key: "project:create", label: "Create new projects" },
          { key: "project:manage", label: "Update project settings and configuration" },
          { key: "project:delete", label: "Delete projects" },
        ],
      },
      {
        name: "Deploy",
        permissions: [
          { key: "deploy:view", label: "View deployments and their status" },
          { key: "deploy:create", label: "Create and trigger deployments" },
          { key: "deploy:manage", label: "Manage and destroy deployments" },
        ],
      },
      {
        name: "Security",
        permissions: [
          { key: "scan:view", label: "View security scan results" },
          { key: "scan:run", label: "Run security scans" },
          { key: "scan:manage", label: "Manage scan rules and configuration" },
          { key: "scan:create_issue", label: "Create issues from scan findings" },
          { key: "scan:create_mr", label: "Create fix merge requests from findings" },
        ],
      },
    ],
  },
  {
    name: "Administration",
    description: "Who belongs to the organization and what they can do.",
    groups: [
      {
        name: "Users",
        permissions: [
          { key: "user:view", label: "View user profiles" },
          { key: "user:manage", label: "Manage user accounts and role assignments" },
          { key: "user:delete", label: "Delete user accounts" },
        ],
      },
      {
        name: "Roles",
        permissions: [
          { key: "role:view", label: "View roles and their permissions", locked: true },
          { key: "role:manage", label: "Create, edit, and delete roles" },
        ],
      },
      {
        name: "Billing",
        permissions: [
          { key: "billing:view", label: "View billing and subscription" },
          { key: "billing:manage", label: "Manage billing and subscription" },
        ],
      },
    ],
  },
  {
    name: "Configuration",
    description: "Connections and delivery settings behind the workspace.",
    groups: [
      {
        name: "Credentials",
        permissions: [
          { key: "credential:view", label: "View server providers and git connections", locked: true },
          { key: "credential:manage", label: "Manage server providers and git connections" },
        ],
      },
      {
        name: "Notifications",
        permissions: [
          { key: "notification:view", label: "View notifications and channels" },
          { key: "notification:manage", label: "Manage notification channels and settings" },
          { key: "notification:send", label: "Send notifications" },
        ],
      },
    ],
  },
];

/** Flat list of every group across all sections. */
export const PERMISSION_GROUPS: PermissionGroup[] = PERMISSION_SECTIONS.flatMap((s) => s.groups);

/** Flat list of every permission the role editor can toggle or lock. */
export const ASSIGNABLE_PERMISSIONS: PermissionItem[] = PERMISSION_GROUPS.flatMap((g) => g.permissions);

/** Keys the role editor renders. Anything outside this set is preserved untouched on save. */
export const ASSIGNABLE_PERMISSION_KEYS: string[] = ASSIGNABLE_PERMISSIONS.map((p) => p.key);

/** Baseline keys — locked on, always submitted. Mirrors backend `BASELINE_PERMISSIONS`. */
export const BASELINE_PERMISSION_KEYS: string[] = ASSIGNABLE_PERMISSIONS
  .filter((p) => p.locked)
  .map((p) => p.key);
