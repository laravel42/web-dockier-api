import type { PermissionKey } from "./permissions";

export type NavIconName =
  | "dashboard"
  | "projects"
  | "deploy"
  | "security"
  | "settings"
  | "notifications";

export interface NavItemConfig {
  to: string;
  label: string;
  shortLabel?: string;
  icon: NavIconName;
  /** Match pathname exactly (e.g. dashboard home) */
  exact?: boolean;
  /** When set, nav item is hidden unless the user has this permission */
  permission?: PermissionKey;
}

/**
 * Main nav items, in display order. Rendered by TopNavbar as a flat list.
 *
 * Project-centric IA: Projects is the home and the only top-level destination.
 * Deployments and Security are viewed inside each project; account Settings
 * lives in the profile menu. Legacy /deploy, /security and /settings routes
 * still exist (reachable directly) — they are just no longer top-level nav.
 */
export const sidebarNavItems: NavItemConfig[] = [
  { to: "/projects", label: "Projects", icon: "projects" },
];

export function isNavItemActive(pathname: string, item: NavItemConfig): boolean {
  if (item.exact) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
